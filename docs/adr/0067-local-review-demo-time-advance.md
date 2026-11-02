# ADR0067 — Mô phỏng hết hạn đánh giá cho mẫu local

Chấp thuận theo yêu cầu owner02/11/2026: cần nút bỏ chờ48h để demo hai đánh giá
đã gửi, trên Member web/API/DB local chính. Không sửa chính sách đánh giá thật.

## Quyết định

- `DEMO_REVIEW_TIME_ENABLED=false` mặc định; khi bật phải có danh sách chính xác
  `DEMO_REVIEW_EXCHANGE_IDS`. API luôn từ chối ở production hoặc Mongo ngoài
  loopback. Không có flag trình duyệt nào cấp quyền bỏ chờ.
- Chỉ participant ACTIVE được dùng. Service kiểm lại current auth trước receipt,
  mẫu Exchange Completed legacy không agreement, không deposit/difference/funded/
  wallet account, có ghi chú nhập mẫu rõ ràng ở cả hai bên. Cần đủ hai review còn
  quyền sửa, không hidden/deleted/evidenceHeld/legacyDisclosed/reply/publishedAt.
- Command bind expectedVersion của bản mình và token hash ID/version cả cặp;
  khóa Exchange → hai review theo protocol chung. Peer vừa sửa thì xác nhận cũ
  bị từ chối. Idempotency-Key/body/receipt giữ nguyên khi mất phản hồi.
- Dịch toàn bộ Date cấp một của Exchange mẫu (trừ updatedAt) và createdAt/
  editDeadline của hai review cùng một khoảng đủ hết hạn cả cặp. Giữ chênh lệch
  createdAt→editDeadline48h và thứ tự thời gian mẫu; không sửa đồng hồ máy/server.
  Nội dung, tác giả, điểm số, ledger, trạng thái Completed và listing không đổi.
- Append hai revision `DemoTimeAdvance`, tăng version, lưu actor thật và lý do
  mô phỏng chứa delta/original Exchange dates. Revision trước giữ nguyên thời
  điểm gửi thật. Receipt/audit/outbox cùng transaction. Chỉ một lần trên mỗi mẫu;
  không có nút hoàn tác sau khi hai bên đã đọc nội dung của nhau.
- Các reader/reputation/moderation dùng chính predicate công bố hiện có; không
  công bố chỉ bằng cách ghi `publishedAt`. Sau mô phỏng không còn sửa/xóa; có thể
  xem hồ sơ và phản hồi theo luồng kiểm duyệt hiện tại.

## Giới hạn

Ngày hiển thị của mẫu đã được lùi để mô phỏng; không được dùng làm lịch sử giao
dịch thật hoặc chứng minh giao nhận/settlement. Không thêm migration/schema/
provider, không mở gate release, không thay thời hạn168h/48h cho giao dịch khác.
RN/Flutter chưa có nút này; phạm vi được giao là Member web cho buổi demo.

[Hướng dẫn, kiểm chứng và checkpoint](../features/MAIN_REVIEW_DEMO_2026_11_02.md).
