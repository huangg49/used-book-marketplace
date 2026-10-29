# Hành trình đấu giá xuyên vai trò — 29/10/2026

Owner duyệt kiểm chứng và sửa các chỗ đứt trên hành trình có sẵn. Nhánh
`codex/auction-cross-role-journey`, base `3bfe70a`; commit subject
`fix(auctions): connect cross-role journeys and verify payment replay`.
Gói hoàn tất ở phạm vi dưới đây; chưa là bằng chứng merge hoặc release.

## Phạm vi và nguồn yêu cầu

[SRS1.1](../SRS_V1_1.md), [phụ lục](../features/LOCAL_HANDOVER_AUCTION.md)
FR-AU01–10/POL-31/39/41, [ADR0047](../adr/0047-seller-scheduled-auctions.md)
và [ADR0049](../adr/0049-auction-intake-from-shelf.md) quyết định nghiệp vụ.
API/code và evidence bên dưới chỉ chứng minh phần đã thực chạy.

Luồng chính: sách đã duyệt trên kệ → giữ chỗ → Staff nhận/kiểm tra → Seller hẹn
phiên/mở ngay → Buyer trả giá/mua ngay → worker chốt → người thắng thanh toán.
Dừng ở **Fulfilling, tiền đang giữ**; không accept-report, tạo mã nhận, giao sách,
GHN/carrier/Driver hoặc settlement. Không reset/seed/migrate DB chính.

## Bản đồ hành trình đã kiểm

| Vai trò → entry | Điều kiện/lệnh | Kết quả → bước tiếp |
| --- | --- | --- |
| Seller web → Sách của tôi → Đưa lên đấu giá | Sách lẻ Approved/Visible/Available, đúng owner; chọn điểm/giá, create với version/key | Một intake/slot/commitment; phiếu gửi nêu hạn72h → Đấu giá của tôi |
| Staff web → Sách gửi đấu giá | STAFF được phân công tại điểm, độc lập; nhận với mã kệ, ghi đủ checklist rồi Pass | Đạt kiểm tra, chờ **Seller** đăng phiên; không hướng dẫn Staff mở thay |
| Seller web → intake cụ thể | Publish hẹn giờ/thời lượng1–168h, replay cùng body/key | Một auction; action **Xem phiên đấu giá** mở đúng ID, đọc lại quyền/state |
| Seller web → phiên của mình | Trước bid đầu đổi Scheduled sang mở ngay; stale version/premature bid bị từ chối | Live; không đổi lịch/rút sau bid đầu |
| Seller RN web → intake → phiên | API của caller xác minh ownership trước control | Nhãn tiếng Việt, bảng Seller và lối về hồ sơ/Phiên của tôi; không tự trả giá |
| Buyer web → sàn → chi tiết | Manual100.000đ, mất ACK rồi retry | Một bidder, giá100.000đ; quyền vẫn do API quyết định |
| Buyer khác → cùng phiên → Mua ngay |300.000đ sau bid, còn đủ điều kiện | Hai bidder, cửa sổ60giây thật; chưa có Order trước khi đóng |
| Worker QA → hai sweep rõ ràng | Hết endAt đã từ chối bid dù worker chưa chạy | Một Order300.000đ; hạn=endAt+24h, không nâng runner-up |
| Người thắng → Cần thanh toán → đúng phiên/Order | Thiếu tiền bị từ chối; nạp simulator500.000đ, pay/retry300.000đ | Một OrderPayment, tiền/slot/commitment vẫn giữ; dừng trước fulfillment |
| Seller → yêu cầu bằng chứng | Nhánh nhận/NeedsEvidence dựng qua API; câu trả lời gửi bằng UI/replay | Người yêu cầu bị403 khi tự quyết định; Staff khác Pass qua API → Đăng phiên |
| Seller web/RN web → intake đã hủy | Hủy trước drop-off bằng UI web, xem lại exact ID | Đọc được hồ sơ, không raw Cancelled/lệnh cũ; commitment không còn Active |

