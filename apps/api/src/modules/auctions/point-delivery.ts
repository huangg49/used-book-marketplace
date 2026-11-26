import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { canonicalJson } from '../../common/canonical-json.js';
import type {
  PointOrderDeliveryDoc,
  PointOrderDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  conflict,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  LOCALITY_TARIFFS,
  POINT_ZONE_FALLBACK_POLICY_CODE,
  fallbackFeeForLocality,
  type PointDeliveryFeeResolution,
} from './point-delivery-pricing.service.js';

// ADR 0044 + migration 0093: delivery from a Lật Lại handover point to the
// buyer's saved address uses its dedicated PointDelivery policy (30,000 VND
// pass-through shipping fee), separate from DirectSale (0 VND).
export const DELIVERY_SERVICE_AREA = 'HCM-DEMO-v1';

// The committed demo command stores its milestone in the order-scoped receipt.
// Real carrier state is independent of the last-mile demo.
export async function demoOutForDeliveryAt(tx: Tx, order: PointOrderDoc) {
  if (!order.dispatchedAt) return null;
  const receipt = await tx.c.mutation_receipts.findOne(
    {
      principal: `user:${order.buyerId}`,
      operation: 'demoStartPointDelivery',
      'result.orderId': order._id,
    },
    { projection: { committedAt: 1 } },
  );
  return receipt?.committedAt ?? null;
}

export interface PreResolvedDeliveryFee extends PointDeliveryFeeResolution {
  addressId: string;
  addressVersion: number;
  bookPrice: number;
}

export async function deliveryPrice(
  tx: Tx,
  o: PointOrderDoc,
  addressId: string,
  preResolved?: PreResolvedDeliveryFee | null,
) {
  const address = await tx.c.member_addresses.findOne({
    _id: addressId.toLowerCase(),
    ownerId: o.buyerId,
  });
  if (!address) throw notFound();
  if (address.serviceAreaCode !== DELIVERY_SERVICE_AREA)
    invalidField(
      '/destinationAddressId',
      'Chọn địa chỉ nhận thuộc khu vực giao sách được hỗ trợ.',
    );

  // Use pre-resolved Hybrid GHN/Zone quote computed outside the DB transaction
  // whenever the address version and book price still match the live snapshot.
  if (
    preResolved &&
    preResolved.addressId === address._id &&
    preResolved.addressVersion === address.version &&
    preResolved.bookPrice === o.bookPrice
  ) {
    return {
      address,
      policyCode: preResolved.policyCode,
      fee: preResolved.fee,
    };
  }

  const pointSelection = await tx.c.sale_quote_policy_selection.findOne({
    _id: 'PointDelivery',
  });
  const selection =
    pointSelection ??
    (await tx.c.sale_quote_policy_selection.findOne({
      _id: 'DirectSale',
    }));
  const policy =
    selection &&
    (await tx.c.sale_quote_policies.findOne({ _id: selection.policyCode }));
  if (!policy || policy.shippingFee < 0)
    throw new DomainError(
      503,
      'UNAVAILABLE',
      'Giao sách từ điểm hiện chưa có biểu phí.',
    );

  // When dedicated PointDelivery policy is active, apply regional fallback
  // tariff for known localities (e.g. TP.HCM 22k, Bình Dương/Vũng Tàu 30k, Hà Nội 50k).
  // Legacy fixtures with only DirectSale selection preserve their exact policy fee.
  if (
    pointSelection &&
    address.localityCode &&
    LOCALITY_TARIFFS[address.localityCode]
  ) {
    return {
      address,
      policyCode: POINT_ZONE_FALLBACK_POLICY_CODE,
      fee: fallbackFeeForLocality(address.localityCode, policy.shippingFee),
    };
  }

  return { address, policyCode: policy._id, fee: policy.shippingFee };
}

