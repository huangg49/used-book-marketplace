# Môi trường thử Android — tìm → xem → lưu

Dành cho [pilot trong nhóm](../design/ANDROID_USABILITY_ROUND_01.md), không cần
kinh nghiệm mua/bán sách cũ. Dùng app native + API/Mongo thật trên QA riêng;
ảnh qua storage FAKE và Sharp, không là kiểm chứng Supabase. Không dùng dữ liệu
hoặc bucket local chính. Chỉ chạy một dataset API và một Metro cùng lúc.

## Chuẩn bị

Checkout chứa Android search/detail/save đã duyệt (gốc `684d2ea`) và runner
`scripts/android-pilot.mjs`. PR31 đã được chủ dự án merge vào main `dec19b3`;
checkout hiện hành của gói web và worktree pilot là hai nơi khác nhau.
Node24.15+, pnpm theo packageManager, Docker Desktop và Android Studio;
dependency/setup theo [START_HERE](../handoff/START_HERE.md).

Trong terminal ở **đúng checkout**:

```powershell
pnpm infra:mongo:test:up
pnpm --filter @used-books/api build
pnpm qa:android serve pilot-p01
```

Giữ terminal đến dòng READY. Tên `pilot-p01` là ví dụ: mỗi người thử dùng tên mới
để có tài khoản/dataset riêng. Runner tạo private config dưới `.tmp/demo/<tên>/`,
Mongo `*_test` tại57017/rs-test, API3046, ảnh3047, proxy3048. Không sửa `.env`.
Credentials, IDs và journal giữ local ignored; không gửi lên chat/Git.
Nếu quota/login429 hoặc lỗi chưa chắc kết quả, dừng và giữ journal; không đổi
key/body/version để ép thành công, không xóa counters. Login limiter5 lần/cửa sổ
15 phút dùng chung IP; status không đăng nhập. Chờ cửa sổ tự hết trước retry.

Dataset pilot có7 bài đăng: Gatsby65.000đ/giá trị đổi80.000đ, một Gatsby150.000đ
để so ngân sách100.000đ, Sale/Exchange/Both, Gatsby3 ảnh, một bản thiếu phụ lục
nhưng nội dung chính đọc được. Mọi giá/tình trạng đều mô phỏng và có nhãn QA.
Buyer bắt đầu chưa lưu sách. Dataset `--paging` dành riêng kiểm kỹ thuật, không
dùng51 mục gây rối bài thử đầu.
Ba ảnh Gatsby là biến thể kích thước của bìa tư liệu QA, dùng kiểm gallery;
buổi thử này chưa đánh giá chất lượng ảnh tình trạng của bản sách thật.

## Mở app

Terminal thứ hai tại cùng checkout:

```powershell
pnpm qa:android metro pilot-p01
```

Runner dùng preview0, API localhost3009 và Metro IPv4 localhost8081. Khởi động
AVD trong Android Studio; dùng `adb devices` xác định serial thực tế. Ví dụ:

```powershell
$adb = Join-Path $env:LOCALAPPDATA 'Android/Sdk/platform-tools/adb.exe'
$serial = 'emulator-5554' # thay nếu adb devices khác
& $adb -s $serial reverse tcp:8081 tcp:8081
& $adb -s $serial reverse tcp:3009 tcp:3048
& $adb -s $serial reverse tcp:3047 tcp:3047
& $adb -s $serial shell am start -W -a android.intent.action.VIEW -d 'mobilereactnative://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.huangg49.mobilereactnative
```

APK debug phải cài sẵn; máy mới làm theo [Android QA](../ANDROID_QUALITY.md).
Giữ Metro/API khi thử. Nếu lần bundle đầu lâu, xem log chứ không bấm đăng nhập
lặp. Không chạy export `--clear` hoặc đổi nhánh trong checkout này khi thử.

T3 người thử tự tìm lối đăng nhập. Khi form trống mở, dừng ghi màn hình và dùng
terminal thứ ba nhập credential QA cục bộ, không cần chép mật khẩu:

```powershell
pnpm qa:android login pilot-p01 --device emulator-5554
```

Lệnh chỉ điền Email/Mật khẩu; người thử tự bấm Đăng nhập và tiếp tục. Đây là
trợ giúp setup credential, ghi ở phiếu; không tính như trợ giúp tìm nút. Không
chụp form đã điền hoặc màn tài khoản có email QA. Nếu cần làm lại cùng người,
đăng xuất và `pnpm qa:android reset pilot-p01` để xóa wishlist **buyer QA của run**;
lệnh đọc đủ các trang trước khi xóa qua API, không sửa DB trực tiếp.

