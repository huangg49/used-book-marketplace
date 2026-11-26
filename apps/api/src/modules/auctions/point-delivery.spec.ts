import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PointOrderDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DELIVERY_SERVICE_AREA,
  deliveryPrice,
  deliverySnapshot,
} from './point-delivery.js';
import {
  GHN_LIVE_POLICY_CODE,
  LOCALITY_TARIFFS,
  POINT_ZONE_FALLBACK_POLICY_CODE,
  PointDeliveryPricingService,
} from './point-delivery-pricing.service.js';
import { VIETNAM_63_PROVINCES } from './vietnam-provinces-tariffs.js';
import {
  POINT_DELIVERY_FEE,
  POINT_DELIVERY_POLICY,
} from '../../database/mongo/migrations/0093-split-direct-and-point-shipping-policies.js';
import { FREE_SHIPPING_POLICY } from '../../database/mongo/migrations/0052-free-shipping.js';

function makeTx(
  selections: Record<string, string>,
  policies: Record<string, { _id: string; shippingFee: number }>,
  localityCode = 'DEMO-A',
) {
  return {
    c: {
      member_addresses: {
        findOne: vi.fn().mockResolvedValue({
          _id: 'addr-1',
          ownerId: 'buyer-1',
          version: 2,
          recipientName: 'Nguyễn Văn A',
          phone: '0901234567',
          serviceAreaCode: DELIVERY_SERVICE_AREA,
          localityCode,
          detail: '123 Đường Láng, Ba Đình',
        }),
      },
      sale_quote_policy_selection: {
        findOne: vi.fn(({ _id }: { _id: string }) =>
          Promise.resolve(
            selections[_id] ? { _id, policyCode: selections[_id] } : null,
          ),
        ),
      },
      sale_quote_policies: {
        findOne: vi.fn(({ _id }: { _id: string }) =>
          Promise.resolve(policies[_id] ?? null),
        ),
      },
    },
  } as unknown as Tx;
}

const order = {
  _id: 'order-1',
  buyerId: 'buyer-1',
  bookPrice: 500_000,
} as PointOrderDoc;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GHN_FEE_LIVE;
});

