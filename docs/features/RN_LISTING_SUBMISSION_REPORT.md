# React Native: từ bản nháp đến gửi duyệt

Ngày 27/09/2026. Dùng các API đã triển khai của OpenAPI 0.6.0; không thêm endpoint,
đổi schema hoặc chạm vào `.env`/mật khẩu seed. RN là client thành viên đầu tiên.

Cập nhật tiếp nối: [lifecycle 0.8.0](LISTING_LIFECYCLE_REPORT.md) bổ sung sửa
Approved/gửi lại, ẩn/mở và xóa bài. Restricted được ẩn/xóa theo điều kiện mới;
phần mô tả “chỉ đọc” bên dưới là phạm vi của mốc form 0.6.0 lúc bàn giao.

## Hành vi đã triển khai

Từ **Tài khoản → Sách của tôi**, thành viên xem tất cả bài hoặc lọc Bản nháp,
Đang chờ duyệt, Cần chỉnh sửa, Đã được duyệt. Tên sách lấy từ catalog thật, có
phân trang và xử lý tải/rỗng/lỗi. Tài khoản Restricted chỉ đọc.

Form có bốn bước:

1. **Đầu sách:** tìm tên/tác giả/ISBN, chọn đúng ấn bản; xem đề nghị của mình;
   tạo đầu sách mới hoặc sửa/gửi lại đề nghị bị từ chối. Đề nghị Pending được chọn
   cho bài đăng, nhưng bài chưa thể được duyệt trước khi đầu sách Confirmed.
2. **Ảnh và tình trạng:** upload hiện có, chọn tối đa tám ảnh, chọn ảnh bìa;
   tình trạng, ruột sách, bìa/gáy, ghi chú, phụ kiện và lời nhắn. Câu hỏi đọc rõ,
   thiếu trang và thiếu nội dung trọng yếu là ba thông tin riêng.
3. **Bán hoặc đổi:** Sale/Exchange/Both, giá bán và giá trị đổi tách riêng,
   số nguyên 10.000–1.000.000 đồng. Trường giá không dùng được gửi là null.
4. **Kiểm tra:** xem lại ảnh/nội dung, xác nhận quyền đăng và thông tin trung
   thực; lưu rồi gửi duyệt. Validation đưa về bước có lỗi, cuộn đến phần thông báo.

Nháp có thể thiếu thông tin. Gửi duyệt yêu cầu đầy đủ nội dung và ảnh Ready.
PendingReview khóa sửa; kết quả mới được refetch khi màn hình hoạt động. Rejected
hiện lý do của lần duyệt trước, cho sửa và gửi lại. Approved hiển thị đúng trạng
thái; mốc [kệ công khai](PUBLIC_SHELF_REPORT.md) tiếp nối đã cập nhật thông báo
điều kiện hiển thị. Không tự tạo badge xác thực sách thật.

## Lưu, retry và riêng tư

`listing-command.ts` giữ nguyên body, version và hai idempotency key của save/submit.
Mất phản hồi save: retry save với key cũ; mất phản hồi submit: retry submit với
key cũ và version nhận từ save. Submit thành công nhưng GET thất bại: chỉ retry GET.
Không tạo key mới theo mỗi lần bấm thử lại, không tự gửi lại mutation trong nền.

Lỗi dứt khoát 403/409/422 dừng command; người dùng kiểm tra trạng thái server,
giữ nội dung đang sửa và xem lại trước hành động tiếp theo. Lúc chưa biết kết quả,
form khóa sửa. Lệnh và byte ảnh chỉ giữ trong phiên, không có hàng đợi qua tắt app.
Rời form có dữ liệu chưa lưu hoặc yêu cầu chưa xác nhận cần xác nhận; mở lại đọc
trạng thái server. Browser refresh vẫn đăng xuất theo thiết kế session hiện có.

Form đề nghị catalog giữ nội dung khi đóng/mở hoặc chuyển bước. Nếu mất phản hồi,
giữ đúng key/body cũ để kiểm tra lại. Access token vẫn do SessionClient sở hữu;
query cache được xóa khi đổi người dùng. Không có token store thứ hai.

TanStack Query sở hữu dữ liệu server. Form đang sửa không bị polling ghi đè.
Chỉ nhận bản mới hơn khi form sạch; response cũ không làm giảm version vừa lưu.
Nguồn điều kiện quyền/trạng thái cuối cùng vẫn ở API.

## Thiết kế và component

Nền giấy, chữ rừng, tiêu đề Lora và dấu nhấn đất nung; divider chia nội dung,
ảnh giữ tỷ lệ. Không thêm ảnh minh họa giả, rating, gradient hoặc badge uy tín.
Form dùng `core/ui`; dữ liệu và quyền nằm trong feature.

