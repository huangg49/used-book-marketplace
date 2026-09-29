# Q01 — Bổ sung native trên Pixel_7 sau merge

29/09/2026, bắt đầu khoảng 07:20 (Asia/Saigon). Người thực hiện: Codex;
chưa có reviewer người. Đây là bằng chứng cho phần Q01 còn mở, không phải
review độc lập hoặc nghiệm thu toàn app.

## Nguồn và runtime thực tế

- Đầu phiên working tree sạch, `main`/`origin/main` cùng `ca16a22`.
  `git ls-remote origin refs/heads/main` trả
  `ca16a22065ae67c620c4c212d953ebefef188608`. Không pull/reset; nhánh local mới
  `codex/q01-native-completion` từ mốc này. Không push/merge/deploy.
- Đã đọc AGENTS, CLAUDE, bộ handoff, UI rules/components và brand 1.1; đối chiếu
  diff `382dda2..ca16a22`. Teammate đã đóng A00/U02–U06 và sửa operations detail.
  Không chạy lại full API/browser hoặc chỉnh UI đã PASS khi chưa có lỗi mới.
- Máy này là máy Pixel_7 cũ, **không phải** Medium_Phone/API 37 ở lượt teammate.
  AVD Pixel_7, Android 15/API 35, x86_64, emulator-5554, ảnh 1080×2400.
  APK debug có sẵn SHA-256
  `6cbe6646c80013b27d8f06e3799855ea2cc6e9664be337e7cf12b8fea945a039`;
  Các ca N03/N11/N13/N16 đầu lượt dùng Metro JS `ca16a22`. Sau phát hiện
  Q01-F01 đã build/cài APK mới, ghi riêng bên dưới.
- Node mặc định 24.12.0 không đạt minimum. Dùng Node **24.19.0** đã có trong
  runtime local qua PATH riêng từng process, pnpm **11.19.0**; không sửa PATH hệ thống.
- Đầu phiên không có API/worker/Metro/AVD; Docker chưa chạy. Khởi động Docker,
  dùng `docker compose --env-file .env -f infra/docker-compose.yml up -d --wait postgres`
  trên volume cũ port 5433. Không migrate/seed/reset/đổi mật khẩu hoặc sửa dữ liệu SQL.
- API và hai worker từ cùng `pnpm --filter @used-books/api build`; Metro `pnpm dev:rn`
  port 8081; `adb reverse` 8081/3000. Bundle Android đầu trả thành công sau khoảng
  36 s, 1.785 module. App vào kệ; lỗi API trước khi API lên có thông báo phục hồi.
- `pnpm doctor:local` ban đầu FAIL Node/DB; sau khôi phục PASS Node, DB,
  **17 checksum migration**, private bucket, API readiness và không có media job
  quá hạn. WARN localhost được xử lý bằng reverse, không sửa `.env`.
- Storage **Supabase thật**, worker Sharp thật; không chạy storage fixture.
  DB máy này ban đầu có một nháp JPEG của lượt 28/09, chưa có địa chỉ/catalog
  hoặc listing công khai như DB trên máy teammate. Không sao chép dữ liệu đó về đây.

## Ca đã thực hiện

