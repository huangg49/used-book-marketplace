import type { SessionClient } from "../../core/api/session-client";
import { ApiError } from "../../core/api/session-client";
import { formatVnd } from "../../core/ui/format";
import {
  walletSummary,
  walletHistoryPage,
  type WalletHistoryItem,
} from "./contracts";

export const historyLabels = {
  Topup: "Nạp mô phỏng",
  OrderPayment: "Giữ tiền cho đơn sách",
  OrderRefund: "Hoàn tiền đơn sách",
  // Seller proceeds (P − C) when an auction ViaPoint Order settles.
  OrderSettlement: "Nhận tiền bán sách",
} satisfies Record<WalletHistoryItem["type"], string>;

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

export function historyOptions(client: SessionClient, ownerId: string) {
  return {
    queryKey: ["wallet", ownerId, "history"] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      client.request(
        "/me/wallet/history?limit=10" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        walletHistoryPage,
      ),
    getNextPageParam: (page: ReturnType<typeof walletHistoryPage.parse>) =>
      page.nextCursor ?? undefined,
    gcTime: 0,
    retry: false as const,
  };
}
