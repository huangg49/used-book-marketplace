# Hành trình mua RN — 01/11/2026

Nhánh `codex/member-native-demo`, base `65b40161` (gói Exchange safety),
subject `fix(rn): preserve checkout intent and guide the next order step`.
Owner duyệt gói hành trình sau khảo sát toàn dự án. Không thay API/migration,
GHN/carrier/Driver hoặc mở gate READINESS.

## Hành trình và hành vi

| Vai trò | Entry → điều kiện → lệnh | Kết quả → bước tiếp / phục hồi |
| --- | --- | --- |
| Khách / Buyer | Tìm sách → chi tiết → Mua ngay → đăng nhập, quay lại đúng sách → địa chỉ / quote | Dữ liệu thiếu có loading/error/retry; không hiển thị phí0 hoặc số dư0 như dữ liệu đã biết |
| Buyer | Xác nhận quote hiện hành → BuyNow → pay | ACK mở đúng Order ID. BuyNow vào Preparing theo ADR0038; đơn thương lượng chờ Seller xác nhận |
| Buyer | Mất ACK create/pay/cancel, đóng/mở hoặc đi tới Order | Giữ key/body/version trong bộ nhớ cùng SessionClient; chặn quyết định ngược. ACK create giữ ID nếu GET tiếp lỗi; retry chỉ đọc Order, không tạo lại |
| Seller | Work hub / danh sách đơn → đúng Order → accept / reject nếu server cho phép | Preparing hiện hạn, việc cần làm trên Member web, mã đơn chọn/sao chép được. Không giả định RN đã có packaging/shipment UI |
| Buyer / Seller | Logout / đổi identity | Intent và acknowledged ID được xóa; callback cũ không điều hướng hay xóa intent mới |

Intent chỉ sống trong bộ nhớ của phiên chạy app, không bảo đảm qua process death.
Khi app khởi động lại phải đọc danh sách/Order hiện hành; không tự lặp command mới.

## Thay đổi UI có căn cứ

- Bỏ bộ chọn điểm ViaPoint hardcode trên Search: trước đây không tham gia query.
- Home dùng nút thông tin kiểm tra tại điểm thay biểu tượng camera giả; tách
  khỏi nút tìm kiếm lồng nhau, tăng target48dp. Hai điểm là demo mô phỏng,
  không nhận chứng nhận chính hãng/100% từ checklist.
- Chi tiết chỉ ghi số ảnh thực tế, tên ảnh theo thứ tự. Không suy góc chụp từ
  vị trí ảnh; bỏ mô tả đẹp tự điền khi người bán chưa cung cấp và badge verified
  ở phần tự kê khai. Không đổi brand, palette, font hoặc chính sách motion.
- Entry `index.js` import expo-router/entry: dev web trước lỗi resolve đường
  tương đối qua pnpm; sau thay GET root200 và Android bundle nạp được.
  Không nâng dependency hoặc thay Metro resolver.

## Kiểm chứng

- PASS session-client65unit: create/pay/cancel/accept/reject, lost ACK,
  cùng body/key/version,403 giữ bất định, đổi identity và late ACK.
- PASS RN164unit, typecheck/lint (1warning Exchange cũ), export all iOS/Android/web;
  lần cuối chỉnh reset busy khi đóng được kiểm lại bằng typecheck/lint và export web.
- PASS Member web253unit/lint/typecheck/build; lint còn warning có sẵn.
- PASS `node scripts/test-rn-buy-now.mjs` trên Chromium390/320, API+Mongo thật,
  disposable *_test trên57017/rs-test, fake storage và tiền simulator. Kiểm create,
  GET lỗi sau ACK, pay/cancel mất ACK rồi mở qua navigation thật, một Order/một hold,
  late ACK sau Back, Seller Preparing có hướng dẫn web. Đã nối Operations CI.
- PASS `pnpm --filter @used-books/user-web test:buy-now:browser --checkout-only`:
  quote/address/create/pay/replay/ledger/public state/chat và Back. Flag mới chỉ
  dừng trước shipping; full CI mặc định giữ toàn bộ assertion hiện có.
- PASS `test:order-chat:browser`: focus hồ sơ, private data/role, retry đã commit,
  message/history và320/390px chữ130%; fixture độc lập, không provider ngoài.
- Browser captures nằm `apps/mobile-react-native/test-results/buy-now/` ignored;
  native captures/evidence ở [thư mục kiểm](member-native-demo-2026-11-01/).

## Native mới nhất — PASS trong lát cắt, nghiệm thu tổng thể PARTIAL

Nhánh kiểm `codex/native-build-verification`, source sạch `c5c30261` trước build,
không đổi code/dependency. Dùng script repo `node scripts/build-android.mjs --emulator`,
JAVA_HOME/LATLAI_NINJA chỉ đặt trong terminal: JDK21.0.12.1, Gradle9.3.1,
compile/target36, NDK27.1.12297006, Ninja1.12.1. Prebuild không đổi tracked files.
Build PASS7m57s,443task thực thi/32up-to-date; debug APK x86_64 không là release.
Artifact SHA256 `4cbdc04b5abd763009287d1d43be6641c183d44423f8302b0b98ed212161b498`
trùng artifact local cũ; đã cài và so hash installed base.apk trong phiên emulator
hiện tại. Không dùng việc AVD từng cài APK ở phiên trước thay kiểm hash này.