| Ca | Kết quả lượt này | Quan sát và giới hạn |
|---|---|---|
| N03 | PASS | Một lần sai mật khẩu → “Email hoặc mật khẩu chưa đúng.”; sửa bằng cấu hình seed sẵn có → profile Member thật. Không tắt limiter hay đổi mật khẩu. Không lưu ảnh chứa ô mật khẩu vào Git. |
| N11 — WebP | PASS | Tạo **nháp QA riêng**, chọn ảnh WebP qua Android photo picker, thấy Ready và preview; Lưu nháp → về danh sách → mở lại → ảnh vẫn checked và làm bìa. Xác minh read-only DB ghi `image/webp`, Ready, 294.722 byte; SHA-256 bằng file nguồn. Không suy MIME từ đuôi tên file. |
| N13 — giữa PUT và lost-ack content | PASS trong phạm vi proxy dưới đây | Sau cắt giữa body có nút retry, giữ attempt; retry cùng key/body không tạo thêm media. Mất ACK sau content PUT 200: DB đã có đúng một receipt upload; retry tới Ready, một receipt finalize. Không suy sang lost-ack của submit/finalize. |
| N16 — bài đăng | PASS | Nhập mô tả chưa lưu với bàn phím Gboard docked; Back lần đầu chỉ đóng bàn phím, lần hai hiện “Rời bài đăng?”. Hủy giữ nguyên chuỗi; Back lại và xác nhận mới rời. Mở lại thấy phần mô tả chưa lưu không tồn tại, ảnh đã lưu vẫn còn. Lặp Back ở chữ OS 130% cho kết quả tương tự. |
| N16 — địa chỉ bổ sung | PASS | Tên chưa lưu, Back đóng bàn phím trước rồi hỏi rời; hủy giữ tên; xác nhận rời về account. Nút footer “Quay lại sổ địa chỉ” cũng hỏi khi đang nhập, xác nhận về danh sách; không tạo địa chỉ mới. |
| N20 | PARTIAL, bổ sung các tổ hợp còn thiếu | OS 130%: account/danh sách, form địa chỉ rỗng và lỗi, tên dài + docked keyboard, form tình trạng + docked keyboard, sheet catalog + keyboard, dialog rời, checkbox dài checked/unchecked. Footer đọc/chạm được trên bàn phím, cuộn được, không thấy tràn ngang hoặc mất nội dung. Chưa khẳng định mọi màn/tổ hợp hoặc cỡ chữ lớn hơn đều qua. |
| N08 — bổ sung sheet | PASS phạm vi Back/giữ nội dung | OS 130%: nhập tên trong sheet catalog; Back đóng bàn phím, Back tiếp đóng sheet; mở lại vẫn giữ tên. Không gửi đề nghị catalog QA. |

Checkbox được đối chiếu thêm qua UI hierarchy (`checkable=true`, `checked=true`
khi bật); đây **không phải TalkBack PASS**. Không dùng UI hierarchy thay việc
nghe và kiểm focus screen reader.

Ảnh WebP là bản chuyển định dạng/resize từ
`apps/mobile-react-native/assets/design/alice.jpg` (public-domain, nguồn trong
README assets). Chỉ để kiểm pipeline trên nháp riêng, ban đầu giữ riêng ở nháp. Cuối lượt dùng chính bài QA có nhãn rõ để kiểm
archive trên API local, rồi lưu trữ ngay; không trình bày như ảnh tình trạng sách bán.

## N13 — điểm cắt có kiểm soát

Proxy Node local nghe `127.0.0.1:3100`, chuyển tới API `127.0.0.1:3000`;
ADB reverse tạm `tcp:3000 → tcp:3100`, Metro giữ nguyên. Chỉ can thiệp PUT
`/api/v1/listings/<nháp-QA>/media/<id>/content`. Không lưu token, request body,
raw key hoặc URL ký; chỉ lưu hash key/body, byte count và status. Không sửa API.

- Pilot cắt socket một lần: Android tự gửi lại, cùng một media hoàn thành.
  Pilot harness tiếp theo có lỗi quan sát `Digest already called`; loại khỏi
  số liệu chứng minh. Đã phục hồi API direct và retry pending thành công.
  Hai pilot tạo hai media riêng qua thao tác chọn ảnh chủ động, không phải duplicate
  do retry. Bản harness riêng process đã sửa guard khi stream aborted.
- Lượt có kiểm soát **mid-PUT**: baseline 3 Ready; proxy cắt sau ít nhất 65.536
  byte (chunk boundary), chưa forward body tới API. Bốn request bị cắt, cùng key;
  DB có 3 Ready + 1 Pending. App hiện “Thử lại ảnh vừa chọn”, khóa chọn ảnh mới.
  Gỡ điểm cắt, bấm retry → một PUT đầy đủ 294.722 byte, hash bằng file nguồn và
  key giống lần cắt, finalize → **4 Ready**, không thêm intent thứ hai.
