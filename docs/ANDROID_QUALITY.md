# Kiểm tra môi trường và chất lượng Android

Đợt bàn giao 28/09/2026: xem [UI polish và bằng chứng mới](handoff/UI_POLISH.md).
Build debug x86_64 với icon/splash Lật lại qua. Vòng tiếp nối đã kiểm một phần
session, picker/upload JPEG qua Supabase thật và form chữ OS 130% trên Android 15;
xem [bằng chứng và ca còn mở](handoff/NATIVE_RUN_2026_09_28.md).
Đã sửa lệnh dev media worker dùng Nest để sinh dependency metadata trước khi chạy.
Những kết quả lịch sử bên dưới giữ nguyên phạm vi/ngày; chưa nghiệm thu toàn bộ native.

React Native là client ưu tiên. Export web, APK debug và kiểm thử trên điện thoại
là ba bằng chứng khác nhau; không dùng kết quả này thay cho kết quả kia.

Vòng handoff hiện hành dùng [21 ca native và phiếu kết quả](handoff/NATIVE_ACCEPTANCE.md).
Tài liệu đó phân biệt mất kết nối API với debug APK chưa nạp được JS khi Metro
offline; không coi checklist được viết sẵn là đã chạy trên thiết bị.

## Kiểm tra trước khi chạy

Tại root, sau khi làm theo [hướng dẫn RN](REACT_NATIVE_START.md):

```powershell
pnpm doctor:local
```

Lệnh chỉ đọc: kiểm tra cấu hình API/RN, phiên bản Node, kết nối PostgreSQL trong
cấu hình hiện hành, checksum từng migration, hàng đợi ảnh quá hạn, bucket riêng tư
và readiness của API. Không in URL database, khóa hay nội dung lỗi từ provider.
FAIL trả exit code 1; WARN cần đọc và xử lý theo tình huống. Không có job quá hạn
không chứng minh worker đang chạy; API cũ đang trả lời không chứng minh database
trong `.env` mới truy cập được.

Mở ba terminal riêng: `pnpm dev:api`, `pnpm dev:media`, `pnpm dev:rn`.
Database phải chạy và `pnpm db:migrate` phải thành công trước API/worker.
Không dựa vào process cũ hoặc database tạm của người khác để bàn giao.

## Build APK debug cục bộ

Cài Node theo `.nvmrc`, pnpm theo `packageManager`, JDK tương thích Android Gradle
Plugin, Android Studio/SDK và một Android Virtual Device. Đặt `JAVA_HOME` tới JDK
và `ANDROID_HOME` tới SDK; script tự nhận SDK mặc định Windows nếu có.
Gradle có thể tải dependency, NDK và CMake trong lần đầu. Không cần dịch vụ build trả phí.

```powershell
pnpm install --frozen-lockfile
pnpm build:android --emulator
```

`--emulator` chỉ build ABI x86_64 cho AVD tương ứng. Bỏ cờ để build các ABI mặc định,
bao gồm thiết bị ARM. Script chạy Expo prebuild rồi Gradle assembleDebug, giới hạn
hai Gradle worker. Thư mục `android/` được sinh lại từ cấu hình Expo và bị Git bỏ qua.
Không sửa native project sinh ra làm nguồn cấu hình chính.