Nhận/kiểm tra trong QA không chứng minh có hiện vật thật. Nhánh evidence không
được nhận là mọi bước của Staff thứ hai đã nghiệm thu UI.

## Finding và sửa source

1. **Publish xong thiếu bước tiếp ở hồ sơ cụ thể.**
   [MyAuctionsPage](../../apps/user-web/src/pages/MyAuctionsPage.tsx) render raw
   Auctioning, không có action tại intake. Nay map đủ state và link auction ID
   thật. Danh sách chờ thường vẫn chỉ gồm state cần theo dõi. Hồ sơ focus đã
   đóng giữ đọc được. [RN intake card](../../apps/mobile-react-native/src/features/auctions/send-to-auction-components/send-to-auction-active-intakes.tsx)
   không còn gán Sold/Cancelled/Reclaimed thành lời mời nhận lại sách. Cancelled
   được thử bằng command thật; Sold/Reclaimed là sửa mapping source, chưa là
   evidence đi hết fulfillment tới hai trạng thái đó.
2. **Nhận diện Seller bị giới hạn50 lần gửi; RN chưa có bảng Seller.**
   [Web detail](../../apps/user-web/src/pages/AuctionDetailPage.tsx) trước đó
   tìm trong danh sách gần nhất. [API own-intakes](../../apps/api/src/modules/auctions/auction-intakes.service.ts)
   nay lookup theo auction, kiểm owner hiện hành và dùng primary key, không
   quét lịch sử không giới hạn. [RN detail](../../apps/mobile-react-native/src/features/auctions/auction-screen.tsx)
   có bảng Seller và lối về hồ sơ. Cả hai chờ kiểm tra role; read lỗi có retry,
   không biến lỗi thành quyền trả giá. Khi revalidation lỗi, giữ cây component
   chứa intent, ẩn control và tạm ẩn modal; phục hồi không đổi key/body hoặc
   làm mất lựa chọn lịch/mức Auto đang nhập. Query private gắn identity/target.
3. **Hướng dẫn lệch policy hoặc có claim thiếu bằng chứng.**
   Web/RN còn ghi phiên cố định24h, Buy Now chỉ trước bid đầu, giám định4–8h,
   niêm phong bảo quản. Nay nêu lịch1–168h, Buy Now còn khả dụng sau bid và cửa
   sổ60giây. POL-31 là hạn xử lý24h, không phải SLA4–8h. Không hứa chứng nhận
   chính hãng/niêm phong. Intro Staff nói rõ Seller tự đăng phiên sau Pass.
   Giữ brand/component/input/Back/motion; footer policy RN wrap cho chữ dài.

## Contract và rollout

[OpenAPI0.60.0](../../packages/api-contract/openapi.yaml),193operations/30controllers;
không thêm endpoint. GET `/me/auction-intakes` thêm query UUID `auctionId` tùy
chọn. Không filter giữ50 gần nhất; có filter trả0–1 hồ sơ của caller, không bị
giới hạn lịch sử. Auction lạ/không tồn tại đều trả rỗng. UUID sai400; auth/role/
status/session vẫn kiểm trước read. ShelfCode của Seller vẫn null theo contract;
không lộ mã kệ thật hoặc Staff identity. Không thêm ExistingObligation, mutation,
collection, migration hoặc thay tiền/state machine. Generated types sinh lại.

**API0.60 đi trước hoặc cùng client.** API cũ có thể bỏ qua query và trả50 lần
gửi gần nhất, nên không suy client mới đã sửa ownership trên backend cũ.

## Bộ kiểm chứng chạy lại