- Lượt **lost-ack**: baseline 4 Ready. Proxy chuyển nguyên PUT tới API rồi đọc hết
  response **200** và đóng socket phía app, sáu lần (gồm retry transport tự động).
  Trước retry thủ công: media Pending, đúng một `createListingUpload` receipt,
  một `uploadListingContent` receipt, chưa finalize. Sau tắt fault/bấm retry:
  tổng **7 PUT, 1 key hash, 1 body hash**, một `finalizeListingUpload` receipt,
  **5 Ready**. App hết retry và lưu nháp thành công với 5/8 ảnh.
- Sau QA đã trả reverse về 3000→3000 và dừng proxy. Lưu bản summary không secret
  [JSON](../verification/q01r-upload-fault-summary.json); harness tạm tại
  `.tmp/q01r-proxy.cjs`, cấu hình `.tmp/q01r-fault.json`, chỉ có listing QA ID/mode.
  Các file `.tmp` không phải artifact Git hoặc yêu cầu runtime sản phẩm.

Giới hạn: mid-PUT cắt chặng emulator→proxy, không kiểm server xử lý body cụt;
lost-ack kiểm **content PUT commit**, không phải finalize/listing-submit commit.
DB đọc đối chiếu trạng thái/receipt, không chỉnh SQL. Lần này dùng Supabase thật.

![Giữa PUT: yêu cầu được giữ để thử lại](../verification/q01r-mid-put-retry.png)
![Mất ACK: vẫn có đường thử lại](../verification/q01r-lost-ack-retry.png)
![Sau phục hồi: lưu nháp 5/8 ảnh](../verification/q01r-upload-recovered.png)

## Phát hiện Q01-F01 — picker sau thay đổi cỡ chữ OS

Tái hiện hai lần trên APK cũ: đổi `font_scale` khi app đang chạy → Activity được
tạo lại, app về kệ; vào nháp → “Chọn ảnh từ thư viện” không mở picker và báo lỗi
chung. Instrument tạm ngay lời gọi picker xác định `ERR_UNEXPECTED`, nguyên nhân
`IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher`.
Mở lại process khôi phục picker; không coi đó là sửa lỗi. Instrument đã gỡ khỏi source.

