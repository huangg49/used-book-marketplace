# Đăng sách Android — brief chuẩn bị sau pilot

Ngày10/10/2026. Mode **Operate**. Target
`apps/mobile-react-native/src/features/drafts/draft-editor.tsx` và các field/
picker/media/step dùng chung của feature drafts. Chưa triển khai redesign ở gói
pilot. Phản hồi pilot chưa có; các điểm dưới là tiêu chí từ yêu cầu/source.

Người đọc có một bản sách vật lý muốn đăng bán/đổi, dùng camera hoặc ảnh máy và
nhập trên Android. Kế thừa Be Vietnam Pro400/700, palette/components và direction
`3a051903` của [tìm sách](ANDROID_SEARCH.md)/[chi tiết](ANDROID_BOOK_DETAIL.md),
[DESIGN](../../DESIGN.md); không chọn lại visual world.

## Hành trình và tiêu chí

Giữ cấu trúc4 bước hiện có: **Chọn sách → Ảnh và tình trạng → Giá và giao nhận →
Kiểm tra và gửi duyệt**. Đây là hướng câu chữ dự kiến, chưa là các chuỗi đã sửa.
Ảnh của chính bản sách và hư hại dẫn nội dung; mỗi nhóm nói việc cần làm, tránh
“Những dấu đã qua tay bạn”/“Chọn cách chuyền sách” trong tiêu đề tác vụ.

- Chọn catalog sẵn hoặc yêu cầu mới; không ép ISBN cho sách không có ISBN.
  Catalog Pending không được mô tả như đã xác nhận hoặc bài đã được duyệt.
- Chụp/chọn1–8 ảnh; trạng thái upload/processing/Ready và retry rõ. Giữ nội dung
  đã nhập khi lỗi, từ chối quyền camera hoặc đổi bước. Trang, bìa/gáy, ghi chú,
  phụ kiện và thiếu trang phải đầy đủ; không che hư hại để rút form.
- Sale/Exchange/Both chỉ hiện giá tương ứng; giá bán và giá trị đổi khác nghĩa.
  Giữ giới hạn10.000–1.000.000đ theo source/contract. Giao nhận đúng phần đã có;
  không biến thiếu nơi gửi thành chặn gửi duyệt nếu nghiệp vụ không yêu cầu.
- Một hành động chính theo bước; lưu nháp là phụ. Trước gửi, người dùng đọc lại
  ảnh/giá/tình trạng và khai quyền đăng. “Gửi bài đăng để duyệt” không là “Đã đăng”.
  Giữ riêng gửi bản sửa chờ duyệt lại, quyền/state và cảnh báo rời thay đổi chưa lưu.
- Keyboard/safe area/Back/chữ lớn: footer không che ô lỗi; lỗi đưa tới field đầu,
  không mất dữ liệu.130%/320dp, tên dài/dấu Việt, empty/loading/error đều cần native
  evidence. Không suy thay font chung nghĩa là form đã redesign.

## Ranh giới và chứng minh

[SRS](../SRS_V1_1.md): FR-C01/02, FR-L01–06, BR-01. Listing đại diện một hiện vật;
giữ semantics `listing-command`, `upload`, receipt/expectedVersion/Idempotency-Key.
Mất phản hồi không đổi key/body/version để gửi mới. Không thêm autosave bền vững
nếu chưa có recovery tương ứng. Price assist tắt mặc định/advisory; không bật
AI hoặc live provider để làm demo đẹp. Không đổi API/session/framework/web Vite.

Trước sửa UI: tổng hợp [pilot](ANDROID_USABILITY_ROUND_01.md), xử lý P0/P1 của
luồng đọc/lưu, đối chiếu brief với source/contract và chụp incumbent native.
Acceptance form cần save→đọc lại nháp, submit→đúng trạng thái chờ duyệt, lỗi giữ
form/ảnh, upload/retry, Back và unknown acknowledgement trên QA `*_test` riêng.
TalkBack/ARM/iOS, live Supabase và review người thật ghi theo ca thực chạy;
READINESS không tự đóng từ brief hoặc export.