[test-auction-journey.mjs](../../scripts/test-auction-journey.mjs) dùng QA replica
set riêng, DB `*_test`, storage fake và TEST_OPERATOR funding độc lập. Setup
identity/session chỉ trong DB QA, token chỉ ở memory; năm browser participant
đăng nhập qua UI/API, không tắt limiter. Catalog/ảnh/listing/moderation, intake,
inspection/publish/bid/payment và50 lượt tạo/hủy lịch sử đều qua command thật;
không gán trực tiếp state giao dịch cuối.

Fault injection lấy response200 sau commit rồi bỏ ACK. Intake/publish/bid/evidence/
payment retry giữ cùng hash key/body và nhận200. Khi kiểm payment retry, GET nền
được trì hoãn rồi đọc API thật để push không tự đối chiếu trước POST replay.
Query invalidation có thể hủy một GET; đếm riêng, không nhận thành API PASS hay
lỗi thanh toán. Không lưu token/body/raw header trong ma trận.

Runner có QA URL guard, RN export QA-base preflight, lock chống chạy đè port/
output và cleanup. Lock còn sau crash phải kiểm process/port trước khi gỡ;
không tự xóa lock đang sống. Build/export freshness vẫn cần chuẩn bị đúng source.

```powershell
corepack pnpm@11.19.0 infra:mongo:test:up
corepack pnpm@11.19.0 --filter @used-books/api build
# Terminal QA riêng theo START_HERE; không đổi env/config của app chính:
$env:MONGO_TEST_URL = 'mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/latlai_auction_browser_test?replicaSet=rs-test&authSource=admin'
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3009/api/v1'
$env:EXPO_PUBLIC_DESIGN_PREVIEW = '0'
corepack pnpm@11.19.0 --filter @used-books/mobile-react-native export:web
corepack pnpm@11.19.0 test:auctions:browser
corepack pnpm@11.19.0 infra:mongo:test:stop
```

Có thể chạy `test:journey-gate --only=auction-journey`; runner hiện9suite.
Subset không trở thành PASS toàn gói. Output local `.tmp/auction-journey`;
RUNNING/skip không là PASS, không dùng hai suite cùng DB.

## Checks và giới hạn bàn giao

Node24.22.1/pnpm11.19.0, Windows x64/Chromium, Mongo QA riêng. API dist và RN
export được chuẩn bị từ source của gói, không lấy build main mới để làm evidence.

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| Browser xuyên vai trò | PASS14 checkpoint, cùng API/Mongo thật và thời gian server thật; [ma trận](auction-journey-2026-10-29/result.json). Không là native hoặc fulfillment PASS |
| Replay | Intake/publish/bid/payment/evidence mỗi intent có2 POST200 cùng hash key/body; bid còn giữ intent qua lỗi đọc role, modal giữ lịch/mức Auto khi phục hồi |
| Tiền/custody | Một Order, một OrderPayment300.000đ; available200.000đ/held300.000đ từ funding500.000đ, slot/commitment giữ nguyên; state Fulfilling |
| Hồi quy browser cuối | Operations/work-inbox/auction-journey **PASS3suite**, exit0; tổng **PARTIAL**,6suite NOT_RUN đúng phạm vi. [Gate JSON](auction-journey-2026-10-29/browser-gate.json) |
| Auction UI fixture | PASS ở lượt trước với AuctionList không đổi; không cộng thành real API hoặc native evidence, không nằm trong ba suite cuối |
| API owner lookup E2E | PASS1,72filtered/skipped có chủ đích.50 lượt create/cancel thật; caller khác/unknown rỗng, guest401/Staff403/UUID400/LOCKED403/revoked session401; shelfCode null đúng contract |
| API |232unit PASS, loại carrier-adapter theo scope; lint/typecheck/build PASS |
| Member web |251unit, lint/typecheck/build PASS; warning effect/dependency/chunk cũ còn, không là0warning |
| RN |161unit, lint/typecheck/export web PASS. Export exit0 với thông báo Expo force-exit sau khi đã xuất dist; không native build/device cho diff này |
| Admin |219unit, lint/typecheck/build PASS; browser recovery/session/permission được kiểm trong suite operations |
| Contract/runner | OpenAPI0.60.0,193operations/30controllers; generated types current; safety runner4ca PASS |
| UI review | Đã xem Member390/Buyer320/Staff1440 và RN web390; long title/error/closed focus. Detector7target web/Admin0findings; không dùng detector DOM làm native a11y test |
| Docs/diff | docs:check và git diff --check PASS; không kiểm được mọi mệnh đề nghiệp vụ |

