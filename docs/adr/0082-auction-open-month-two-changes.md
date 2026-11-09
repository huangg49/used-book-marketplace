# ADR0082: Hẹn giờ mở tới 30 ngày; đổi giờ mở tối đa 2 lần

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("they can schedule 1 month
ahead"; "changing open time should be at most 2 times"). Sửa hai con số của
[ADR0081](0081-auction-scheduled-open-grace.md) cho phiên `ScheduledGrace`; luật mở khi đủ người,
chờ thêm 24 giờ rồi hủy giữ nguyên. Không đổi READINESS.

## Quyết định

- Giờ mở (`opensAt`) khi đăng hoặc đổi giờ: từ 5 phút tới **lúc đăng + 30 ngày** (trước đây
  72 giờ). "1 tháng" được hiểu là 30 ngày cố định, tính từ `publishedAt`.
- Mỗi phiên có đăng ký **đổi giờ mở tối đa 2 lần** (trước đây 5). Lần thứ 3 trả 409. Các luật
  khác của việc đổi giờ giữ nguyên: chỉ trước giờ mở, không trong 30 phút cuối, báo người đăng ký.
- Phiên không có đăng ký (cờ đăng ký tắt, ADR0047) giữ 7 ngày và 5 lần đổi.
- Phiên `WhenReady`/`Scheduled` cũ giữ trần của ADR0079 cho tới khi được đổi giờ; lần đổi đó
  chuyển phiên sang `ScheduledGrace` với trần mới.
- Vòng đời dài nhất của phiên mới: 30 ngày + 24 giờ chờ + thời lượng (≤ 7 ngày) + 24 giờ thanh
  toán, cộng tạm giữ có trần của ADR0079/ADR0080. Sách nằm ở điểm giao nhận suốt thời gian chờ.

## Persistence và contract

- Migration `0070-auction-open-month` thay hai luật trong validator `auctions`:
  - luật 0037 `startAt ≤ updatedAt + 7 ngày` không áp dụng cho `ScheduledGrace` (đã có luật 0069
    `opensAt ≤ startAt ≤ opensAt + 24 giờ`);
  - luật 0069 `opensAt ≤ publishedAt + 72 giờ` thành `+ 30 ngày`;
  - thêm `scheduleRevision ≤ 2` cho `ScheduledGrace`.
  Không sửa migration đã áp dụng; hằng số 72 giờ/7 ngày cũ giữ nguyên cho migration cũ.
- OpenAPI chỉ đổi mô tả (`PublishAuction.startAt`, `RescheduleAuction.startAt`, `opensAt`,
  `latestStartAt` = lúc đăng + 30 ngày); không đổi schema.
- Web: lịch chọn giờ cho phép tới 30 ngày; RN thêm lựa chọn 9:00 sau 1, 2 và 4 tuần.
