# Đăng và mua nguyên bộ trên web/RN — 01/11/2026

Nhánh `codex/whole-bundle-journey`, base `86fba065`; checkpoint subject
`feat(listings): complete whole-bundle web and RN journeys`.
Owner duyệt hoàn thiện sau khảo sát luồng. Giữ local, chưa push/PR/merge/deploy.
Quy tắc [ADR0046](../adr/0046-whole-book-bundles.md) không đổi: một listing/lô
2–50cuốn, Sale/DirectDelivery, một giá10.000–1.000.000₫ cho cả lô; không ghép tin
cũ, tách cuốn, Exchange/Auction hoặc hoàn một phần. Không mở gate sau F2h.

## Cách dùng

1. Member chọn **Đăng sách**, tạo bài mới, chọn **Bộ sách**.
2. Đặt tên bộ; ghi từng cuốn/tập thực tế, tình trạng và lỗi riêng. Có thể thêm
   nhanh dãy tập rồi bỏ tập không có; tên series không chứng minh đủ/trọn bộ.
3. Chọn một cuốn trong bộ làm **đầu sách đại diện** để phân loại. Danh sách cuốn
   trên bài đăng mới xác định người mua nhận được gì, không phải tên catalog.
4. Ảnh chính cần thấy rõ cả bộ; ảnh thêm cho gáy/ruột/lỗi từng cuốn, tối đa8ảnh.
   Mô tả tình trạng chung theo cuốn có tình trạng thấp nhất.
5. Nhập **giá cả bộ**, nơi gửi; xem lại danh sách và xác nhận sở hữu, không đăng
   trùng hiện vật ở tin khác. Gửi duyệt và chờ quyết định, chưa lên kệ ngay.
6. Reviewer đối chiếu đủ danh sách/ảnh và checklist bộ. Buyer xem danh sách,
   chọn **Mua cả bộ**, xác nhận nhận toàn bộ rồi lấy báo giá/tạo một Order.

## Hành trình và implementation

| Vai trò/entry | Điều kiện, lệnh và kết quả | Bước tiếp/phục hồi |
| --- | --- | --- |
| Seller web Header→Đăng sách→Bộ sách | Danh sách editor hiện trực tiếp; thêm dãy chỉ nối cuốn chưa có, giữ cuốn ngoài dãy/tình trạng/ghi chú; giới hạn50 áp dụng tổng danh sách | Lỗi trùng/thiếu ở bước1; sửa lỗi giữ input. Sách lẻ/bộ giữ riêng giá; bộ mới không tự lấy giá một cuốn. Bài mới sau gửi không mang dữ liệu trước |
| Seller RN navigation→Đăng sách→tạo nháp→Đăng bộ sách | Schema giữ bundle; chọn cuốn đại diện, khai manifest, ảnh/tình trạng/giá/nơi gửi; save/submit/revision dùng command executor client hiện có | Lưu→quay kệ→mở lại giữ đủ tập/ghi chú. Bundle đã lưu không bị âm thầm mất khi client đọc/sửa. Intent JSON chốt manifest, version và key trước gửi; mất ACK replay nguyên lệnh |
| Reviewer Operations listing detail | Checklist `bundleContentsVerified` và danh sách đã có trong Admin; service vẫn kiểm quyền/revision | Không coi API fixture approval hoặc AI là nghiệm thu ảnh thật của Staff |
| Buyer RN Home/Search→chi tiết | Opt-in `bundleSupport=whole-v1`; tên bộ/tag/giá cả bộ, danh sách và lỗi từng cuốn; không cho lựa chọn Exchange trong mode Sale | Mua cả bộ→đọc manifest→checkbox xác nhận; quote gửi acknowledgment và listing version/revision |
| Buyer RN modal mua→Order | Listing được sao chép khi mở modal; refetch không thay manifest đang xác nhận. Quote retry giữ body/key đã gửi, GET lỗi giữ quote ID. Order create/retry dùng registry chung | Nếu lệnh tạo đơn trước còn bất định và revision hiện tại khác, che manifest mới và giải thích đang khôi phục lệnh cũ; đọc snapshot sau ACK. Không tạo Order thay thế do mất phản hồi |
| Buyer/Seller RN Order focus | Hiển thị bundle trong snapshot riêng của Order, giá và thao tác hiện được API cho phép | Giữ cả lô; không suy fulfillment/settlement đã nghiệm thu từ việc tạo đơn |

