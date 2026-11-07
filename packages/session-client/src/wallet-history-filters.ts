export type WalletHistoryFilterDraft = { from: string; to: string; reference: string };
export type WalletHistoryFilters = Partial<WalletHistoryFilterDraft>;

export const emptyWalletHistoryFilters: WalletHistoryFilterDraft = {
  from: "",
  to: "",
  reference: "",
};

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function walletHistoryFilters(
  draft: WalletHistoryFilterDraft,
): { filters: WalletHistoryFilters; error?: never } | { filters?: never; error: string } {
  const from = draft.from.trim();
  const to = draft.to.trim();
  const reference = draft.reference.trim().replace(/^#?(?:RÚT|ĐƠN|NẠP|SỔ)-/iu, "").toLowerCase();
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to))) {
    return { error: "Nhập ngày hợp lệ theo dạng YYYY-MM-DD." };
  }
  if (from && to && from > to) {
    return { error: "Ngày bắt đầu phải trước hoặc trùng ngày kết thúc." };
  }
  if (reference && !/^(?:[0-9a-f]{6}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/.test(reference)) {
    return { error: "Nhập mã giao dịch đầy đủ hoặc 6 ký tự hiển thị trên biên lai." };
  }
  return {
    filters: {
      ...(from ? { from: `${from}T00:00:00+07:00` } : {}),
      ...(to ? { to: `${to}T23:59:59.999+07:00` } : {}),
      ...(reference ? { reference } : {}),
    },
  };
}