Android17/API37 x86_64,1080×2400/420dpi. QA run mới `member-rn-final-20261101`,
Mongo57017/rs-test/database *_test, fake storage, tiền simulator, AI tắt.
Dữ liệu sách có nhãn mô phỏng; không DB/bucket chính, shipment/carrier/Delivered.

| Ca thực chạy trên native | Kết quả |
| --- | --- |
| Home → thông tin kiểm tra tại điểm → Back gesture từ mép Android | PASS: đóng modal về Home, không thoát app |
| Search → chi tiết → Mua ngay → login Buyer → quay đúng sách | PASS; ảnh fake tải được, nhãn đúng số ảnh |
| Địa chỉ/quote → create → Back gesture đóng checkout → CTA trả tiền mở lại | PASS: cùng Order/deadline155.000đ, không tạo đơn thay thế |
| Pay → ACK → đúng Order Preparing | PASS: không đòi Seller duyệt lại BuyNow; hiện tiền giữ và hạn/bước chờ |
| Chọn lại Account → logout Buyer → login Seller | PASS: đúng identity, không còn dữ liệu form/phiên Buyer |
| Seller work hub → đúng đơn thương lượng → confirm accept | PASS: Preparing, hạn bàn giao và hướng dẫn tiếp tục trên Member web, mã đơn selectable |
| Chữ OS100↔130%, background/resume và cuộn | PASS Seller: thấy đủ nội dung/nút cuối và giữ đúng hồ sơ. Buyer130% đã xem layout; chưa kiểm đủ cuộn/resume riêng |
| Native injection mất ACK / chép mã / TalkBack audio / ARM / iOS / release | NOT RUN; mất ACK được kiểm riêng RN web/shared, không nhận là native PASS |

API đọc lại và Mongo QA xác nhận đúng1Order BuyNow mới, đúng1journal OrderPayment,
155.000đ giữ cho đơn đó. Ví còn535.000đ available/465.000đ held (gồm310.000đ đã giữ
ở hai đơn setup). Seller accept đơn thương lượng không phát sinh khoản giữ mới.
Ảnh [Buyer native](member-native-demo-2026-11-01/buyer-paid-native.png),
[Seller native](member-native-demo-2026-11-01/seller-preparing-native.png),
[Seller130% sau resume/cuộn](member-native-demo-2026-11-01/seller-preparing-native-130.png),
[evidence JSON](member-native-demo-2026-11-01/native-evidence.json).

### Điều chỉnh finding sau kiểm chứng

Lượt đầu điều khiển nút toolbar emulator đưa app ra launcher, nên đã giữ finding
Back chưa rõ nguyên nhân. **Back gesture thật sau build đóng cả modal thông tin và
checkout đúng**. Không còn đủ căn cứ gọi đây là lỗi Back của app; đường toolbar qua
công cụ còn chưa xác minh. Escape từ cửa sổ emulator không có hiệu lực, không dùng
để chấm native. Giữ [ảnh diagnostic](member-native-demo-2026-11-01/back-result.png)
và kết quả cũ trong JSON, không sửa dependency/config để chữa một kết luận chưa chắc.

Đổi font bằng ADB trong khi app luôn foreground có thể khiến intrinsic layout cũ
cắt một số dòng khi cuộn. Sau background/resume (như người dùng quay từ Settings),
Order đo lại đúng và cuộn đầy đủ; ảnh diagnostic trước resume giữ riêng.
Không nhận ca ADB foreground đó là UX PASS hoặc tự quy thành lỗi luồng Settings.

Trước kiểm hash đã quan sát luồng mua/seller trên APK khác; ảnh
`diagnostic-before-apk-verification.png` chỉ là diagnostic. Các PASS trong bảng
là lượt mới sau build/cài/hash, không lấy lượt cũ làm nghiệm thu.
Lượt đầu browser regression bị Vite reload khi formatter ghi shared source làm mất
phiên memory-only; lượt source ổn định PASS. Harness đầu có selector sai/expected201
trong khi contract trả200; sửa harness theo contract, giữ checks tiền/quyền/replay.

READINESS và review người thật vẫn OPEN. Đây là kiểm kỹ thuật một lát cắt trên
emulator, không tuyên bố toàn bộ RN hoặc fulfillment đã được nghiệm thu.

Kết thúc: tài khoản native QA đã logout, font emulator về1.0, bỏ các reverse port;
Metro/API/fake media/emulator/ADB/Gradle daemon và Mongo QA của phiên đã dừng.
Mongo chính giữ dừng/nguyên dữ liệu. QA tmpfs bị mất khi stop: giữ journal/private
ignored để truy vết, lần sau dùng run mới thay vì replay vào DB trống.
Working tree sau commit sạch; main/origin/main vẫn `be581aec`. Chưa push/PR/merge/
deploy hoặc remote CI. Hai reviewer theo TEAMWORK cho tiền/quyền vẫn cần trước merge.