RN dùng component và transport/session hiện có; không thêm token store, endpoint,
dependency hoặc migration. AI Autofill/giá theo một cuốn không xuất hiện/không
gắn attribution cho bộ. Card kệ/giỏ/hội thoại giữ tên bộ; danh sách trong Order
lấy từ snapshot, không lấy từ bài đăng có thể đã sửa.

Khi kiểm Buyer, phát hiện thẻ seller RN có điểm4.9,98% phản hồi, nhãn xác minh,
địa chỉ và nút tủ sách viết cứng/không có command. Đã bỏ các dữ kiện không có
nguồn; nút **Hồ sơ uy tín** nối seller ID tới endpoint/màn reputation đã có.
QA account0giao dịch hiển thị “Chưa có điểm”, không bịa số đánh giá.

## Source chính

- Web [BundleEditor](../../apps/user-web/src/components/BookBundle.tsx),
  [range/validation](../../apps/user-web/src/lib/book-bundle.ts),
  [SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx).
- RN [schema/range](../../apps/mobile-react-native/src/features/bundles/book-bundle.ts),
  [editor](../../apps/mobile-react-native/src/features/bundles/bundle-editor.tsx),
  [manifest](../../apps/mobile-react-native/src/features/bundles/bundle-manifest.tsx),
  [DraftEditor](../../apps/mobile-react-native/src/features/drafts/draft-editor.tsx).
- RN [public contract](../../apps/mobile-react-native/src/features/shelf/contracts.ts),
  [BuyNowModal](../../apps/mobile-react-native/src/features/orders/buy-now-modal.tsx),
  [Order focus](../../apps/mobile-react-native/src/features/orders/order-focus-screen.tsx),
  [seller card](../../apps/mobile-react-native/src/features/shelf/book-detail-components/book-seller-card.tsx).
- Shared [order intent](../../packages/session-client/src/order-response.ts) bổ sung
  read-only copy của tuple đang pending; đổi account vẫn xóa intent theo cơ chế cũ.
  OpenAPI0.67.0/generated contract không đổi.

## Bằng chứng đã chạy

Windows, Node24.22.1; package CLI lấy từ dependencies đã cài, không install/upgrade.
pnpm máy11.25.0 khác packageManager11.19.0 nên chạy CLI trực tiếp bằng Node.
Source base trên + diff checkpoint; không gọi các checks local là remote CI.

| Kiểm tra | Kết quả/giới hạn |
| --- | --- |
| RN unit Vitest4.1.2 | **PASS194/194**,26file; thêm10ca giữ manifest/range/validation/replay |
| User web unit Vitest4.1.2 | **PASS262/262**,39file; thêm9ca range, giữ cuốn tùy ý/notes/giới hạn tổng và không mutate khi lỗi |
| Session-client unit | **PASS106/106**,11file; pending tuple trả copy và xóa khi đổi account; regression receipt/replay giữ nguyên |
| RN type/lint | **PASS** tsc và ESLint src;0error/1warning cũ `myReceivedAt` trong exchange-shipping-card; lint các file cuối sửa0warning |
| Web type/build/lint | **PASS** `tsc -b`, Vite build, oxlint các file sửa; warning cũ missing dependency hasValidOriginAddress và chunk>500KB, không nâng ngưỡng để che |
| RN Expo web export | **PASS**32route, CLI exit0 có cảnh báo forcefully exiting; không là native PASS |
| API bundle unit | **PASS9/9** book-bundle.spec.ts; contract/normalize/condition/mode/legacy edit |
| API Mongo/HTTP | **PASS6**, **SKIP135** theo filter bundle ở listing-review/orders; không chạy toàn harness. Bao gồm save/replay/review, legacy reads, Buyer race, snapshot, cancel/expiry, sửa manifest làm quote cũ vô hiệu và quote expired |
| Structural routes | **PASS** OpenAPI0.67.0/213operation/33controller; không chứng minh mọi quyền |
| Impeccable detector source | **PASS0finding** ở BundleEditor web, RN bundles và seller card; không thay human review |
| Docs/diff | **PASS** checker493Markdown/3172relative links và git diff --check; không đổi READINESS |

QA HTTP dùng Mongo8 rs-test loopback57017, E2E DB
`latlai_bundle_journey_20261101_test`; browser fixture DB ngẫu nhiên
`ops_browser_<hex>_test`. Fake storage, ảnh màu tổng hợp, mail local không gửi,
AI provider tắt. Không chạm Mongo chính27017/env/bucket/GHN.

