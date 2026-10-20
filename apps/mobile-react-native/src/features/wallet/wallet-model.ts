import type { SessionClient } from "../../core/api/session-client";
import { ApiError } from "../../core/api/session-client";
import { formatVnd } from "../../core/ui/format";
import {
  walletSummary,
  walletHistoryPage,
  topupIntent,
  topupPage,
  createVNPayTopupReceipt,
  type WalletHistoryItem,
  type TopupState,
} from "./contracts";

export const historyLabels = {
  Topup: "Nạp tiền ví",
  OrderPayment: "Giữ tiền cho đơn sách",
  OrderRefund: "Hoàn tiền đơn sách",
  // Seller proceeds (P − C) when an auction ViaPoint Order settles.
  OrderSettlement: "Nhận tiền bán sách",
  ListingFeeCharge: "Giữ phí gửi duyệt bài",
  ListingFeeRefund: "Hoàn phí bài bị từ chối",
  ListingFeeSettlement: "Phí bài được duyệt",
} satisfies Record<WalletHistoryItem["type"], string>;

export const topupLabels = {
  Pending: "Chờ thanh toán",
  Processing: "Đang xử lý",
  Succeeded: "Đã nạp vào ví",
  Failed: "Không thành công",
  ReviewRequired: "Cần đối soát",
} satisfies Record<TopupState, string>;

export function signedAmount(amount: number) {
  return `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatVnd(Math.abs(amount))}`;
}

export function walletDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// Prevent showing previously loaded private amounts after an explicit access denial.
export function accessDenied(error: unknown) {
  return error instanceof ApiError && [401, 403].includes(error.status);
}

export function summaryOptions(client: SessionClient, ownerId: string) {
  return {
    queryKey: ["wallet", ownerId, "summary"] as const,
    queryFn: () => client.request("/me/wallet", walletSummary),
    gcTime: 0,
    retry: false as const,
  };
}

export function historyOptions(
  client: SessionClient,
  ownerId: string,
  typeFilter?: string,
) {
  return {
    queryKey: ["wallet", ownerId, "history", typeFilter ?? "all"] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: { pageParam: string | null }) => {
      const params = new URLSearchParams({ limit: "10" });
      if (typeFilter && typeFilter !== "all") {
        params.set("type", typeFilter);
      }
      if (pageParam) {
        params.set("cursor", pageParam);
      }
      return client.request(
        `/me/wallet/history?${params.toString()}`,
        walletHistoryPage,
      );
    },
    getNextPageParam: (page: ReturnType<typeof walletHistoryPage.parse>) =>
      page.nextCursor ?? undefined,
    gcTime: 0,
    retry: false as const,
  };
}

export function topupsOptions(client: SessionClient, ownerId: string) {
  return {
    queryKey: ["wallet", ownerId, "topups"] as const,
    queryFn: () => client.request("/me/topups?limit=10", topupPage),
    gcTime: 0,
    retry: false as const,
  };
}

export async function createVNPayTopup(
  client: SessionClient,
  amount: number,
  key: string,
) {
  return client.request("/me/topups/vnpay", createVNPayTopupReceipt, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify({ amount }),
  });
}

export async function queryVNPayTopup(client: SessionClient, topupId: string) {
  return client.request(
    `/me/topups/${encodeURIComponent(topupId)}/vnpay-query`,
    topupIntent,
    {
      method: "POST",
      headers: { "Idempotency-Key": topupId },
    },
  );
}
