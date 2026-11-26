import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VIETNAM_63_PROVINCES } from './vietnam-provinces-tariffs.js';

export const GHN_LIVE_POLICY_CODE = 'GHN-LIVE-v2';
export const POINT_ZONE_FALLBACK_POLICY_CODE = 'POINT-ZONE-FALLBACK-v1';

const QUOTE_CACHE_TTL_MS = 15 * 60_000;
const GHN_TIMEOUT_MS = 3_500;
const MAX_OUTBOUND_FEE = 1_000_000;
const DEFAULT_BOOK_WEIGHT_GRAMS = 1_000;
const MAX_GHN_INSURANCE_VALUE = 5_000_000;

export interface PointDeliveryFeeResolution {
  fee: number;
  policyCode: string;
  source: 'GHN' | 'ZoneFallback';
}

interface GhnRoutePoint {
  districtId: number;
  wardCode: string;
}

interface LocalityTariff extends GhnRoutePoint {
  fallbackFee: number;
}

// Origin GHN district/ward for each Lật Lại managed auction handover point in TP.HCM.
const POINT_ORIGIN_MAP: Record<string, GhnRoutePoint> = {
  'HCM-DEMO-01': { districtId: 1442, wardCode: '20108' }, // Quận 1
  'HCM-DEMO-02': { districtId: 1444, wardCode: '90795' }, // Quận 3
};

const DEFAULT_ORIGIN: GhnRoutePoint = { districtId: 1442, wardCode: '20108' };

// Verified GHN master-data DistrictID + WardCode + regional fallback fee (VND)
// for all 63 Vietnam provinces (migration 0095) plus legacy TP.HCM district
// codes (Q1, Q3, BT, ...) used by seeded member addresses.
const LEGACY_HCM_DISTRICT_TARIFFS: Record<string, LocalityTariff> = {
  Q1: { districtId: 1442, wardCode: '20108', fallbackFee: 22_000 },
  Q2: { districtId: 1443, wardCode: '20201', fallbackFee: 22_000 },
  Q3: { districtId: 1444, wardCode: '90795', fallbackFee: 22_000 },
  Q4: { districtId: 1446, wardCode: '20401', fallbackFee: 22_000 },
  Q5: { districtId: 1447, wardCode: '20801', fallbackFee: 22_000 },
  Q6: { districtId: 1448, wardCode: '20601', fallbackFee: 22_000 },
  Q7: { districtId: 1449, wardCode: '20701', fallbackFee: 22_000 },
  Q8: { districtId: 1450, wardCode: '20801', fallbackFee: 22_000 },
  Q9: { districtId: 1451, wardCode: '20901', fallbackFee: 22_000 },
  Q10: { districtId: 1452, wardCode: '20901', fallbackFee: 22_000 },
  Q11: { districtId: 1453, wardCode: '21101', fallbackFee: 22_000 },
  Q12: { districtId: 1454, wardCode: '21201', fallbackFee: 22_000 },
  TB: { districtId: 1455, wardCode: '20401', fallbackFee: 22_000 },
  TP: { districtId: 1456, wardCode: '20601', fallbackFee: 22_000 },
  PN: { districtId: 1457, wardCode: '20601', fallbackFee: 22_000 },
  BT: { districtId: 1462, wardCode: '20501', fallbackFee: 22_000 },
  GV: { districtId: 1461, wardCode: '21301', fallbackFee: 22_000 },
  TD: { districtId: 3695, wardCode: '21001', fallbackFee: 22_000 },
};

export const LOCALITY_TARIFFS: Record<string, LocalityTariff> = {
  ...Object.fromEntries(
    VIETNAM_63_PROVINCES.map((p) => [
      p.code,
      {
        districtId: p.districtId,
        wardCode: p.wardCode,
        fallbackFee: p.fallbackFee,
      },
    ]),
  ),
  ...LEGACY_HCM_DISTRICT_TARIFFS,
};

