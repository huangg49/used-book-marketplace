// One VND display for shelf, detail and the listing review step; no React Native imports
// so pure form modules and unit tests can share it.
export function formatVnd(amount: number) {
  return Number.isSafeInteger(amount) && amount >= 0
    ? `${amount.toLocaleString("vi-VN")} ₫`
    : "Chưa có giá";
}