Windows dùng `scripts/android-paths.gradle` chuyển thư mục trung gian CMake về
`android/.native/`, tránh đường dẫn output quá sâu trong pnpm. Script yêu cầu Ninja
>= 1.12, truyền đường dẫn qua `CMAKE_MAKE_PROGRAM`. CMake 3.22.1 **và** 3.31.1 trong
SDK đã kiểm tra đều đóng gói Ninja 1.10.2; chỉ nâng CMake không giải quyết được lỗi.
Tải Ninja 1.12.1 từ [release chính thức](https://github.com/ninja-build/ninja/releases/tag/v1.12.1),
giải nén vào `.tmp/ninja-1.12.1/` hoặc đặt `LATLAI_NINJA` tới `ninja.exe` có sẵn.
SHA-256 của `ninja-win.zip` đã dùng:
`f550fec705b6d6ff58f2db3c374c2277a37691678d6aba463adcbb129108467a`.
Kiểm tra bằng `Get-FileHash <zip> -Algorithm SHA256` trước khi chạy.
Không vá `node_modules`,
không hạ phiên bản thư viện hay tắt New Architecture. Nếu workspace vẫn quá dài,
dùng checkout đường dẫn ngắn và xem [hướng dẫn Windows của Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/).

APK nằm ở `apps/mobile-react-native/android/app/build/outputs/apk/debug/app-debug.apk`.
Đây là debug APK cần Metro, không phải release để đưa lên store. Không có thay đổi
khóa ký release hoặc upload artifact lên dịch vụ bên ngoài.

## Chạy trên máy ảo

Khởi động AVD trong Android Studio. Dùng API URL `http://10.0.2.2:3000/api/v1`
trong env RN cho Android Emulator; điện thoại thật cần địa chỉ LAN tin cậy.
Nếu dùng `localhost`, phải cấu hình `adb reverse tcp:3000 tcp:3000` cho thiết bị thử.
Khởi động Metro bằng `pnpm dev:rn`; cài APK qua `adb install -r <đường-dẫn-apk>`.
Dùng `adb reverse tcp:8081 tcp:8081` nếu debug app kết nối Metro qua localhost.
Không đưa Supabase server key vào RN env.

## Ma trận kiểm tra

| Nhóm | Cần quan sát |
|---|---|
| Session | Đăng nhập sai/đúng, mở lại app, khởi động offline, refresh thất bại, đăng xuất |
| Ảnh | Chọn/hủy chọn ảnh, ảnh quá giới hạn, upload, chờ xử lý, Ready, lưu/mở lại nháp |
| Gián đoạn | Mất kết nối trước/sau PUT, retry cùng idempotency key, access token hết hạn |
| Worker | Dừng worker trước complete, khởi động lại và kiểm tra job tiếp tục; lease hết hạn không chạy song song sai |
| Nhập liệu | Bàn phím không che nút, Back đóng bàn phím/hộp thoại, cảnh báo mất thay đổi |
| Giao diện | Chiều rộng nhỏ, chữ lớn, tên dài, thiếu ảnh, loading/rỗng/lỗi, checkbox và nút disabled |

`/ui` là catalog mẫu, bật `EXPO_PUBLIC_DESIGN_PREVIEW=1` và khởi động lại Metro với
`--clear`. Chữ 135% trong catalog chỉ là kiểm tra bố cục; không thay thế font scale,
TalkBack và bàn phím thật trên Android.

Nếu cần bản web QA tĩnh tách khỏi bản preview thường, chạy trong app RN:

```powershell
$env:EXPO_PUBLIC_DESIGN_PREVIEW = '1'
pnpm exec expo export --platform web --clear --max-workers 2 --output-dir .expo/quality-web
Remove-Item Env:EXPO_PUBLIC_DESIGN_PREVIEW
```

Sau đó từ root: `node scripts/preview-react-native.mjs --quality`, mở
`http://127.0.0.1:8086/ui`. Server chỉ nghe loopback. Export không có hot reload:
cần export lại và reload browser sau khi sửa code. Không export đồng thời hai cấu hình.
Nếu Metro `--localhost` chỉ nghe `::1`, dùng `http://[::1]:<port>` hoặc đặt
`NODE_OPTIONS=--dns-result-order=ipv4first` trong terminal khởi động Metro;
không cần mở server ra LAN chỉ để xem preview trên cùng máy.

## Bằng chứng đợt kiểm tra 26–27/09/2026

- Sửa upload `Uint8Array` có offset: chỉ gửi vùng byte thuộc ảnh, không gửi cả buffer nền.
  Regression đã thất bại trước sửa và qua sau sửa.
- RN: 29 tests; API unit: 14 tests. Bao gồm retry sau mất phản hồi PUT và replay
  binary request sau refresh, giữ nguyên MIME, ticket, byte và idempotency key.
- Các bài retry/session dùng transport giả lập; không phải bằng chứng mất mạng trên điện thoại.
- API E2E: 55 tests qua trên database riêng có hậu tố `_test`; gồm concurrent commands,
  quota, hết lease, stale worker, retry storage và rollback. Storage trong E2E là giả lập.
- Contract check, lint/typecheck API và RN, build API và export web đều qua.
- Web `/ui`: 320 px, chữ 135%, lỗi xác nhận giữ hộp thoại và retry thành công;
  lỗi bắt buộc tại trường, trạng thái rỗng/lỗi tải, tên sách dài xuống dòng và
  placeholder thiếu bìa. Chiều rộng trang vẫn 320 px, không tràn ngang. Không thay đổi
  dữ liệu thật. [Ảnh hộp thoại lỗi](verification/ui-quality-dialog-320.png).
- Preflight phát hiện database mặc định cổng 5432 chưa chạy, dù API preview đang khỏe.
  Khi dùng database kiểm thử riêng cổng 55432, cả sáu checksum migration và bucket
  Supabase thật đều qua. Node mặc định 24.12.0 thấp hơn minimum 24.15.0: preflight
  trả FAIL để yêu cầu chuẩn hóa, dù test ứng dụng có thể vẫn qua trên bản này.
- Bằng chứng Supabase upload thật nằm trong [media report](features/MEDIA_UPLOAD_REPORT.md).
- `pnpm build:android --emulator`: **BUILD SUCCESSFUL**, 338 tasks, APK debug x86_64.
  Máy build: Windows, JDK 21.0.11, Gradle 9.3.1, SDK 36, NDK 27.1.12297006,
  CMake 3.22.1 + Ninja 1.12.1. Không build release hoặc ARM trong đợt này.
- Preflight cũng chạy thành công bằng Node 24.19.0 với database kiểm thử riêng;
  không cần đổi cấu hình Node toàn máy để xác minh.
- Đã cài APK qua adb và mở `/ui` trên Pixel_7, Android 15/API 35. Metro nạp bundle
  Android thành công; không thấy AndroidRuntime/ReactNativeJS error trong log đã kiểm tra.
  Checkbox chữ 135% và nhập nội dung mẫu hoạt động. Phát hiện và sửa status bar trắng
  trên nền giấy: root layout đặt `StatusBar style="dark"`, đã xác nhận trực quan sau sửa.
  AVD dùng Gboard nổi/viết tay; không coi kiểm tra này là bằng chứng keyboard avoidance
  với bàn phím docked hoặc font scaling hệ điều hành.
  Sheet thông tin mở được ở chữ 135%, nội dung/nút không chạm vùng điều hướng.
  Sau thao tác vuốt cạnh phải, sheet đóng và catalog vẫn giữ nguyên.
  [Ảnh native](verification/android-ui-sheet-135.png). Nút Back phần cứng và TalkBack
  chưa được xác minh đầy đủ trong đợt này.
- iOS, Android ARM/release và điện thoại thật chưa kiểm tra. Native auth restore,
  picker/upload, background và mất mạng vẫn pending; không suy ra từ catalog UI.

Sau kiểm tra đã dừng emulator và Metro do đợt QA khởi động để trả tài nguyên máy.
APK và ảnh bằng chứng được giữ lại; không cần process tạm để đọc báo cáo.

Đợt đối chiếu listing ngày 27/09/2026: `adb devices -l` không có thiết bị kết nối.
Không có native build/runtime mới; Metro bị automatic approval review chặn ở lượt
trước và không được khởi động lại trong đợt này. Kết quả mới là 96 unit, 114 API E2E,
hai suite browser và export JS ba nền tảng. Xem [đối chiếu 32 ca listing](features/LISTING_ACCEPTANCE_REPORT.md)
để phân biệt bằng chứng mới với QA catalog native trước đây.

Increment sổ địa chỉ27/09: `pnpm build:android --emulator` build x86_64 thành công
3phút34giây,338tasks. Chỉ build, không khởi động emulator/Metro và chưa kiểm màn
địa chỉ native. Browser320px/chữ lớn và14ca API địa chỉ được ghi ở
[address report](features/ADDRESS_BOOK_REPORT.md); không thay keyboard/Back/TalkBack.

Increment nơi gửi27/09: build debug x86_64 thành công3phút7giây,338tasks;
SHA256 `4B03598BCBAF5F5123B15D15C00B9350458EB63AF1174168B68DBDF0AD72D678`.
Không khởi động emulator/Metro; chưa kiểm runtime origin picker/keyboard/Back.
Xem [fulfillment report](features/LISTING_FULFILLMENT_REPORT.md) để phân biệt
build, browser và các giới hạn native.