// Optional TP.HCM district refinement from free-text address detail.
const HCM_DISTRICT_HINTS: Array<{ pattern: RegExp; districtId: number; wardCode: string }> = [
  { pattern: /\b(?:quận|q\.?)\s*1\b/i, districtId: 1442, wardCode: '20108' },
  { pattern: /\b(?:quận|q\.?)\s*3\b/i, districtId: 1444, wardCode: '90795' },
  { pattern: /\b(?:quận|q\.?)\s*4\b/i, districtId: 1446, wardCode: '20401' },
  { pattern: /\b(?:quận|q\.?)\s*5\b/i, districtId: 1447, wardCode: '20801' },
  { pattern: /\b(?:quận|q\.?)\s*7\b/i, districtId: 1449, wardCode: '20701' },
  { pattern: /\b(?:quận|q\.?)\s*10\b/i, districtId: 1452, wardCode: '20901' },
  { pattern: /\b(?:quận|q\.?)\s*12\b/i, districtId: 1454, wardCode: '21201' },
  { pattern: /tân bình/i, districtId: 1455, wardCode: '20401' },
  { pattern: /tân phú/i, districtId: 1456, wardCode: '20601' },
  { pattern: /phú nhuận/i, districtId: 1457, wardCode: '20601' },
  { pattern: /gò vấp/i, districtId: 1461, wardCode: '21301' },
  { pattern: /bình thạnh/i, districtId: 1462, wardCode: '20501' },
  { pattern: /thủ đức/i, districtId: 3695, wardCode: '21001' },
  { pattern: /bình chánh/i, districtId: 1533, wardCode: '800051' },
  { pattern: /nhà bè/i, districtId: 1534, wardCode: '800091' },
];

export function fallbackFeeForLocality(
  localityCode: string | null | undefined,
  defaultPolicyFee: number,
): number {
  const tariff = localityCode ? LOCALITY_TARIFFS[localityCode] : undefined;
  return tariff ? tariff.fallbackFee : defaultPolicyFee;
}

export function resolveGhnDestination(
  localityCode: string,
  detail?: string,
): GhnRoutePoint | null {
  const base = LOCALITY_TARIFFS[localityCode];
  if (!base) return null;
  if (localityCode === 'DEMO-A' && detail) {
    const matched = HCM_DISTRICT_HINTS.find((entry) => entry.pattern.test(detail));
    if (matched) {
      return { districtId: matched.districtId, wardCode: matched.wardCode };
    }
  }
  return { districtId: base.districtId, wardCode: base.wardCode };
}

interface CachedFee {
  fee: number;
  policyCode: string;
  source: 'GHN' | 'ZoneFallback';
  expiresAt: number;
}

interface GhnFeeResponse {
  code?: number;
  message?: string;
  data?: {
    total?: number;
    service_fee?: number;
    insurance_fee?: number;
  };
}

@Injectable()
export class PointDeliveryPricingService {
  private readonly logger = new Logger(PointDeliveryPricingService.name);
  private readonly cache = new Map<string, CachedFee>();

  constructor(@Optional() private readonly config?: ConfigService) {}

  private cacheKey(input: {
    orderId: string;
    addressId: string;
    addressVersion: number;
    bookPrice: number;
    pointCode?: string | null;
  }) {
    return `${input.orderId}:${input.addressId}:${input.addressVersion}:${input.bookPrice}:${input.pointCode ?? ''}`;
  }

  getCached(input: {
    orderId: string;
    addressId: string;
    addressVersion: number;
    bookPrice: number;
    pointCode?: string | null;
  }): PointDeliveryFeeResolution | null {
    const key = this.cacheKey(input);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return { fee: entry.fee, policyCode: entry.policyCode, source: entry.source };
  }

