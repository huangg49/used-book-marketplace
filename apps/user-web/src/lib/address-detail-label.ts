/** Only shorten the known legacy seed sentence; real address text stays intact. */
export function addressDetailLabel(detail: string): string {
  const legacy =
    /^DEMO — Nơi gửi sách mô phỏng tại (TP\.HCM|Bình Dương|Vũng Tàu); không phải địa chỉ giao nhận thật\.$/.exec(
      detail,
    );
  if (!legacy) return detail;
  return legacy[1] === "TP.HCM" ? "TPHCM" : legacy[1]!;
}
