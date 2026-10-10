# Chuẩn bị pilot và làm rõ lưu sách Android — 10/10/2026

Nhánh `codex/android-save-usability`, base `2dc069b`.
Checkpoint subject: `fix(rn): clarify saved books and preserve login context`.
Chủ dự án duyệt bước tìm→xem→lưu sau detail; xác nhận nhóm chưa có kinh nghiệm
mua/bán sách cũ và chỉ có Android Studio. Scope: làm luồng lưu đủ rõ để thử,
chuẩn bị pilot trong nhóm/emulator; brief đăng sách chờ phản hồi.

## Hành vi đã đổi

Mode **Operate**, mở rộng detail trong direction `3a051903`; giữ
[DESIGN](../../DESIGN.md), [recipe detail](../design/ANDROID_BOOK_DETAIL.md),
Be Vietnam Pro/tokens/layout đã duyệt. Không đổi visual world, API/contract,
session/token storage, backend, framework hoặc web Vite/Flutter.

- Chi tiết anonymous mở login kèm một UUID sách, có “Quay lại sách”. Sau login
  thành công trở về cuốn đó bằng dismissTo; không tự lưu. Return parameter sai,
  URL bên ngoài hoặc array không được dùng làm destination.
- “Đã lưu” tách thành thông báo; nút nói đúng hành động “Bỏ lưu sách”. Nút chưa
  lưu là “Lưu sách”. Busy/loading khóa mutation; không hiển thị success trước
  server response hoặc dữ liệu đã xác nhận.
- Membership đọc hết các trang cần thiết theo API hiện có (`limit=50`, lọc
  subjectType); sách ngoài trang đầu không bị coi là chưa lưu. Dừng khi tìm được,
  hết cursor hoặc lỗi; cursor lặp bị từ chối. Lỗi đọc có nút kiểm tra lại và khóa
  mutation; lỗi PUT/DELETE hiện Notice kiểm soát, giữ đường thử lại.
- Hooks lưu/bỏ lưu cập nhật cache membership từ server acknowledgement rồi
  invalidate wishlist. Consumer danh sách đã lưu vẫn dùng query phân trang cũ.
  Không thay preferences mặc định hoặc semantics PUT/DELETE hiện có.
- Bỏ nhãn phụ trên tiêu đề đăng nhập và Sách đã lưu theo correction của reviewer;
  giữ heading, nội dung tác vụ và primitives hiện hành.

Source: [button](../../apps/mobile-react-native/src/features/wishlist/wishlist-button.tsx),
[model](../../apps/mobile-react-native/src/features/wishlist/wishlist-model.ts),
[account route](../../apps/mobile-react-native/src/app/account.tsx),
[login](../../apps/mobile-react-native/src/features/auth/login-screen.tsx),
[danh sách đã lưu](../../apps/mobile-react-native/src/features/wishlist/wishlist-screen.tsx),
[book route context](../../apps/mobile-react-native/src/features/shelf/book-screen.tsx).

## Bằng chứng thực chạy

Android35 Pixel_7 x86_64/1080×2400, APK debug có sẵn02/10 nhận JS hiện tại qua
Metro.390dp100% và320dp130%; gear là dev-client overlay. API dist cùng source
backend không đổi, replica rs-test/database `*_test` riêng, storage FAKE/Sharp.
Accounts/books QA, bìa tư liệu theo [nguồn](shelf-directions/assets/sources.json).
Không chụp lúc nhập credential hoặc màn tài khoản có credential QA.

| Ca | Kết quả / evidence |
| --- | --- |
| Mở login và hủy về đúng sách | PASS thao tác; [form trống](android-usability-round-01/login-entry.png) |
| Login trở về đúng sách, chưa tự lưu | PASS; [quay về](android-usability-round-01/login-return.png), API read xác nhận chưa lưu |
| Lưu và tìm lại từ Tài khoản → Sách đã lưu | PASS; [đã lưu](android-usability-round-01/saved.png), [danh sách](android-usability-round-01/wishlist.png); API read xác nhận có listing |
| DELETE503 và thử lại | PASS; [lỗi](android-usability-round-01/remove-error.png), [bỏ lưu thành công](android-usability-round-01/removed.png); QA DB giữ item khi lỗi và xóa sau retry |
| PUT503 và thử lại | PASS; [lỗi](android-usability-round-01/save-error.png); QA DB không có item khi bị từ chối, có sau retry |
| GET wishlist503,320dp130% và kiểm tra lại | PASS; [lỗi đọc](android-usability-round-01/read-error-320-130.png), [phục hồi](android-usability-round-01/recovered-320-130.png) |
| Membership trang sau / scan lỗi / cursor lặp / phân biệt catalog-listing | PASS5 unit tests; không cộng thành native pagination PASS |
| Return UUID hợp lệ, sai/URL/array | PASS7 unit tests; invalid-route native NOT RUN |

