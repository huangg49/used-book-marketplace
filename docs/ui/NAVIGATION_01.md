# Quầy xanh rừng — 02/10/2026

Nhánh `codex/ui-forest-navigation`, base `f35fb16` (kệ B và chuyển động).
Chủ dự án duyệt hướng Quầy xanh rừng, yêu cầu kiểm cả gesture và ba nút Android.
Source UI `6c6b8cd` + checkpoint
`fix(rn): compact navigation labels and configure system buttons`. Chưa push/PR/merge.
**Bố cục đã kiểm Android; nhãn130% đang hoàn thiện theo phản hồi. APK có module
thanh hệ thống mới đang chờ Metro khởi động lại để kiểm cuối. Chưa chốt gói.**

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
  contract, query, permission/session, command hoặc thêm dependency.
- Nhãn nhìn thấy đổi thành “Sách tôi”, accessibilityLabel giữ “Sách của tôi”;
  đệm ngang4px/gap4px, không cắt nhãn/thu nhỏ font/khóa chiều cao. Catalog dùng
  cùng primitive. 390dp/130% đã thấy một dòng; web320px/135% ba nhãn đều một dòng.
- Qua kiểm thật phát hiện nút Android khi OS dark bị nhạt trên nền sáng. Thêm
  `expo-navigation-bar~57.0.3`, plugin enforceContrast:false/style:dark và root
  SystemNavigationBar style="dark". Source SDK57 dùng dark cho màu nút tối trên
  nền sáng. Cần binary mới; không sửa generated Android bằng tay hoặc theme OS.
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

## Android đã kiểm và lỗi phát hiện

QA riêng `latlai-ui-quay`, Mongo37017/random *_test, API3046/media3047; storage
fixture FAKE. Giữ nguyên5listing qua API, bìa theo bộ [kệ B](SHELF_B_NATIVE.md).
Không reset/seed lại DB hoặc đụng bucket/config chính. Headless Pixel_7/API35/
x86_64,1080×2400/density443 ≈390dp. Phiên nối tiếp tạo snapshot mới của app/APK/
font/density/nav overlay/night/animation/reverses ở ignored `.tmp/ui-quay-native-02`;
không phục hồi snapshot cũ `.tmp/ui-quay` đè trạng thái mới của người dùng.

Trên source6c6b8cd/binary cũ, đã thao tác và xem ảnh:

- Gesture/ba nút ×100%/130%: navbar ngoài cuộn và trên vùng hệ thống, không đè
  tab/nhãn. Ở130%, “Sách của tôi” xuống hai dòng đầy đủ, cả hàng tăng chiều cao.
  Bounds ba nút: tab y2067–2245(100%)/1997–2245(130%), hệ thống y2267–2400.
- 320dp/130%: ba nhãn hiện đủ hai dòng; chạm “Sách của tôi” khi anonymous mở
  login theo gate hiện có. Không coi đây là nghiệm thu draft của Member.
- Login có IME thật; Back ẩn bàn phím, giữ nội dung “qa”. Tìm `qa-no-match` có
  bàn phím, Search/Enter đến rỗng, bỏ lọc phục hồi5cuốn. Cuối kệ tên dài/Worn/
  giá1M+999K, thông báo/nút cập nhật vẫn cuộn xem đủ trên navbar.
- Chạm thật Back từ login về kệ, Home đến launcher, Recents đến app card.
  Khi trở lại có warning devclient ExpoCLI10.0.2.2:8081; cold launch URL127 đã
  phục hồi. Không sửa product để giấu warning hoặc dùng ảnh toast làm ảnh chuẩn.
- OS dark cold launch: gesture rõ, nhưng ba nút chỉ khoảng **2.04:1** với nền;
  đây là lỗi thực, không ghi PASS. Patch paint bottom inset theo useColorScheme
  đạt lúc cold nhưng đổi nóng có ca **1.44:1**; override JS sau startup cũng chưa
  sửa được cold launch. Cả hai thử nghiệm đã bỏ, Screen/root JS trở về6c6b8cd.

## Cấu hình Android và phần còn chờ

Thử android.userInterfaceStyle=light và build4m23s thành công nhưng nút OS dark
vẫn nhạt trên APK thật; đã bỏ config này. Phương án hiện tại dùng module chính
thức Expo, vì cần đặt màu nút trực tiếp thay vì đoán theo Appearance.
`node scripts/build-android.mjs --emulator` với Node24.19/JDK21.0.11/Ninja1.12.1
PASS4m46s,338tasks, APK debug x86_64; cài-r QA. Có warning deprecated/Windows
object path nhưng exit0. Generated styles xác nhận windowLightNavigationBar=true
và enforceNavigationBarContrast=false. Đã backuporiginalAPK/app; không commit APK.
RN96/96/typecheck/lint PASS; web export12routes PASS và IAB320px/135%/Enter/selected
đã xem trên nhãn mới. [Ảnh web nhãn gọn](navigation-01/web-compact-320-135.jpg).

**BLOCKED runtime:** Metro process còn nhưng /status timeout10s sau cập nhật
dependency; app chờ splash. Đã gửi yêu cầu restart --clear cho chủ dự án. Lệnh
start Metro của agent các lượt trước bị duyệt tự động chặn “blocked by policy”.
QA API/media/Mongo/emulator giữ sẵn; chưa lấy ảnh splash làm nghiệm thu.

Bước tiếp: khi Metro online, kiểm chính binary mới ở OS dark cold/hot/resume,
gesture/ba nút; chụp6ảnh cuối100%/130%, kiểm320dp nếu cần. Before gesture tái sử
dụng f35fb16 trong [motion01](MOTION_01.md); không có Before ba nút. Gallery đã
dựng tại `navigation-01.html` nhưng chưa mở duyệt vì ảnh cuối chưa đủ. Sau kiểm,
phục hồi app/settings/reverses, dừng own QA/emulator, cập nhật evidence và
SESSION_STATE, commit checkpoint rồi chờ chủ dự án duyệt thẩm mỹ. Chưa push/merge.
Giữ binary có module mới để tương thích source; original APK đã backup riêng.

NOT RUN: nghiệm thu APK mới/các ca trên, TalkBack/audio/focus thật, ARM/FPS/
release/iOS và API E2E/live Supabase không liên quan. Human review/native/release
gate vẫn mở; C02/C04 chưa bắt đầu.