  private setCached(
    input: {
      orderId: string;
      addressId: string;
      addressVersion: number;
      bookPrice: number;
      pointCode?: string | null;
    },
    resolved: PointDeliveryFeeResolution,
  ) {
    // Bound cache size cleanly without external dependencies.
    if (this.cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (v.expiresAt <= now) this.cache.delete(k);
      }
      if (this.cache.size > 500) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
    }
    this.cache.set(this.cacheKey(input), {
      ...resolved,
      expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
    });
  }

  private liveGhnEnabled(): boolean {
    const flag = this.config?.get<string>('GHN_FEE_LIVE') ?? process.env.GHN_FEE_LIVE;
    if (flag !== undefined) {
      return flag !== 'false' && flag !== '0';
    }
    return process.env.NODE_ENV !== 'test';
  }

  /**
   * Hybrid fee calculation (always called OUTSIDE MongoDB transactions):
   * 1. Queries live GHN Express API v2 (/v2/shipping-order/fee) with a 3.5s timeout.
   * 2. Automatically falls back to deterministic regional zone tariffs if GHN is
   *    unavailable, times out, or returns an invalid fee.
   * 3. Caches the result for 15 minutes so deliveryQuote and payPointOrder agree.
   */
  async resolveFee(input: {
    orderId: string;
    addressId: string;
    addressVersion: number;
    localityCode: string;
    detail?: string;
    bookPrice: number;
    pointCode?: string | null;
    defaultPolicyFee: number;
    defaultPolicyCode: string;
    weightGrams?: number;
  }): Promise<PointDeliveryFeeResolution> {
    const cached = this.getCached(input);
    if (cached) return cached;

    const destination = resolveGhnDestination(input.localityCode, input.detail);
    if (destination && this.liveGhnEnabled()) {
      const origin =
        (input.pointCode ? POINT_ORIGIN_MAP[input.pointCode] : undefined) ??
        DEFAULT_ORIGIN;
      const ghnFee = await this.fetchGhnFee({
        origin,
        destination,
        bookPrice: input.bookPrice,
        weightGrams: input.weightGrams ?? DEFAULT_BOOK_WEIGHT_GRAMS,
      });
      if (ghnFee !== null) {
        const resolved: PointDeliveryFeeResolution = {
          fee: ghnFee,
          policyCode: GHN_LIVE_POLICY_CODE,
          source: 'GHN',
        };
        this.setCached(input, resolved);
        return resolved;
      }
    }

    const fallbackFee = fallbackFeeForLocality(
      input.localityCode,
      input.defaultPolicyFee,
    );
    const resolved: PointDeliveryFeeResolution = {
      fee: fallbackFee,
      policyCode: LOCALITY_TARIFFS[input.localityCode]
        ? POINT_ZONE_FALLBACK_POLICY_CODE
        : input.defaultPolicyCode,
      source: 'ZoneFallback',
    };
    this.setCached(input, resolved);
    return resolved;
  }

  private async fetchGhnFee(input: {
    origin: GhnRoutePoint;
    destination: GhnRoutePoint;
    bookPrice: number;
    weightGrams: number;
  }): Promise<number | null> {
    const token =
      this.config?.get<string>('GHN_TOKEN') ||
      process.env.GHN_TOKEN ||
      'd61786d4-d311-40ea-a1f1-a137b38fa3ff';
    const shopId =
      this.config?.get<string>('GHN_SHOP_ID') ||
      process.env.GHN_SHOP_ID ||
      '6721299';
    const apiUrl =
      this.config?.get<string>('GHN_API_URL') ||
      process.env.GHN_API_URL ||
      'https://online-gateway.ghn.vn/shiip/public-api';

    try {
      const response = await fetch(`${apiUrl}/v2/shipping-order/fee`, {
        method: 'POST',
        headers: {
          Token: token,
          ShopId: shopId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_district_id: input.origin.districtId,
          from_ward_code: input.origin.wardCode,
          service_type_id: 2,
          to_district_id: input.destination.districtId,
          to_ward_code: input.destination.wardCode,
          weight: Math.max(200, Math.min(10_000, Math.round(input.weightGrams))),
          length: 22,
          width: 16,
          height: 6,
          insurance_value: Math.max(
            0,
            Math.min(MAX_GHN_INSURANCE_VALUE, Math.round(input.bookPrice)),
          ),
        }),
        signal: AbortSignal.timeout(GHN_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `[PointDeliveryPricing] GHN HTTP ${response.status}; using zone fallback.`,
        );
        return null;
      }

      const json = (await response.json()) as GhnFeeResponse;
      const total = json.data?.total;
      if (
        json.code === 200 &&
        typeof total === 'number' &&
        Number.isInteger(total) &&
        total >= 1 &&
        total <= MAX_OUTBOUND_FEE
      ) {
        this.logger.log(
          `[PointDeliveryPricing] GHN live fee ${total} VND (${input.origin.districtId} -> ${input.destination.districtId})`,
        );
        return total;
      }

      this.logger.warn(
        `[PointDeliveryPricing] GHN invalid response (${json.message ?? 'unknown'}); using zone fallback.`,
      );
      return null;
    } catch (err) {
      this.logger.warn(
        `[PointDeliveryPricing] GHN request failed (${(err as Error).message}); using zone fallback.`,
      );
      return null;
    }
  }
}