Ảnh chọn: [Seller publish](auction-journey-2026-10-29/seller-focus-after-publish.png),
[Staff Pass](auction-journey-2026-10-29/staff-passed.png),
[RN owner sau50intake](auction-journey-2026-10-29/rn-owner-after-50-intakes.png),
[Buyer payment hold320](auction-journey-2026-10-29/buyer-paid-hold-mobile.png),
[RN intake hủy](auction-journey-2026-10-29/rn-cancelled-intake.png),
[RN policy](auction-journey-2026-10-29/rn-send-policy.png).
Chỉ dữ liệu QA; không token/config riêng, ảnh form login hoặc dump DB.

Lượt hồi quy đầu từng FAIL ở focus của hộp thoại rời hồ sơ Admin. Chạy lại riêng
và lượt checkpoint cuối đạt với cùng source/assertion, không bỏ hoặc nới ca đó.
Một lượt sau gián đoạn không chạy được do Mongo QA dừng, không tính là PASS.
Đã bật lại đúng QA rồi chạy ma trận cuối. Teardown từng có GET đang chạy khi
Mongo đóng: fixture nay ngừng nhận HTTP và đợi response handler kết thúc (có
timeout), kể cả khi browser đã bỏ socket; lượt cuối không còn exception log đó.
Đây là sửa fixture QA, không thay startup/shutdown của API production.

Sau checkpoint: fixture/browser/Vite/API/media đã đóng,0 DB/browser user QA còn
lại;0 port QA nghe và không còn run.lock. Mongo QA đã dừng. Mongo chính giữ
Exited từ trước gói, không start/reset/seed/migrate. Không bật emulator/native.

- Native cho diff đấu giá mới, TalkBack/audio, ARM/iOS, live Supabase/provider,
  human UX/review độc lập **NOT_RUN**. Browser/Expo export không thay các phần này.
  RN web chỉ kiểm các bước Seller/focus/role đã nêu; không là nghiệm thu toàn
  bộ bidder/payment của RN. Luồng tạo listing Auction riêng của RN được giữ,
  không suy picker kệ Marketplace của web đã có parity trên RN.
- Giữ [READINESS](../handoff/READINESS.md), không tự đóng gate. Không accept-report/
  giao sách/claim/return/settlement dù source đã có. Không có benchmark tải lớn;
  dùng index `_id` hiện có, không migration để chạy demo.
- Browser tuần tự không thay test race hiện có của bid/payment. Test/human,
  fixture/storage thật và web/native được phân biệt theo phạm vi thực chạy.
- Review thiết kế một agent theo quyền hiện tại: degraded so với hai đánh giá
  độc lập, không là nghiệm thu người thật hoặc ký review tiền/quyền.

07:11 giờVN29/10: fetch main vẫn aed674f, PR mở0; RN CI main FAIL, bốn workflow
Docs/Admin/Demo/Operations+public-shelf vừa đọc success. Snapshot5workflow không
chứng nhận toàn CI. [RN CI main](https://github.com/huangg49/used-book-marketplace/actions/runs/40717566211)
không được sửa bởi local checks. Chưa tích hợp Exchange/GHN và registry migration
mới của nhóm; không pull/reset/tự nhập GHN. Chỉ commit local, chưa push/PR/merge/deploy.

Bước tiếp: review/tích hợp chuỗi với main theo TEAMWORK (API đi cùng client), rồi
native/human từ entry. Không mở fulfillment chỉ để làm kín demo.
