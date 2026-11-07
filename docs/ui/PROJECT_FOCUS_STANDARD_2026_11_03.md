# Quy chuẩn focus toàn dự án — 03/11/2026

Owner chọn hiệu ứng ô tìm kiếm Admin Users và yêu cầu áp dụng chung. Nhánh
`codex/project-focus-standard`, base156bba25, source1dd524bb. Phạm vi là runtime
UI của Member React/Vite, Admin/Staff, RN/Expo web và Flutter. NestJS/contract/
session/DB không đổi. HTML prototype lịch sử trong public/design và design-previews
đã được nhận diện trong inventory, không phải entry runtime và không được coi là
những client đã nghiệm thu. Không viết lại các prototype để tạo evidence sản phẩm.

## Khảo sát và quyết định

`rg` inventory đầu tìm452matches/125files; bao gồm focus route/order ID và hook
foreground không phải focus thị giác. Hai web runtime có106dòng outline-offset
với nhiều khoảng hở/underline/glow khác nhau. RN field mặc định xanh và đổi border
1→2 khi focus; layout.focus offset3. Flutter có focus vàng ở auth,1.5px ở filter,
focusedBorder2px trong AppTextField và chưa có input/button focus theme toàn app.

Quy tắc được lưu ở [UI rules](../design/UI_CODING_RULES.md):

- Text field: border1px + shadow1px wine sát mép, transition140ms. Giữ nền/radius
  theo màn; không đổi padding/geometry khi focus. Nút/tab/link/checkbox/radio/vùng
  cuộn có chỉ báo bàn phím sát mép; nút nền wine có nét sáng bên trong để nhìn rõ.
- Error giữ sắc error. Focus không thay checked/selected, disable/permission hoặc
  validation. Forced-colors dùng outline hệ thống2px, offset0; không đổi OS.
- Ô có icon/đơn vị hoặc file input ẩn chỉ vẽ tại owner bên ngoài, không hai vòng.
  Label chứa file picker có owner con không được nhận thêm vòng ở cả caption.
- Không thay motion/Back/cleanup và không suy điều kiện reduced-motion thành lý do
  bỏ hiệu ứng đã thiết kế. CSS field transition giữ140ms kể cả OS reduce.

## Triển khai

| Client | Nguồn và thay đổi |
| --- | --- |
| Member web | [main](../../apps/user-web/src/main.tsx) import [focus.css](../../packages/brand/v1.1/focus.css); marker wrapper ở Search/range giá, auction bid/create/auto-bid, duration, nhận đề nghị đổi, AI photos/evidence và ảnh đóng gói; header inverse cho nền wine |
| Admin/Staff | [main](../../apps/admin-web/src/main.tsx) import cùng CSS; PaperCombobox và CommandPalette có owner; sidebar/drawer inverse; global policy phủ CSS lazy của page và portal AntD |
| React Native | [field](../../apps/mobile-react-native/src/core/ui/field.tsx), [styles](../../apps/mobile-react-native/src/core/ui/styles.ts), [theme](../../apps/mobile-react-native/src/core/ui/theme.ts): token focus wine, offset0, border field giữ1px + shadow1px, giữ callback/ref/input; AppTextInput có focus paint và Driver dùng facade này; nút fill có nét sáng |
| Expo web | BrandProvider import platform adapter: native là no-op, `.web.ts` nạp CSS chung. Đã export và kiểm browser bằng component RN thật; không tạo token/session thứ hai |
| Flutter | [theme](../../apps/mobile-flutter/lib/core/theme/app_theme.dart): input/error focus và side theo WidgetState.focused cho button themes, giữ disabled; SearchField có Focus/AnimatedContainer140ms và focusedBorder.none ở input con để không lồng viền; auth đổi focus vàng→wine, shelf1.5→2px |

Layer `latlai-focus` dùng important chỉ ở focus paint và field transition để
override những focus rule page/vendor có specificity khác nhau. Không override
width/height/display, không bỏ transform/animation của card hoặc hiệu ứng hành
trình. Composite marker là `data-focus-surface`; invalid owner dùng aria-invalid
hoặc `data-focus-invalid`. Error/selected không được dùng làm focus proxy.

