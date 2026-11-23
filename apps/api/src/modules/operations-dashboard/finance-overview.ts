import type { Wire } from '../commands/domain-error.js';

export const FINANCE_POLICY = {
  passThroughShipping: 'PassThrough',
  carrierCost: 'NotRecognized',
  incidentFund: 'OperatingCost',
  depositRecognition: 'PostingDate',
  exchange: 'VolumeOnly',
} as const;

export const FINANCE_NOTES: string[] = [
  'Tiền trong báo cáo là số liệu mô phỏng trên sổ cái (ADR 0018), không phải giao dịch ngân hàng thật.',
  'Phí chặng giao từ điểm (outboundFee) là khoản thu hộ (pass-through), hiển thị riêng và không cộng vào doanh thu hay lợi nhuận.',
  'Chi phí vận hành điểm và phí carrier mô phỏng chưa có tài khoản sổ cái riêng nên chưa trừ vào lợi nhuận.',
  'Cọc đấu giá bị tịch thu và khoản chia 50% cọc cho người bán (ADR 0087) ghi nhận theo ngày hạch toán từng bút toán.',
  'Trao đổi sách áp dụng phí 0đ (POL-14), chỉ báo cáo khối lượng luân chuyển và không cộng vào GMV bán hay doanh thu.',
];

export type FinanceTotalsInput = {
  directCommission: number;
  auctionCommission: number;
  forfeitedDeposits: number;
  depositShare: number;
  legacyListingFees: number;
  passThroughShipping: number;
  incidentCompensation: number;
  gmv: number;
  settledOrders: number;
};

export function computeRateBps(
  numerator: number,
  denominator: number,
): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator * 10_000) / denominator);
}

export function computeFinanceTotals(
  input: FinanceTotalsInput,
): Wire['FinanceTotals'] {
  const netRevenue =
    input.directCommission +
    input.auctionCommission +
    input.forfeitedDeposits -
    input.depositShare +
    input.legacyListingFees;
  const profit = netRevenue - input.incidentCompensation;
  const totalCommission = input.directCommission + input.auctionCommission;

  return {
    directCommission: input.directCommission,
    auctionCommission: input.auctionCommission,
    forfeitedDeposits: input.forfeitedDeposits,
    depositShare: input.depositShare,
    legacyListingFees: input.legacyListingFees,
    netRevenue,
    passThroughShipping: input.passThroughShipping,
    incidentCompensation: input.incidentCompensation,
    profit,
    gmv: input.gmv,
    settledOrders: input.settledOrders,
    takeRateBps: computeRateBps(totalCommission, input.gmv),
  };
}

const dayMs = 86_400_000;

export function previousDateRange(from: string, to: string): {
  from: string;
  to: string;
} {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const spanDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const prevEnd = new Date(start.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * dayMs);
  return {
    from: prevStart.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  };
}

