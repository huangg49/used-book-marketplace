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

## Native — PARTIAL, chưa nghiệm thu

Android17/API37 x86_64, debug APK + Metro, QA riêng/fake storage. Không claim
web export là native PASS. Trước khi kiểm hash APK đã quan sát Search→chi tiết→
login quay lại đúng sách→create→pay mở đúng Order; logout Buyer→Seller và accept
đơn thương lượng→Preparing. Những quan sát đó chỉ là diagnostic: APK lúc đó
khác artifact hiện có. Không dùng chúng để đóng gate.

Đã cài đúng artifact debug local và so SHA256 với installed base.apk. Các quan
sát sau kiểm hash được ghi riêng trong evidence. APK không được build mới trong
gói JS này; không suy ra native binary đã build từ commit hiện tại. Back/large
text còn cần xử lý nếu evidence ghi FAIL/BLOCKED; human/TalkBack audio/ARM/iOS và
release build NOT RUN. Không đổi READINESS từ test xanh.

Lượt đầu web regression bị Vite reload khi formatter ghi shared source, làm mất
phiên memory-only: không coi là lỗi session mới. Lượt source ổn định sau đó PASS.
Các lượt RN harness đầu có selector không đúng hoặc expected201 trong khi contract
trả200; đã sửa harness theo source/contract, giữ nguyên assertion tiền/quyền/replay.