// Payment body rules: CarrierOutbound names the address, its version and the
// fee the buyer saw; SelfCollect names none of them.
export function deliveryChoice(body: Wire['PayPointOrder']) {
  const method = body.fulfillmentMethod ?? 'SelfCollect';
  const fields = [
    body.destinationAddressId,
    body.expectedDestinationAddressVersion,
    body.expectedOutboundFee,
  ];
  if (method === 'CarrierOutbound' && fields.some((v) => v === undefined))
    invalidField(
      '/destinationAddressId',
      'Chọn địa chỉ nhận và xác nhận phí giao trước khi thanh toán.',
    );
  if (method === 'SelfCollect' && fields.some((v) => v !== undefined))
    invalidField(
      '/fulfillmentMethod',
      'Tự nhận tại điểm không dùng địa chỉ hoặc phí giao.',
    );
  return method;
}

// Locks nothing new: the Order lock serializes payment; a concurrent address
// edit bumps its version, which the buyer confirmed (409 otherwise).
export async function deliverySnapshot(
  tx: Tx,
  o: PointOrderDoc,
  body: Wire['PayPointOrder'],
  now: Date,
  receiptId: string,
  preResolved?: PreResolvedDeliveryFee | null,
): Promise<PointOrderDeliveryDoc> {
  const { address, policyCode, fee } = await deliveryPrice(
    tx,
    o,
    body.destinationAddressId!,
    preResolved,
  );
  if (address.version !== body.expectedDestinationAddressVersion)
    throw conflict();
  if (fee !== body.expectedOutboundFee)
    throw new DomainError(
      409,
      'VersionConflict',
      'Phí giao đã thay đổi. Hãy xem lại phí trước khi thanh toán.',
    );
  return {
    _id: o._id,
    buyerId: o.buyerId,
    addressId: address._id,
    addressVersion: address.version,
    recipientName: address.recipientName,
    phone: address.phone,
    serviceAreaCode: address.serviceAreaCode,
    localityCode: address.localityCode,
    detail: address.detail,
    policyCode,
    outboundFee: fee,
    chosenAt: now,
    receiptId,
  };
}

export function deliveryView(
  o: PointOrderDoc,
  d: PointOrderDeliveryDoc,
  demoStartedAt?: Date | null,
  carrierDeliveredAt?: Date | null,
): Wire['PointOrderDelivery'] {
  return {
    recipientName: d.recipientName,
    phone: d.phone,
    serviceAreaCode: d.serviceAreaCode,
    localityCode: d.localityCode,
    detail: d.detail,
    outboundFee: d.outboundFee,
    carrier: 'LatLaiSimulator',
    trackingCode: o.trackingCode,
    dispatchedAt: o.dispatchedAt?.toISOString() ?? null,
    deliveryDeadline: o.deliveryDeadline?.toISOString() ?? null,
    deliveredAt: (carrierDeliveredAt ?? o.collectedAt)?.toISOString() ?? null,
    demoOutForDeliveryAt: demoStartedAt?.toISOString() ?? null,
  };
}

// Simulated carrier outcome, signed in its own protocol domain with the
// configured simulator secret (like carrier pickup/delivery events).
export function signPointDelivery(
  config: ConfigService,
  event: Wire['SimulatedPointDeliveryEvent'],
) {
  const secret = config.get<string>('PAYMENT_SIMULATOR_SECRET');
  if (!secret)
    throw new DomainError(
      503,
      'UNAVAILABLE',
      'Bộ vận chuyển mô phỏng chưa được bật.',
    );
  return createHmac('sha256', secret)
    .update('LatLaiPointDelivery-v1\n' + canonicalJson(event))
    .digest('hex');
}
export function verifyPointDelivery(
  config: ConfigService,
  event: Wire['SimulatedPointDeliveryEvent'],
  signature: string,
) {
  const expected = Buffer.from(signPointDelivery(config, event), 'hex');
  if (
    !/^[a-f0-9]{64}$/.test(signature) ||
    !timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  )
    throw new DomainError(
      403,
      'FORBIDDEN',
      'Sự kiện giao hàng chưa được xác thực.',
    );
}