Fault proxy loopback chỉ từ chối đúng method wishlist với503 trước khi forward;
không tắt Metro hoặc lỗi API khác. Đây là HTTP503, không là live Supabase hay
mạng di động thực. Helper assertion login lặp chạm429 theo limiter hiện có;
không reset/bỏ limiter. Các kiểm sau dùng read-only QA DB đã xác nhận tên/replica,
không nhận đó là API-read PASS. Tap vào control ngoài viewport ban đầu không
thực hiện; đã cuộn tới control rồi thao tác lại, không sửa UI vì lỗi automation.

RN120/120 tests trong17 file PASS; typecheck PASS; lint0errors/4warnings có sẵn
ở route/contracts wishlist. Sau batch bỏ kicker, typecheck/lint được chạy lại;
không thêm test mô phỏng việc xóa nhãn. Prettier3.6.2 check9 file source/test PASS.
Export preview0 Android/iOS/web PASS,13 static routes; có cảnh báo NO_COLOR và
Expo forceful exit sau khi xuất dist, exit0. Lượt export trước bị dừng để áp dụng
correction, không tính PASS. Export không chứng minh runtime iOS/native acceptance.
Không chạy lại backend gates vì không đổi backend/contract.
Docs check PASS:254 Markdown/1809 relative links/4 skill-adapter pairs; không
kiểm anchors, URL ngoài hoặc nghiệp vụ. `git diff --check` PASS.

Fresh Impeccable finish reviewer yêu cầu recapture hai ca lỗi lưu/bỏ lưu bị
cuộn che, rồi một batch sửa bỏ hai kicker ở login/wishlist. Đã recapture đủ
Notice/CTA, sửa batch và chụp lại hai màn bị ảnh hưởng; verdict **ship** cho fix
đã chấm, không là human review hoặc nghiệm thu toàn app. Chín PNG hiện hành được
dẫn ở bảng; ảnh thăm dò đã bỏ. Documenter xác nhận không cần đổi PRODUCT/DESIGN/
sidecar/recipe. Standalone QUALITY BAR card không cung cấp riêng; reviewer dùng
incumbent `2dc069b`, direction đã duyệt và scope refinement. Native không dùng
detector HTML/CSS; không reroll hoặc chọn lại direction.

Cleanup: dừng QA API3046/media3047/proxy3048/Metro8081, xác nhận không còn listener;
drop đúng database/users/roles riêng sau kiểm rs-test và dừng mongo-test57017.
Mongo local37018 và spending-tracker5432 giữ nguyên. Font1.0/density443 được đọc
lại; reverse8081/3009/3047 đã bỏ. ADB từng không phản hồi, đã khởi động lại server
local một lần và xác nhận kết nối. Emulator đang do Android Studio quản lý được
giữ mở; không tắt ứng dụng của người dùng. Config/credential/journal QA nằm local
ignored, không đưa vào commit. Dataset của gói này đã dọn, không còn phục vụ pilot.

## Pilot và bước tiếp

[Protocol](../design/ANDROID_USABILITY_ROUND_01.md),
[phiếu trống](templates/ANDROID_USABILITY_SESSION.md),
[brief đăng sách](../design/ANDROID_POSTING_BRIEF.md) đã chuẩn bị.
**Human pilot NOT RUN**; không có người thử, phản hồi, tỷ lệ thành công hoặc ký
nhận nào được tạo bởi AI. Nhóm có thể thử khả năng hiểu dù chưa mua/bán sách cũ;
ghi first-use hay rehearsal theo mức biết UI, giữ thiên lệch nhóm rõ trong kết luận.

Technical preflight theo mục chuẩn bị #5 của protocol **chưa hoàn tất**: native
paging nhiều trang chưa chạy. Trước buổi pilot cần dựng fixture QA mới, kiểm ca
sách đã lưu ở trang sau và xác nhận lại checklist với đúng source/dataset buổi đó.
Các ca đã chạy trong bảng không chứng minh toàn bộ checklist PASS.

TalkBack/ARM/điện thoại thật/iOS, native paging nhiều trang, mất acknowledgement
sau khi ghi, refresh-token expiry/race, invalid-route native, preferences
checkbox lỗi và dark theme riêng NOT RUN. READINESS không đổi. Đây không là
nghiệm thu toàn app hoặc triển khai màn đăng sách.

Sau pilot: sửa P0/P1 của tìm/xem/lưu, tổng hợp câu chữ khó hiểu rồi thực thi brief
đăng sách. Không push/PR/merge/deploy trong gói này.