### Thao tác qua giao diện

- **PASS web:** Header→Đăng sách→Bộ; thêm dãy giữ ngoại truyện/notes/condition;
  đổi sách lẻ/bộ giữ dữ liệu; trùng label theo normalization bị chặn ngay bước1.
  Đầu sách đại diện→ảnh tổng hợp→tình trạng→giá cả bộ/nơi gửi→xác nhận→gửi duyệt.
  UI “Đã gửi duyệt”; read-only Mongo audit đúng tập1/3, ghi chú, Fair,180.000₫,
  PendingReview. “Đăng cuốn khác” bỏ bộ trước; kiểm50.000₫ sách lẻ/250.000₫ cả
  bộ giữ riêng, bộ mới để giá trống. Không gọi đó là duyệt ảnh sách thật.
- **PASS RN web export:** Account→Đăng sách→nháp→bộ tập1/3→ghi chú riêng→chọn
  catalog→lưu→về kệ→mở lại. Mongo audit giữ2cuốn/Fair/ghi chú tập3.
  Bước giá chỉ có giá cả bộ, không AI/switch Exchange.
- **PASS Buyer RN web export:** Home hiển thị bộ→chi tiết→Mua cả bộ. Trước tick
  chưa có báo giá và nút tạo đơn disabled; sau tick lấy quote thành công, tạo
  một Order chưa thanh toán; modal đọc đúng2cuốn/notes từ snapshot. Audit có
  đúng một workflow item của lô. Không nạp ví/thanh toán/giao sách ở lượt UI này.
- **PASS responsive:** web editor390px, DOM320px không tràn; RN public bundle
  detail390/320px không tràn. Native keyboard/safe area/TalkBack không được suy
  từ DOM. Seller reputation thật0giao dịch/“Chưa có điểm” sau khi bỏ số viết cứng.
  Hai trang QA cuối ghi0console error. Ảnh RN cuối kiểm lại header đúng tên bộ.

Harness lần đầu chưa tick worker ảnh nên web dừng trước submit với “Ảnh đang
xử lý”, giữ đúng input/intent và cho retry. Đã dọn fixture đó, dựng QA mới có
`processMedia()` định kỳ rồi chạy lại từ entry đến PendingReview thành công.
Không sửa test/điều kiện ảnh hoặc bịa statusReady. Setup đầu cũng phát hiện
STAFF không có quyền catalog/address; harness dùng đúng QA ADMIN/MEMBER, không
thêm quyền ở sản phẩm. Hai lượt browser không cộng thành một transaction.

Artifacts ignored: `.tmp/bundle-journey-qa/` (RN draft/order audit, editor narrow),
`.tmp/bundle-journey-qa-final/` (web PendingReview audit, submitted screenshot,
RN detail/reputation) và logs build/lint/export. Không đưa credential/PII/DB vào Git.

## Gate còn mở và bước tiếp

- **BLOCKED/NOT RUN:** native runtime đã bị automatic policy block trước đây;
  không thử đi vòng bằng Metro khác. Chưa Android/iOS/TalkBack/ARM acceptance.
- **NOT RUN:** ảnh điện thoại thật, Staff/human review độc lập, trọn fulfillment/
  thanh toán/giao-trả nguyên bộ; bộ50cuốn trên thiết bị thật. Web export không
  đóng READINESS. Flutter giữ scaffold/phạm vi cũ, không thêm hỗ trợ ở gói này.
- Không tự xác định cùng hiện vật bị đăng trùng; cam kết ownership không là
  hệ thống inventory identity. Không mở bán tách hoặc ghép các tin đã có.
- **PASS cleanup:** cả hai browser fixture đã dọn DB/user/role; kiểm read-only
  không còn browser QA DB/user/role. API3009, storage3010, web5194, export8087
  đã đóng; mongo-test57017 đã stop. E2E data ở tmpfs không giữ sau stop. Mongo
  chính27017 vẫn healthy, không dừng/sửa. Không phát sinh thư/provider ở gói này.
- Thay đổi Admin và hai file Profile web ngoài gói xuất hiện trong working tree
  được bảo toàn, không đưa vào commit này. Checks ghi trên working tree local ở
  thời điểm chạy; không gọi đó là CI của commit/PR đã xuất bản. Push/PR/merge/
  deploy chờ quyền gói sau.