describe('point delivery hybrid pricing (GHN live + regional zone fallback)', () => {
  it('uses pre-resolved live GHN fee inside transaction when address version and price match', async () => {
    const tx = makeTx(
      {
        DirectSale: FREE_SHIPPING_POLICY,
        PointDelivery: POINT_DELIVERY_POLICY,
      },
      {
        [FREE_SHIPPING_POLICY]: { _id: FREE_SHIPPING_POLICY, shippingFee: 0 },
        [POINT_DELIVERY_POLICY]: {
          _id: POINT_DELIVERY_POLICY,
          shippingFee: POINT_DELIVERY_FEE,
        },
      },
      'VN-HN',
    );

    const snap = await deliverySnapshot(
      tx,
      order,
      {
        expectedVersion: 1,
        fulfillmentMethod: 'CarrierOutbound',
        destinationAddressId: 'ADDR-1',
        expectedDestinationAddressVersion: 2,
        expectedOutboundFee: 34_000,
      },
      new Date('2026-11-27T00:00:00Z'),
      'receipt-1',
      {
        addressId: 'addr-1',
        addressVersion: 2,
        bookPrice: 500_000,
        fee: 34_000,
        policyCode: GHN_LIVE_POLICY_CODE,
        source: 'GHN',
      },
    );

    expect(snap.outboundFee).toBe(34_000);
    expect(snap.policyCode).toBe(GHN_LIVE_POLICY_CODE);
  });

  it('rejects payment with 409 when expectedOutboundFee does not match resolved fee', async () => {
    const tx = makeTx(
      {
        DirectSale: FREE_SHIPPING_POLICY,
        PointDelivery: POINT_DELIVERY_POLICY,
      },
      {
        [POINT_DELIVERY_POLICY]: {
          _id: POINT_DELIVERY_POLICY,
          shippingFee: POINT_DELIVERY_FEE,
        },
      },
      'VN-HN',
    );

    await expect(
      deliverySnapshot(
        tx,
        order,
        {
          expectedVersion: 1,
          fulfillmentMethod: 'CarrierOutbound',
          destinationAddressId: 'addr-1',
          expectedDestinationAddressVersion: 2,
          expectedOutboundFee: 30_000,
        },
        new Date('2026-11-27T00:00:00Z'),
        'receipt-1',
        {
          addressId: 'addr-1',
          addressVersion: 2,
          bookPrice: 500_000,
          fee: 50_000,
          policyCode: POINT_ZONE_FALLBACK_POLICY_CODE,
          source: 'ZoneFallback',
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Phí giao đã thay đổi'),
    });
  });

  it('uses regional zone fallback tariffs (TP.HCM 22k vs Hà Nội 50k) when GHN fails or is disabled', async () => {
    process.env.GHN_FEE_LIVE = 'true';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network timeout')),
    );

    const pricing = new PointDeliveryPricingService();
    const hcm = await pricing.resolveFee({
      orderId: 'order-1',
      addressId: 'addr-hcm',
      addressVersion: 1,
      localityCode: 'DEMO-A',
      detail: '10 Nguyễn Huệ, Quận 1',
      bookPrice: 500_000,
      pointCode: 'HCM-DEMO-01',
      defaultPolicyFee: POINT_DELIVERY_FEE,
      defaultPolicyCode: POINT_DELIVERY_POLICY,
    });
    const hn = await pricing.resolveFee({
      orderId: 'order-1',
      addressId: 'addr-hn',
      addressVersion: 1,
      localityCode: 'VN-HN',
      detail: '12 Kim Mã, Ba Đình',
      bookPrice: 500_000,
      pointCode: 'HCM-DEMO-01',
      defaultPolicyFee: POINT_DELIVERY_FEE,
      defaultPolicyCode: POINT_DELIVERY_POLICY,
    });
    const legacyQ1 = await pricing.resolveFee({
      orderId: 'order-1',
      addressId: 'addr-q1',
      addressVersion: 1,
      localityCode: 'Q1',
      detail: '70 Nguyễn Huệ, Bến Nghé',
      bookPrice: 1_000_000,
      pointCode: 'HCM-DEMO-02',
      defaultPolicyFee: POINT_DELIVERY_FEE,
      defaultPolicyCode: POINT_DELIVERY_POLICY,
    });

    expect(hcm).toEqual({
      fee: 22_000,
      policyCode: POINT_ZONE_FALLBACK_POLICY_CODE,
      source: 'ZoneFallback',
    });
    expect(legacyQ1).toEqual({
      fee: 22_000,
      policyCode: POINT_ZONE_FALLBACK_POLICY_CODE,
      source: 'ZoneFallback',
    });
    expect(hn).toEqual({
      fee: 50_000,
      policyCode: POINT_ZONE_FALLBACK_POLICY_CODE,
      source: 'ZoneFallback',
    });
  });

  it('calls live GHN fee API and caches the result for subsequent payment checks', async () => {
    process.env.GHN_FEE_LIVE = 'true';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 200, data: { total: 44_000 } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const pricing = new PointDeliveryPricingService();
    const first = await pricing.resolveFee({
      orderId: 'order-live',
      addressId: 'addr-hn',
      addressVersion: 1,
      localityCode: 'VN-HN',
      detail: '12 Kim Mã, Ba Đình',
      bookPrice: 2_000_000,
      pointCode: 'HCM-DEMO-01',
      defaultPolicyFee: POINT_DELIVERY_FEE,
      defaultPolicyCode: POINT_DELIVERY_POLICY,
    });
    const second = await pricing.resolveFee({
      orderId: 'order-live',
      addressId: 'addr-hn',
      addressVersion: 1,
      localityCode: 'VN-HN',
      detail: '12 Kim Mã, Ba Đình',
      bookPrice: 2_000_000,
      pointCode: 'HCM-DEMO-01',
      defaultPolicyFee: POINT_DELIVERY_FEE,
      defaultPolicyCode: POINT_DELIVERY_POLICY,
    });

    expect(first).toEqual({
      fee: 44_000,
      policyCode: GHN_LIVE_POLICY_CODE,
      source: 'GHN',
    });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('covers all 63 Vietnam provinces with valid GHN routing and regional fallback tariffs', () => {
    expect(VIETNAM_63_PROVINCES).toHaveLength(63);
    for (const province of VIETNAM_63_PROVINCES) {
      expect(LOCALITY_TARIFFS[province.code]).toEqual({
        districtId: province.districtId,
        wardCode: province.wardCode,
        fallbackFee: province.fallbackFee,
      });
      expect(province.districtId).toBeGreaterThan(0);
      expect(province.wardCode.length).toBeGreaterThan(0);
      expect(province.fallbackFee).toBeGreaterThanOrEqual(22_000);
    }
  });

  it('falls back to DirectSale only when legacy fixtures have no PointDelivery selection', async () => {
    const tx = makeTx(
      { DirectSale: FREE_SHIPPING_POLICY },
      { [FREE_SHIPPING_POLICY]: { _id: FREE_SHIPPING_POLICY, shippingFee: 0 } },
      'DEMO-A',
    );

    const quote = await deliveryPrice(tx, order, 'addr-1');
    expect(quote.policyCode).toBe(FREE_SHIPPING_POLICY);
    expect(quote.fee).toBe(0);
  });
});