`Screen` nhận `scrollRef` tùy chọn để feature cuộn đến lỗi/bước mới mà không
unmount form. `Button` nhận `selected` tùy chọn, công bố qua accessibilityState
và aria-pressed. `/ui` có ví dụ lựa chọn và nút cuộn về đầu trang. Bộ lọc Sách của
tôi dùng Chip có selected, tự xuống dòng ở màn hình hẹp.

## Bằng chứng và giới hạn

- **41 RN tests đạt**, gồm 12 ca mới: retry ở save/submit/read, conflict/403/422,
  không đổi payload đã gửi, giới hạn giá, ảnh chưa Ready, khai báo và câu trả lời
  bắt buộc, đếm Unicode và đưa đến bước có lỗi.
- Contract check, lint/typecheck toàn workspace và 14 API unit tests đạt.
  Export JavaScript Android/iOS/web đạt. `pnpm build:android --emulator` thành công
  với JDK 21, Node 24.19.0: 338 tasks, 4 phút 7 giây. Đây là APK debug x86_64 cần
  Metro, không phải bản release hay bằng chứng thiết bị. API không đổi trong lượt
  này; bộ 75 API E2E có bằng chứng ở mốc kiểm duyệt trước.
  APK SHA-256: `046fa8c3b1b8f85ca376c29008724f56cf3160417ef6074297b88642e1140be8`.
- Browser dùng cùng mã RN, Nest HTTP và PostgreSQL 17.10 trong schema cô lập của
  DB `_test`. Upload qua HTTP và Sharp thật; **storage là adapter kiểm thử cục bộ**,
  không gọi đây là bằng chứng Supabase live. Bằng chứng Supabase trước đó giữ ở
  [media report](MEDIA_UPLOAD_REPORT.md).
- Đã thao tác: tạo đầu sách, upload, điền form, thiếu khai báo, mất phản hồi submit
  sau commit và retry, nhận từ chối, sửa/gửi lại, xác nhận catalog và approve qua
  API reviewer độc lập, cập nhật kết quả và trở về danh sách. Quyết định reviewer
  thực hiện qua API kiểm thử; web vận hành chưa được xây dựng.
- Kiểm tra 390 px và 320 px, tên dài, chữ phóng lớn, ảnh/lỗi và danh sách. Screenshot
  chứa tên/tài khoản/ảnh kiểm thử, không phải dữ liệu sách đang được bán.
- Kiểm tra bổ sung: form thiếu dữ liệu quay về bước đầu có lỗi; phản hồi đề nghị
  catalog bị mất sau commit vẫn giữ key khi đóng sheet/chuyển bước/mở lại; xác nhận
  rời form chưa lưu; Approved không có nút gửi; chữ tăng 135% từ cỡ thực ở 320 px;
  Button.selected có aria-pressed và Screen.scrollRef cuộn về đầu nội dung.

Ảnh bằng chứng: [đầu sách](../verification/rn-listing-catalog-390.png),
[giá/chế độ](../verification/rn-listing-pricing-390.png),
[retry](../verification/rn-listing-retry-390.png),
[từ chối](../verification/rn-listing-rejected-390.png),
[320 px](../verification/rn-listing-shelf-320.png).

**Native:** kiểm tra đăng nhập/form/picker/keyboard/Back/TalkBack trên thiết bị
vẫn chưa hoàn tất. Lệnh khởi động Metro bị bộ duyệt tự động từ chối với thông báo
`blocked by policy`; không suy ra native smoke test thành công từ web hoặc APK.
Chữ phóng lớn trên browser cũng không thay kiểm tra cỡ chữ hệ điều hành.

## Chạy và phần tiếp theo

Theo [setup RN](../REACT_NATIVE_START.md), chạy PostgreSQL đúng DATABASE_URL,
`pnpm dev:api`, `pnpm dev:media`, `pnpm dev:rn`. Vào Sách của tôi bằng tài khoản
MEMBER ACTIVE. `pnpm doctor:local` kiểm tra môi trường; chỉ dùng DB `_test` cho QA.

Tiếp theo: **web vận hành thật** cho ADMIN xác nhận catalog và STAFF/ADMIN duyệt
listing, rồi public shelf/detail/media với predicate quyền hiện hành. Sửa sau
Approved, ẩn/mở/xóa/gỡ và giao dịch/điểm nhận/đấu giá vẫn chưa triển khai.
Hoàn tất native smoke test trước khi coi luồng thành viên đã được nghiệm thu trên Android.

Cập nhật sau web vận hành (27/09): 11 test transport được chuyển sang
`packages/session-client`, RN còn 30 test; tổng 41 test cũ vẫn được chạy. Transport
dùng chung đã qua RN export cả ba nền tảng. Không thay đổi kết luận native QA.
