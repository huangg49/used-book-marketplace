# Quầy xanh rừng — 02/10/2026

Nhánh `codex/ui-forest-navigation`, base `f35fb16` (kệ B và chuyển động).
Chủ dự án duyệt hướng Quầy xanh rừng, yêu cầu kiểm cả gesture và ba nút Android.
Checkpoint `feat(rn): add forest member navigation`. Chưa push/PR/merge.
**Đã triển khai; nghiệm thu Android đang chờ Metro8081, chưa chốt gói.**

## Thay đổi

- Primitive `NavigationBar` dùng chung nhận danh sách đích, current và onSelect;
  không biết route/session. `MemberNavigation` giữ filter role/status, ba đích và
  `router.navigate` hiện có; mục đang chọn vẫn không điều hướng lại.
- Footer xanh rừng, mục chọn nền kem bo8, icon22 và BeBold12/18; nhãn đầy đủ,
  xuống dòng khi cần, vùng chạm chia đều theo số mục thật. Focus tương phản trên
  cả xanh và kem. Giữ accessibilityState native và thêm aria-selected cho web.
- `Screen.footerAppearance="navigation"` opt-in tại kệ/account/login/drafts/ví
  chỉ đọc. Footer ngoài ScrollView, trong KeyboardAvoidingView; SafeAreaView giữ
  một chủ sở hữu inset. Không cộng bottom inset lần hai hoặc absolute overlay.
  Vùng nút hệ thống giữ nền sáng; không tự vẽ handle/Back/Home/Recents.
- Footer giao dịch/form/showcase mặc định giữ nền cũ và lề20. Không gắn navbar
  vào editor có dirty guard/chi tiết hoặc thêm đích nghiệp vụ mới. Không đổi API,
  contract, query, permission/session, command hoặc thêm dependency/native config.
- DESIGN/UI_COMPONENTS và `/ui` nhóm Điều hướng cập nhật cùng primitive.

## Kiểm tra đã chạy

Node24.19.0/pnpm11.19.0: RN **96/96 tests,13 file**, lint và typecheck PASS.
Theme test kiểm chữ chọn/chưa chọn và focus trên xanh; không tạo test chép JSX.
Expo export:web PASS12 routes, outdir riêng `.tmp/ui-quay/web-nav`, flag preview1;
không ghi dist/preview cũ. Có warning NO_COLOR/FORCE_COLOR và Expo forced exit,
exit0/artifacts đầy đủ. Export không là native PASS.

Expo web/IAB thực tại8093: `/ui` chọn mục bằng click/Tab/Enter, focus thấy được,
aria-selected chuyển đúng; chữ135% tại320/390px không cắt nhãn, các ô cùng hàng
đều chiều cao. Chuyển nhóm Sách xác nhận footer giá/nội dung giấy giữ nguyên.
Kệ API thật có5 listing QA, account/login và quay lại; QA TEST_OPERATOR chỉ còn
hai mục179px đều nhau ở390px, đăng xuất phục hồi ba mục. Không in/commit credential.

Khi xem web phát hiện accessibilityState chưa tạo aria-selected; đã sửa primitive,
export và kiểm lại. Origin8093 ban đầu chưa được QA cho phép nên kệ lỗi kết nối;
chỉ bổ sung đúng origin vào ignored harness rồi restart own QA, kệ tự phục hồi.
Không sửa backend sản phẩm để che lỗi môi trường. AI review không có blocker source;
không thay review người thật.

Ảnh **Expo web**, không giả ảnh Android:

- [Kệ390px/100%](navigation-01/web-shelf-390-100.jpg)
- [Catalog390px/135%](navigation-01/web-catalog-390-135.jpg)
- [Catalog320px/135%](navigation-01/web-catalog-320-135.jpg)
- [Focus bàn phím](navigation-01/web-focus-390-135.jpg)
- [Hai mục thật theo vai trò QA](navigation-01/web-two-tabs-390.jpg)

## Phần còn chờ và bước tiếp

**BLOCKED runtime:** Metro8081 không listen khi kiểm; đã gửi lệnh cho chủ dự án
khởi động. Các lượt trước lệnh start Metro của agent bị duyệt tự động chặn với
“blocked by policy”; chưa có native evidence mới. Không suy safe area PASS từ JSX.

QA đã dựng riêng: `latlai-ui-quay`, Mongo37017/random *_test, API3046/media3047,
storage fixture FAKE;5listing upload/process/duyệt qua API, bìa có nguồn như bộ
[kệ B](SHELF_B_NATIVE.md). Không đụng DB/bucket/config chính. Headless Pixel_7/API35/
x86_64,1080×2400/density443 ≈390dp đã snapshot app/font/density/nav overlay/night/
animation/reverses tại ignored `.tmp/ui-quay`; own QA/emulator giữ sẵn chờ Metro.

Khi Metro chạy: chụp Android100%/130% ×gesture/ba nút; kiểm chạm Back/Home/Recents,
nhãn/navbar trên vùng hệ thống, cuối kệ/đổi tab, keyboard search/login và Back;
kiểm320dp/130% và dark OS nếu phù hợp, phục hồi settings/app snapshot sau QA.
Ảnh Before gesture có thể tái sử dụng bộ f35fb16 trong
[motion01](MOTION_01.md); ghi rõ nguồn, không giả Before ba nút hoặc so web với
native như cùng một phép thử. Cập nhật báo cáo này và SESSION_STATE bằng kết quả
thực, chụp trước/sau rồi chờ chủ dự án duyệt thẩm mỹ; chưa push/merge.

NOT RUN: native các ca trên, TalkBack/audio/focus thật, ARM/FPS/release/iOS và
API E2E/live Supabase không liên quan. Human review/native/release gate vẫn mở;
C02/C04 chưa bắt đầu.
