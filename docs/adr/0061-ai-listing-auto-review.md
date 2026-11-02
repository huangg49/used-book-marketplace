# ADR 0061: AI tự duyệt bài đăng theo tiêu chí kiểm duyệt

[ADR0062](0062-ai-listing-review-hardening.md) thay phần tiêu chí, gọi mô hình và "Giới
hạn" dưới đây. Phần lưu vết và "AI không từ chối" giữ nguyên.

02/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc, **sau cờ tắt
mặc định**. Bổ sung [ADR0048](0048-listing-photo-autofill.md) và thay phần "không
thêm AI duyệt bài" của [ADR0056](0056-listing-assist-fast-paths.md) khi cờ bật.

## Khác biệt với SRS, cần chủ dự án xác nhận

SRS FR-L03 và bảng trạng thái mục listing ghi Staff phê duyệt PendingReview. ADR này
**chưa sửa SRS**. Bật cờ ở môi trường dùng chung cần chủ dự án xác nhận; khi cờ tắt
hành vi đúng như SRS. Chưa có đánh giá trên ảnh thật, nên chưa có căn cứ cho ngưỡng
tin cậy. Đo trên bộ ảnh có đáp án trước khi bật.

## Quyết định

- Worker trong `worker:orders` xem listing PendingReview, mỗi revision một lần. Gửi
  duyệt không đổi: Member vẫn thấy chờ duyệt, Staff vẫn thấy hàng đợi. Staff quyết
  định trước thì worker bỏ qua.
- Chỉ có **Approve hoặc Escalate**. AI không từ chối. Mọi trường hợp không đạt, không
  chắc, lỗi provider hoặc output sai dạng đều giữ PendingReview cho Staff.
- Tiêu chí là `ReviewChecklist` Staff đang dùng:

| Tiêu chí | Ai đánh giá |
| --- | --- |
| catalogMatches | Dữ kiện: catalog Confirmed. Mô hình: ảnh đúng đầu sách |
| photosClear | Dữ kiện: ít nhất 2 ảnh Ready. Mô hình: ảnh thật, đủ rõ |
| conditionDisclosed | Dữ kiện: đã khai tình trạng/trang/bìa. Mô hình: khớp ảnh |
| readable | Dữ kiện: đọc được, không thiếu trang/nội dung trọng yếu |
| pricingValid | Dữ kiện: có giá, không quá `LISTING_AUTO_REVIEW_MAX_PRICE` |
| contentAppropriate | Mô hình: không phản cảm, liên hệ ngoài sàn, quảng cáo |

- Luôn chuyển Staff, không gọi mô hình: Auction, bộ sách (cần xác nhận
  bundleContentsVerified), chủ sách không ACTIVE/chưa xác minh email, revision đã có
  quyết định trước (bị từ chối gửi lại hoặc sửa bài đã duyệt), có phí đăng lịch sử
  (settlement gắn với receipt Staff), ảnh trùng sha256 với listing khác (BR-01).
- Dữ kiện thắng mô hình. Chúng được kiểm lại dưới khóa lúc commit, cùng version,
  revision, moderation, địa chỉ gửi, catalog và ảnh. Gọi mô hình nằm ngoài transaction.
- Chữ của người bán và chữ trong ảnh là dữ liệu, chỉ đi trong user message. Prompt
  injection không thể bỏ qua bước kiểm dữ kiện, nhưng các tiêu chí do mô hình đánh giá
  vẫn có thể bị ảnh hưởng; vì vậy giữ trần giá và hậu kiểm.

## Lưu vết

- System actor `ListingAutoReview`, operation `autoApproveListing`, key là revisionId:
  mỗi revision được đăng tối đa một lần, có receipt/audit/outbox `ListingApproved`.
- `listing_decisions.reviewerId` là UUID dành riêng `AUTO_REVIEWER_ID`, không phải tài
  khoản. Migration0050 thêm `listing_auto_reviews` (append-only, duy nhất theo
  revision) chứa kết quả, mã lý do, điểm mô hình; không chứa ảnh hoặc chữ người bán.
- Contract0.68: `ReviewDecision.automated` và `PrivateListing.autoReview` (chỉ ở chi
  tiết cho Staff). Gỡ công khai sau khi đăng vẫn theo FR-L07.

## Cấu hình và triển khai

`LISTING_AUTO_REVIEW_ENABLED=false`, cần thêm `AUTOFILL_ENABLED`/`AUTOFILL_API_KEY`.
`_MIN_CONFIDENCE` 0,85; `_MAX_PRICE` 500.000₫; `_BATCH_SIZE` 10; `_DAILY_LIMIT` 200
lượt gọi mô hình/24 giờ. Quá hạn mức thì listing tiếp tục chờ. Các giá trị này là đề
xuất ban đầu, chưa được hiệu chỉnh. Dừng API/worker, chạy `pnpm db:migrate`, rồi
`pnpm db:bootstrap` để app role có collection mới.

## Giới hạn

Test E2E dùng mô hình giả và ảnh giả: chứng minh luồng quyết định, không chứng minh
chất lượng mô hình. Chưa có màn Admin hiển thị `autoReview`/`automated`, chưa có lấy
mẫu hậu kiểm bài đã tự duyệt. Lỗi cấp worker không ghi dòng và thử lại ở chu kỳ sau.
Không đổi READINESS.