Manifest sinh ra không xử lý `fontScale`; React Native 0.86 có cập nhật font/layout
trong `ReactHostImpl.onConfigurationChanged` và `DeviceInfoModule.onHostResume`.
Sửa bằng Expo config plugin `plugins/with-font-scale.cjs`: chỉ thêm `fontScale`
vào MainActivity, giữ các cờ hiện có và font scaling. Không vá node_modules/generated
Android. [Android giải thích cơ chế configuration changes](https://developer.android.com/guide/topics/resources/runtime-changes).
Plugin riêng chưa đủ: picker hết lỗi nhưng Fabric giữ số đo Text cũ, nhãn nút
phóng chữ và bị cắt. Đã bổ sung `AppText`: tạo lại riêng native Text trên Android
khi `useWindowDimensions().fontScale` thay đổi. Giữ nguyên TextInput/form/session;
không tắt scaling, không remount screen. Catalog /ui thêm hướng dẫn kiểm OS.

**Q01-F01 PASS trong phạm vi Android 15 x86_64:**
- Lần build JDK 25.0.3 thất bại ở worklets configureCMake với restricted-method
  warning. Chuyển JAVA_HOME riêng process về JDK **21.0.11** đã có, dừng Gradle
  daemon của lượt build và tạm đóng emulator; build thành công **3m52s, 338 tasks**.
  Không clean/generated patch/dependency upgrade. JDK là khác biệt có liên quan,
  không kết luận mọi cấu hình JDK25 đều lỗi từ một lượt chạy.
- APK SHA-256 `62e7dfd687ff33dd1ba64b6c747cb70b9ea6b1c4b5e01c69ef81573eadcb390f`,
  cài `adb install -r`, không xóa dữ liệu; JS source của nhánh này gồm AppText fix.
- Metro cũ treo sau build, /status timeout dù port listen. Dừng đúng Metro rồi
  khởi động lại, cache tự fallback full crawl; bundle 1.777 module trong 6,2 s.
  Force-stop/reopen → kệ và session Member. Không sửa splash timeout.
- Chu kỳ Home → đổi OS font 100→130→100→130% → resume: vẫn ở editor, chuỗi
  `Q01-font-change-keeps-this-unsaved-text` còn, chữ lớn đúng và nhãn nút đủ.
  Picker mở/hủy, mở lại/chọn WebP → ảnh thứ sáu Ready; không có launcher exception.
  Hủy picker không tạo media. Đã lưu và API xác nhận 6 mediaIds + chuỗi mô tả.
- 130%: keyboard docked, footer trên keyboard; Back đóng keyboard trước, lần hai
  hỏi rời; Quay lại giữ nội dung. Sau lưu đã trả chữ 100%, handwriting null.
- Scope là thay font từ cài đặt khi app ở nền rồi resume (luồng người dùng).
  Thay trực tiếp bằng ADB khi Activity vẫn foreground chưa là acceptance riêng:
  RN phát fontScale tới JS qua onHostResume. ARM/iOS/TalkBack chưa kiểm.

![Plugin đơn lẻ còn cắt chữ — trước sửa AppText](../verification/q01r-font-resume130.png)
![Nhãn 100% trên source cuối](../verification/q01r-font-fixed100.png)
![Nhãn 130% đầy đủ trên source cuối](../verification/q01r-font-fixed130.png)
![Picker sau đổi font trên source cuối](../verification/q01r-font-fixed-picker.png)
![Keyboard và dữ liệu giữ nguyên](../verification/q01r-font-fixed-keyboard.png)
![Back vẫn xác nhận khi có thay đổi](../verification/q01r-font-fixed-back.png)

## N20 — kiểm thêm trên source cuối

Sau AppText fix, mở /ui bằng preview flag trong Metro (không sửa .env).
Nhập ghi chú, kích hoạt field error/checkbox, Home→font130→resume: giá trị/lỗi/checked
giữ nguyên, nhãn nút đầy đủ. Sheet nội dung dài cuộn được, footer Đã hiểu cố định;
BackAction nhãn dài/disabled xuống dòng. Form địa chỉ thật: validate trống, nhập tên
dài với docked keyboard, footer đầy đủ và trên keyboard; rời qua confirm, không lưu.
Giữ N20 PARTIAL cho toàn walkthrough; không suy thành TalkBack PASS.

![Catalog lỗi và input sau đổi font](../verification/q01r-catalog-final130.png)
![Checkbox sau đổi font](../verification/q01r-checkbox-final130.png)
![Sheet chữ lớn](../verification/q01r-sheet-final130.png)
![BackAction chữ lớn và keyboard](../verification/q01r-backaction-final130.png)
![Địa chỉ trên source cuối](../verification/q01r-address-final130.png)

## N18 — archive trên bài QA riêng

Sau kiểm font, dùng phiên Member và Admin seed sẵn có để chuẩn bị chính nháp QA:
request/confirm catalog, lưu nội dung có nhãn `[QA local N18]`, submit và duyệt
qua API local hợp lệ. Không sửa SQL/role/password. Đây là dựng fixture bằng hai
tài khoản khác nhau, **không phải human/independent review** hoặc chứng nhận bán.

Trên Android: Quản lý sách → Xóa bài đăng → thông báo nêu không thể tự khôi phục
và lịch sử còn lưu. Quay lại: API vẫn đọc bài version10. Mở lại và xác nhận:
về danh sách chỉ còn nháp JPEG cũ, detail owner/public cùng 404.
Bài QA không còn trên kệ; lịch sử/catalog QA còn theo policy. **N18 archive PASS**.

![Xác nhận archive](../verification/q01r-archive-confirm.png)
![Sau archive chỉ còn nháp cũ](../verification/q01r-archive-done.png)

## Ảnh thực thi

![WebP sẵn sàng](../verification/q01r-webp-ready.png)
![WebP sau lưu và mở lại](../verification/q01r-webp-reopened.png)
![Bài đăng và bàn phím docked](../verification/q01r-listing-keyboard.png)
![Back hỏi trước khi bỏ sửa](../verification/q01r-listing-back-confirm.png)
![Địa chỉ và bàn phím](../verification/q01r-address-keyboard.png)
![Lỗi địa chỉ ở chữ 130%](../verification/q01r-address-errors130.png)
![Tên dài và bàn phím ở chữ 130%](../verification/q01r-address-keyboard130.png)
![Dialog ở chữ 130%](../verification/q01r-dialog-keyboard130.png)
![Sheet catalog và bàn phím ở chữ 130%](../verification/q01r-catalog-sheet130.png)
![Checkbox dài ở chữ 130%](../verification/q01r-checkbox130.png)
![Bài đăng và bàn phím ở chữ 130%](../verification/q01r-listing-keyboard130.png)

## Kiểm thử, dữ liệu và việc còn mở

- `pnpm --filter @used-books/api build`: PASS, để khởi động API/worker đúng source.
- `pnpm doctor:local`: PASS sau khôi phục như trên.
- `pnpm contract:check`: PASS, OpenAPI 0.20.0/generated types không đổi.
- RN lint/typecheck và **68/68 unit, 10 file PASS** sau sửa AppText.
- Web export preview=0 PASS; `node scripts/test-showcase-gate.mjs` PASS.
  Browser suite đầu dùng nhầm preview=0, hai journey qua rồi timeout ở showcase.
  Export lại preview=1 theo runbook → **3 suite PASS** (`pnpm test:public:browser`):
  address/listing/public shelf, HTTP+PostgreSQL thật trên DB riêng `_test` port55434,
  **storage fake**, không thay bằng chứng native/Supabase. Expo force-exit sau xuất
  dist vẫn exit0; warning pg concurrent query như baseline, không nâng dependency.
- Sau phát hiện Q01-F01 có sửa app config/plugin/AppText, build/native checks như trên;
  không đổi contract, migration, nghiệp vụ hoặc dependency. Không gán kết quả cũ
  thành mới chạy. Các ca N03/N11/N13/N16 bên trên thực chạy trên APK cũ.
- DB thêm đúng một nháp riêng với **6 WebP Ready** đã lưu trước archive (N11 + hai pilot + hai
  lượt fault + một lần sau đổi font). Bài QA đã archive hợp lệ; catalog QA đã confirm
  còn lại. Tên địa chỉ và catalog thử Back ban đầu không gửi. Nháp JPEG cũ giữ nguyên.
- Đã trả `font_scale` về **1.0**, xóa override tạm `stylus_handwriting_enabled`
  về giá trị ban đầu **null**. Reverse 8081/3000 giữ để tiếp tục QA.
- N13 giữa PUT/lost-ack content đã bổ sung như trên; lost-ack finalize/submit native
  chưa kiểm, vẫn chỉ có browser/transport evidence cho phạm vi tương ứng.
- N18 archive đã đóng phần thiếu; N20 walkthrough rộng hơn, N21 TalkBack, ARM/iOS còn mở.
  Các ca đóng ở lượt trước giữ nguyên; không tạo listing Approved qua SQL để
  lấp fixture. A02/review người thật và U01 phản hồi thẩm mỹ vẫn chờ.
- Bước tiếp theo: Q01/N20 walkthrough các màn còn lại và N21 với người nghe/kiểm
  TalkBack; review A02/R và U01 cần người thật. Không mở D/T/C trước gate.

Q01-F01 và N18 archive đã kiểm native như trên. Q01 và READINESS vẫn **chưa đóng**.