`pnpm qa:android status pilot-p01` kiểm public target không tiêu thụ login.
Các lệnh `fault-read`, `fault-save`, `fault-remove` mô phỏng503 đúng method
wishlist; `fault-none` khôi phục. Chỉ dùng ca tùy chọn có người điều phối; không
tắt Metro để giả lỗi mạng. Proxy không ghi token/header/body/URL riêng tư.

## Dừng và chạy lại

```powershell
pnpm qa:android fault-none pilot-p01
pnpm qa:android stop pilot-p01
& $adb -s $serial reverse --remove tcp:8081
& $adb -s $serial reverse --remove tcp:3009
& $adb -s $serial reverse --remove tcp:3047
```

Stop dừng API/media/proxy/Metro của run, không xóa dataset, không tắt emulator
hoặc Docker của người dùng. Giữ lock cho process còn chạy; không tự xóa lock để
chiếm run. Nếu stop không hết listener, kiểm đúng PID/checkout trước xử lý.
Nếu QA Mongo vẫn chạy, có thể serve lại cùng tên để giữ dataset. QA Mongo dùng
tmpfs: sau khi container restart dữ liệu mất, phải dùng tên mới; giữ journal cũ
để đối chiếu, không replay vào DB đã mất. Khi kết thúc mọi QA mới dùng
`pnpm infra:mongo:test:stop`; không dừng khi có runner khác đang dùng.

## Kiểm phân trang riêng

```powershell
pnpm qa:android serve paging-r01 --paging
```

Runner tạo51 listing qua API,3 người bán QA để tuân quota20 upload/người/giờ;
ảnh nhỏ giữ ngân sách50MB. Wishlist **seller Member QA đầu tiên** có51 mục,
Gatsby được lưu đầu nên nằm cuối thứ tự thời gian. API kiểm50 mục đầu không có
Gatsby, trang2 có đúng Gatsby. Không phải thao tác database để bịa trạng thái.
Mở login rồi điền `pnpm qa:android login paging-r01 --device emulator-5554 --actor seller`.
Trong app tìm Gatsby, xem Đã lưu/Bỏ lưu; vào Sách đã lưu, Tải thêm tới Gatsby.

Serve lại dataset đã có manifest giữ nguyên wishlist và không tự seed/login lại.
Nếu lượt seed trước dừng giữa chừng, dùng `pnpm qa:android seed-pagination paging-r01`
để reset/seed **seller QA đầu tiên** và kiểm API50+1; không dùng lệnh này trong
buổi người dùng đang thử. Giữ journal khi có lỗi, chờ limiter nếu cần.

`trace-reset paging-r01` làm trống trace trước thao tác native. Proxy ghi duy
nhất số lượng/trang có cursor/target có mặt/status (không IDs/cursor/token),
ở `.tmp/demo/<tên>/membership-trace.ndjson`; dùng cùng ảnh native để xác nhận
client thực sự đọc trang2. Kết quả thực chạy và source ở [báo cáo lưu sách](ANDROID_SAVE_USABILITY.md).

Human pilot vẫn NOT RUN cho tới khi thành viên thực hiện bài thử và điền
[phiếu](templates/ANDROID_USABILITY_SESSION.md). Setup hoặc native preflight
không đóng gate usability, TalkBack, ARM, iOS hoặc READINESS.

## Checkpoint đang mở trên máy chủ dự án

10/10/2026: managed worktree `android-pilot-preflight`, nhánh
`codex/android-pilot-qa` (RN base `684d2ea`). Primary main `d71ad3e` là checkout
khác; mở terminal ở worktree chứa file hướng dẫn này. Dataset
`android-pilot-p01-20261010` đã READY; API/media/proxy/Metro và Pixel_7
`emulator-5554` giữ chạy. App ở tìm sách, anonymous; buyer wishlist trống và
fault none. Phiếu chưa điền ở `.tmp/usability-round-01/P01.md`.

Riêng worktree local này reuse dependency bằng junction. Dùng flag theo lệnh
(không đổi cấu hình global và không reinstall/purge dependency của primary):

```powershell
pnpm --config.verify-deps-before-run=false run qa:android status android-pilot-p01-20261010
pnpm --config.verify-deps-before-run=false run qa:android login android-pilot-p01-20261010 --device emulator-5554
pnpm --config.verify-deps-before-run=false run qa:android stop android-pilot-p01-20261010
```

Login chỉ dùng khi form trống đang mở. Nếu môi trường đã dừng, chạy serve/metro
với cùng tên và flag trên khi QA Mongo chưa restart; nếu DB tmpfs đã mất, dùng
tên mới. Node24.15+ phải ở đầu PATH theo setup; không dùng Node cũ từ terminal.
Các checks và giới hạn ở [báo cáo](ANDROID_SAVE_USABILITY.md).
