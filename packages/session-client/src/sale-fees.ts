import { z } from "zod";
import type { components } from "@used-books/api-contract";

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const basisPoints = z.number().int().min(0).max(10000);

export const DEFAULT_SALE_COMMISSION_BPS = 500;
export const formatSaleFeeRate = (bps: number) => `${(bps / 100).toLocaleString("vi-VN")}%`;

export const auctionSellerFeeText = `Phí dịch vụ ${formatSaleFeeRate(DEFAULT_SALE_COMMISSION_BPS)} trên giá chốt được trừ vào tiền bạn nhận khi đơn được quyết toán.`;
export const listingSellerFeeText = `Phí dịch vụ ${formatSaleFeeRate(DEFAULT_SALE_COMMISSION_BPS)} trên tiền sách được trừ vào tiền bạn nhận khi đơn được quyết toán.`;
export const exchangeServiceFeeText = "Phí dịch vụ đổi sách: 0đ. Tiền cọc và tiền bù được theo dõi riêng.";
export const exchangeShippingCostText = "Nếu gửi qua hãng vận chuyển, mỗi bên tự trả cước chiều mình gửi. Cước tính riêng với khoản giữ từ Ví.";

/** At checkout the ledger releases the auction hold and funds the order together. */
export function auctionCheckoutBalance(buyerTotal: number, auctionHeld?: number) {
  if (auctionHeld === undefined) return null;
  const debit = buyerTotal - auctionHeld;
  return {
    label: debit >= 0 ? "Cần thêm từ số dư khả dụng" : "Hoàn dư về số dư khả dụng",
    amount: Math.abs(debit),
  };
}

export const saleFeeAmountsSchema = z.object({
  commissionBps: basisPoints,
  commission: money,
  sellerProceedsOnCompletion: money,
});

export const auctionSellerSaleSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(["AwaitingPayment", "PendingSettlement", "Settled", "Closed"]),
  amounts: saleFeeAmountsSchema.extend({ bookPrice: money }),
}) satisfies z.ZodType<components["schemas"]["AuctionSellerSale"]>;

export type AuctionSellerSale = z.infer<typeof auctionSellerSaleSchema>;
export const auctionSellerSaleLabels: Record<AuctionSellerSale["status"], string> = {
  AwaitingPayment: "Chờ người thắng thanh toán",
  PendingSettlement: "Chờ quyết toán",
  Settled: "Đã quyết toán",
  Closed: "Đơn đã đóng. Không thu phí dịch vụ.",
};

export function auctionSellerAmounts(sale: AuctionSellerSale): SaleSettlementReceipt {
  return {
    bookPrice: sale.amounts.bookPrice,
    commissionBps: sale.amounts.commissionBps,
    commission: sale.amounts.commission,
    shippingReimbursement: 0,
    creditedAmount: sale.amounts.sellerProceedsOnCompletion,
  };
}

export const saleSettlementReceiptSchema = z.object({
  bookPrice: money,
  commissionBps: basisPoints,
  commission: money,
  shippingReimbursement: money,
  creditedAmount: money,
}) satisfies z.ZodType<components["schemas"]["SaleSettlementReceipt"]>;

export type SaleSettlementReceipt = z.infer<typeof saleSettlementReceiptSchema>;

export function directSellerAmounts(amounts: { bookPrice: number; shippingFee: number } & Partial<z.infer<typeof saleFeeAmountsSchema>>): SaleSettlementReceipt | null {
  const { bookPrice, shippingFee, commissionBps, commission, sellerProceedsOnCompletion } = amounts;
  if (commissionBps === undefined || commission === undefined || sellerProceedsOnCompletion === undefined) return null;
  return { bookPrice, commissionBps, commission, shippingReimbursement: shippingFee, creditedAmount: sellerProceedsOnCompletion };
}

export function buyerSaleFeeText(bps?: number) {
  if (bps === 0) return "Đơn này miễn phí dịch vụ.";
  const rate = bps === undefined ? "" : ` ${formatSaleFeeRate(bps)}`;
  return `Phí dịch vụ${rate} được trừ vào tiền người bán nhận khi quyết toán. Khoản này không cộng vào tổng bạn trả.`;
}