Flutter dùng theme defaults theo
[InputDecorationThemeData](https://api.flutter.dev/flutter/material/ThemeData/inputDecorationTheme.html)
và [ButtonStyle.side](https://api.flutter.dev/flutter/material/ButtonStyle/side.html).
Đối chiếu API không thay việc compile/native QA; widget tự override theme cần được
kiểm trên thiết bị, không được tự coi mọi màn Flutter đã khớp chỉ vì đổi theme.

## Evidence thực chạy

| Kiểm tra | Kết quả / giới hạn |
| --- | --- |
| Member build/typecheck | PASS; warning chunk500k cũ |
| Admin build/typecheck/bundle check | PASS |
| RN typecheck | PASS; không dùng cast để ép prop native chưa hỗ trợ |
| Unit | Member324/47files, Admin229/34files, RN224/28files PASS; tổng777 |
| Lint scope | Cả3app exit0; Member/Admin vẫn có warning refs/effect có sẵn; RN0warning |
| Browser focus policy | PASS8app/viewport/motion cases ×13focus targets: real login fields, load toàn bộ CSS có focus kể cả lazy, rồi DOM fixture cho field/error/composite/file/nested-file/checkbox/radio/button/tab/link/summary; checked/selected/disabled, keyboard và forced-colors giữ đúng |
| Search recovery | PASS8checks/0pageerror; IME, blur, no-match, network/timeout/retry, controlled HTTP, không DB |
| Order/chat workspace | PASS snapshot/quyền/exact retry/mất ACK/file draft/mobile130%; isolated HTTP/Socket.IO, không DB/storage/provider |
| Expo export | PASS với EXPO_PUBLIC_API_BASE_URL là URL fixture5192 ở process QA; không ghi `.env` hoặc thay cấu hình deploy |
| Expo browser | PASS màn forgot-password390px từ export, outline none/border wine/shadow1px,0pageerror; mọi API bị intercept401, không gửi OTP/mail |
| Localhost sau tích hợp | PASS4ca Order1440/390 × motion thường/reduce, chuột/Tab/Shift+Tab/geometry; thêm Search5174 và Admin login5173,0pageerror/0transaction command |
| Detector | Exit0,0findings trên sharedCSS; không đại diện usability/native |
| Flutter format/analyze/test/native | NOT RUN: không tìm thấy Flutter/Dart SDK trên PATH; source review và đối chiếu API không phải Flutter PASS |
| RN Android/iOS runtime | NOT RUN; Expo web không là native PASS |

`pnpm test:focus:browser` chạy fixture tại5190/5191, cache Vite riêng, tự đóng
browser/server. Evidence riêng `.tmp/project-focus/`, export/logs trong `.tmp`.
Các ảnh đã được xem gồm fixture Member/Admin, Expo forgot-password và crop Order.
Lượt đầu chạy nhiều Vite fixture chung cache có lỗi khởi tạo frontend; đã tách
cache và chạy lại Search độc lập PASS. Assertion màu chờ computed paint ổn định
thay fixed sleep để không đọc giữa transition140ms; không nới tiêu chí màu/quyền.
Lượt Expo đầu thiếu public API URL không boot; export QA có cấu hình process đã
qua, không sửa code auth để né yêu cầu cấu hình. Các lần fail đầu không tính PASS.

## Kích hoạt và phần còn mở

Checkout Documents fast-forward tới1dd524bb, giữ nguyên5file tracked đang sửa
riêng về uy tín/reviews/support/WalletHistory và Pagination untracked. Đã lưu patch
tracked và bản sao Pagination riêng trước tích hợp; không reset/stash/clean hoặc
đưa local work đó vào commit gói. Member5174/Admin5173/API3000/Mongo27017 giữ chạy;
không migrate/seed, không restart DB/API/worker hoặc đổi private env.

Web runtime đã áp quy chuẩn chung. RN native/Flutter cần SDK/thiết bị và kiểm các
widget override/keyboard/assistive technology trước nghiệm thu. Không khẳng định
mọi màn native đã PASS, không đóng READINESS, không push/PR/merge remote hoặc CI mới.

## Follow-up thanh tìm sách

Owner báo cảm giác nhấc lên khi focus, nhánh `codex/search-focus-smoothness`,
codee84bbfb3. RAF measurement trên localhost1440px cho thấy x/y/height không đổi;
bóng nền lệch xuống3px, blur12px chuyển thành ringY0 khiến cảm giác thị giác bị
nhấc. Resting shadow đổi sang offset0/blur0/spread0, focus vẫn spread1 theo policy;
focus và blur cùng140ms. Bỏ focus-within glow cũ của Search để không cạnh tranh
nguồn chung. Không đụng autocomplete/history của browser hoặc logic query/IME.
PASS build và Search recovery9checks; ca mới đo geometry/scroll/timing/shadow
suốt cả hai chiều chuyển tiếp. Local after y100/h62, deltaY/height0; evidence
`.tmp/search-focus-smoothness/before.json` và `after.json`. Đã cập nhật Documents,
giữ các thay đổi local khác; không API/DB write, không push.

## Follow-up Hero Home

Owner yêu cầu một viền ngoài, hover vàng; sourcec00de137. Hero form trước chưa có
composite marker nên focus policy vẽ ở input, đồng thời outline vàng cũ offset4px
vẫn còn ở form. Thêm data-focus-surface, bỏ outline rời cũ; scope màu vàng theo
nền wine của Hero cho hover/focus, nút submit giữ màu focus wine trên nền cam.
Border dành sẵn1px/box-shadow tâm0, cùng140ms để không có cảm giác nâng thanh.
Quyết định màu đã ghi UI rules/AGENTS; không lan ngoại lệ sang field khác.

PASS build và `pnpm --filter @used-books/user-web test:home-search-focus:browser`:
Home route thật với intercepted HTTP,1440/390px × motion thường/reduce; hover
gold, input không outline/shadow, chỉ outer ring, geometry ổn định, Tab và Enter/
button giữ query có dấu/ký tự&. Không DB/provider. Localhost5174 thêm2viewPASS,
0pageerror/0transaction command, ảnh crop được xem tại `.tmp/home-search-focus/`.
Đã fast-forward Documents, giữ6file local và Pagination untracked của việc khác.
Không push/PR hoặc đổi READINESS/native gates.
