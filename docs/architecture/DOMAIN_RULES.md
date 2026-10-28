# Quy tắc theo miền nghiệp vụ

Tách từ AGENTS.md tại 19ffb84 ngày 30/09/2026 để chỉ đọc khi sửa miền liên quan.
Các phiên bản OpenAPI dưới đây là mốc từng tính năng, không là phiên bản runtime
hiện hành. Tra [contract](../../packages/api-contract/openapi.yaml), [code map](../handoff/START_HERE.md)
và [READINESS](../handoff/READINESS.md) để đối chiếu implementation/evidence hiện tại.
Đường dẫn trong backtick tính từ root repository. ADR 0027/model map MongoDB thay
cơ chế persistence PostgreSQL trong báo cáo cũ; vẫn giữ invariant nghiệp vụ.
Đọc các phần liên quan nhiệm vụ và ADR/feature được dẫn, không tải cả lịch sử.

Bộ sách Marketplace theo [ADR0046](../adr/0046-whole-book-bundles.md) là một lô
Sale gồm2–50cuốn, một giá/commitment/Order item cho cả bộ. Manifest trên revision
và snapshot là danh sách hiện vật; catalog chỉ là đầu sách đại diện. Buyer phải
xác nhận nguyên bộ, reviewer đối chiếu đủ cuốn/tập; không mua/trả từng phần hoặc
dùng bộ cho Exchange/Auction. Không thay đổi gate giao nhận/settlement bên dưới.

Trước mở rộng giao dịch, đọc [ADR 0007](../adr/0007-hcm-handover-auction-scope.md),
[local transaction design](../features/LOCAL_TRANSACTION_DESIGN.md) và
[acceptance](../features/LOCAL_TRANSACTION_ACCEPTANCE.md). Auction intake/bidding/close, Order ViaPoint/pay/report/code/handover và source
claim/return/settlement đã có trong `modules/auctions`. DirectDelivery tới F2h;
gate completion/release chưa đóng. Code có không tự cho phép mở rộng nghiệp vụ.
Real carrier/Exchange đầy đủ còn thiếu.

## Đấu giá và điểm mô phỏng

Owner duyệt27/10 theo [ADR0049](../adr/0049-auction-intake-from-shelf.md): nhận
sách lẻ đủ điều kiện từ kệ Marketplace (Sale/Both/Exchange), giữ nguồn Auction
cũ, không đổi channel/mode/giá; không bộ sách. Dùng predicate catalog/ảnh/owner/
revision chuẩn rồi bắt buộc Available và không commitment Active dưới lock.
AuctionIntake/PointOrder giữ sách ngoài public marketplace kể cả còn hội thoại
thương lượng cũ. Giá trị khai báo snapshot không tự cấp quyền bồi thường.

Bounded auctions started in OpenAPI 0.27.0 (migrations 0008–0011); current contract
is 0.30.0 with completion/business-rule/inbox increments. Read ADR 0030 and
`docs/features/AUCTION_BACKEND_REPORT.md`. Intake shares the exclusive commitment with
Orders, plus one point slot and the `Reserved` projection; release only on cancel
before drop-off, drop-off expiry or Staff reclaim. Staff steps need STAFF + current
point assignment and independence; ADMIN alone cannot receive/inspect/open/reclaim.
Proxy rules live in the pure `auction-engine.ts`; keep ceilings out of public reads,
receipts, audit and outbox. Every auction command locks the auction document and
decides with server time after locks; `endAt` is final once bid on (no extension). ADR 0047: the seller publishes a Passed intake now or scheduled (phase derived from `startAt`, no worker opens auctions) and may edit the time only before the first bid; Buy Now stays offered after bids while below the price. A win or Buy
Now forms a ViaPoint Order (`point_orders`, migration 0009) and transfers the
commitment without releasing it; payment locks auction → Order → ledger and moves
buyerTotal into the Order hold. Collection (migration 0010): report decision 72 h,
collection window 72 h in point hours, one-time 10-minute code stored only as a
salted hash, Staff handover during 09:00–18:00 with committed wrong attempts and a
5-per-15-minutes limit; handover starts the 72 h inspection window. Rejection and
missed deadlines open ResolutionPending; only an independent Admin decision refunds
the whole hold (book back to reclaim) or reopens collection, and the ledger accepts a
ViaPoint refund only as the journal named by that decision. The source now has completion: an unclaimed Inspection Order past its deadline
settles atomically to seller P−C/platform C and closes the slot/commitment;
claim/resolution/return retain holds until their valid outcome. This does not
close READINESS. Never manually release money/book/slot to bypass the protocol;
review source and gate before changing or extending completion.

## Exchange hiện hành — deadline và nghĩa vụ cũ

[ADR0050](../adr/0050-exchange-inspection-and-existing-obligations.md) đối chiếu
source28/10 với POL-08/FR-X08/X09/BR-18: mỗi bên có72h từ lần nhận hợp lệ; common
inspectionDeadline là hạn muộn hơn khi cả hai nhận. Xác nhận hài lòng chỉ ghi nhận,
không giải phóng cọc sớm. Settlement phải kiểm cả hai hạn và toàn bộ dấu tranh
chấp dưới transaction; không tin mỗi state Delivered. Migration0039 không sửa
ledger/checksum/migration cũ; nâng API và worker cùng phiên bản, dừng worker cũ
trong lúc migrate. GHN/carrier/driver giữ nguyên chờ nhóm quyết định theo owner.
LOCKED/RESTRICTED chỉ được đọc/thực hiện nghĩa vụ Exchange đã có, không proposal/
accept/counter/fund mới; point-order read/report/code/claim theo ExistingObligation.
Các mô tả implementation theo phiên bản cũ bên dưới là lịch sử từng increment,
không thay contract hiện hành hoặc READINESS.

## Đánh giá giao dịch và uy tín

[ADR0052](../adr/0052-transaction-reviews-and-reputation.md), contract0.57:
`Exchange`/`DirectOrder`/`PointOrder` phải Completed với mốc hoàn tất hợp lệ;
review không thực hiện completion/settlement. Mỗi participant một lần tạo, kể
cả đã xóa. Hạn gửi168h; sửa/xóa48h từ lần đầu, không gia hạn. Buyer/Exchange
chấm sách và đối tác; Seller Order chỉ chấm đối tác. Chỉ công bố khi hai bên đã
gửi và hết cả hai hạn sửa, hoặc hết hạn gửi lẫn mọi hạn sửa đã phát sinh.
Legacy đã có publishedAt được khóa sửa/xóa; public reads vẫn recheck deadline.

Mutation Member ACTIVE và current participant/author/target trước replay, giữ
key/body/version khi mất phản hồi. Staff/Admin ACTIVE độc lập chỉ đọc/moderate
sau publication; reason/version/key bắt buộc. Revision append-only; xóa công
khai là tombstone, evidence-held không được sửa/xóa. Một reply của target, chờ
duyệt; pending/hidden reply không lộ cho tác giả review/Guest. Hàng đợi và lịch
sử đều phân trang, cursor ký và ràng buộc actor/resource. Điểm tổng chỉ từ
review public hợp lệ, không cộng revision; vi phạm chỉ từ kết luận đã xác minh.
Chi tiết implementation/evidence ở [báo cáo](../features/TRANSACTION_REVIEWS_REPORT.md).
Không thay READINESS, không cấp ExistingObligation cho review, không thay GHN.

## Commitment và unpaid Order

For commitment/checkout work, also read ADR 0013, `docs/features/COMMITMENT_DESIGN.md`,
`docs/features/COMMITMENT_ACCEPTANCE.md` and `docs/features/TRANSACTION_FOUNDATION_PLAN.md`.
These define the target architecture. Unpaid DirectDelivery Order backend is implemented
in OpenAPI 0.12.0; read ADR 0017 and `docs/features/UNPAID_ORDER_REPORT.md`.
Create/read/cancel, private pinned media and an explicit expiry worker use the shared
command executor and Order-only exclusive commitments. The DB rejects Reserved without
a real workflow. Checkout UI remains planned.

## Funding và refund trước acceptance

19/10/2026: [ADR0040](../adr/0040-free-listings-five-active-cap.md) thay phí gửi
duyệt bằng đăng miễn phí và tối đa5 bài hiển thị/chờ duyệt mỗi Member. Approved
đã ẩn không chiếm chỗ; mở lại/sửa bài ẩn cần còn chỗ, kiểm dưới owner lock trong
transaction. Phí đã giữ lịch sử vẫn theo settlement/refund ban đầu; không chỉnh
ledger cũ. [Nạp ví/checkout](../features/WALLET_CHECKOUT.md) giữ nguyên phạm vi;
tiền mua sách quyết toán cho seller, không hoàn buyer khi Completed.

Order wallet funding and pre-confirmation full refunds are implemented in OpenAPI
0.15.0; read ADR 0020 and `docs/features/ORDER_PAYMENT_REPORT.md`. Payment holds the
frozen P+S once, cancellation/rejection/48h expiry records SettlementPending, then
the internal refund worker posts and releases atomically. Keep money/book held on
refund failure. This funding increment adds no dispatch/strike/settlement-to-seller; later shipment increments are described below.
Order version differs from ownership/commitment version after funding. Reconciliation
includes holds; history uses immutable posting sequence. Restart API and worker together.

## Mua ngay DirectDelivery

[ADR0038](../adr/0038-direct-buy-now-orders.md) bổ sung Buyer-created BuyNow cạnh
Seller-selected Negotiated. Cùng quote/commitment/ledger; BuyNow chỉ nhận giá
niêm yết, payment vào Preparing/version3 trong một transaction với hold,
preparation và inbox. Không dùng reject/cancel-paid/refund trước acceptance cho
BuyNow đã trả tiền. Pickup expiry vẫn mở review, giữ tiền và sách. Historical
agreement không có purchaseMode là Negotiated; gate completion không đổi.
Public listing chỉ hiển thị “Đang giao dịch”/InTransaction khi Order active có
paidAt sau payment commit. Unpaid vẫn giữ commitment15phút nhưng là “Chờ thanh
toán”/AwaitingPayment; không suy đã thanh toán từ Reserved hoặc OrderCreated.

## Phiếu thỏa thuận mua/đổi chung

[ADR0041](../adr/0041-unified-conversation-workspace.md) bổ sung workspace opt-in
trên conversation Buyer/Seller/listing. Mode phải được hai bên xác nhận; giá có
đề nghị rõ và chỉ đối tác được chấp nhận. Terms gắn revision, không sửa listing.
Seller Order từ workspace phải đúng giá đã chấp nhận/quote còn hạn. Exchange
proposal/link/version ghi nguyên tử; chỉ acceptance mới giữ sách. Khi có proposal
Exchange còn mở, phải hủy đúng luồng trước khi chuyển hình thức; không dùng switch
để đổi một Order đã tạo hoặc một Exchange đã nhận. Chat participant ACTIVE tiếp
tục sau OrderCreated, không mở quyền mới cho LOCKED. Giữ lịch sử cũ và đọc chung
các message source đã liên kết, không copy message hoặc tạo reservation từ chat.

[ADR0045](../adr/0045-order-conversation-workspace.md) đưa Xem đơn vào cùng
workspace. Chỉ tái sử dụng hội thoại đã gắn đúng Order; Mua ngay/Order lịch sử
chưa có link tạo phòng OrderCreated riêng dưới khóa Order và command executor.
Không ghép theo listing/đối tác, không sao chép địa chỉ quote vào phòng mới,
không chuyển trạng thái tiền/sách khi mở chat. Quyền ACTIVE/participant/session
hiện tại được kiểm trước replay; ExistingObligation không cấp quyền chat.

## Seller acceptance và pickup review

Seller acceptance and overdue pickup review are implemented in OpenAPI 0.16.0;
read ADR 0021 and `docs/features/ORDER_PREPARATION_REPORT.md`. Only the Seller can
accept paid obligations, including LOCKED/RESTRICTED. Preparing has an immutable
48h pickup deadline; worker opens a durable PickupReview/ResolutionPending once.
That is an unresolved verification task, not proof of custody, a strike or refund.
Keep hold/commitment and never use pre-confirmation refund after acceptance.
The Order fulfillment destination is shared with the accepted Seller. ADR0037
additionally permits the Buyer to share the quoted destination with their own
conversation's Seller before Order creation; changed address versions are not
shared automatically. Later pickup/delivery-overdue increments are described below;
review resolution and post-acceptance cancellation remain planned.

## Shipment label

DirectDelivery outbound shipment registration/read is implemented in OpenAPI 0.18.0;
read ADR 0023 and `docs/features/DIRECT_SHIPMENT_REPORT.md`. Seller registers before
pickup deadline with 1-8 Ready packaging images, one label per Order, global unique
LatLaiSimulator/tracking. Snapshot contacts/fee from agreement; LabelCreated does not
confirm pickup, extend deadline or move money/book. Reuse OrdersService fulfillment
locks. Images are sealed at registration; no tracking edit/replacement API exists.

## Carrier pickup

Independent carrier pickup simulation is implemented in OpenAPI 0.19.0; read ADR0024
and `docs/features/CARRIER_PICKUP_REPORT.md`. ACTIVE verified TEST_OPERATOR must be
neither participant. Global eventId/key dedupe spans operators, with current auth
before replay and domain-separated signatures. First timely receipt moves InTransit;
late/conflicting events open sticky carrier review/ResolutionPending, preserving
hold/commitment/canonical pickup. Original label remains immutable; read derives
PickedUp from the Applied event. Pin the 240h delivery deadline/policy in that event.
Do not use pre-confirmation refund or restock from carrier evidence. Max128 retained
events per shipment; replay works at cap. Worker counts openCarrierReviews separately.

## Delivery overdue

Delivery overdue review and Buyer overdue non-receipt intake are implemented in
OpenAPI 0.20.0; read ADR0025 and `docs/features/DELIVERY_OVERDUE_REPORT.md`.
Use the Applied pickup's pinned deadline, shared command executor and full hold locks.
Worker and Buyer share one delivery review; Buyer adds at most one immutable report.
InTransit4 becomes ResolutionPending5; evidence on an existing review keeps version5.
LOCKED/RESTRICTED Buyer may report; Seller/operations roles cannot report for Buyer.
Worker OrderDeliveryExpiry scans100 without candidate locks, retries failures and logs
deliveryRemaining/openDeliveryReviews/oldestDeliveryReviewAgeSeconds. Keep original
review identity and pickup history; no refund/restock/custody conclusion from a report.
Delivered/Buyer receipt/72h inspection and denial of carrier-reported delivery remain
planned. These review tasks are intake/blockers, not a completed dispute/adjudication
workflow. Review resolution and shipment/report UI remain planned.

## Packaging media

Private packaging image intents/upload/participant previews are implemented in
OpenAPI 0.17.0; read ADR 0022 and `docs/features/PACKAGING_EVIDENCE_REPORT.md`.
Only accepted Seller uploads, including LOCKED/RESTRICTED; late evidence does not
prove pickup or resolve a review. Retain originals/previews outside listing cleanup.
Both pipelines share storage budget, hourly admission and per-process upload slots.
Packaging normalizes synchronously, retries create-only keys, rechecks auth after I/O.
No original-download, Staff assignment, claim files or packaging UI yet.

## LOCKED và existing obligations

OpenAPI 0.14.0 implements LOCKED access to profile, participant unpaid Order
list/read/media/cancel and owned wallet/topup history. Read ADR 0019 and
`docs/features/LOCKED_OBLIGATIONS_REPORT.md`. Every other authenticated handler
denies LOCKED by default. Use method-only ExistingObligation plus service checks;
never treat login, roles or a client capability as permission for new transactions.
0.15.0 allows LOCKED paid cancellation/rejection; 0.16.0 adds Seller acceptance.
New payment remains denied for LOCKED.
Purchase chat exists in `modules/purchases`, with gateway/service participant
authorization; its HTTP handlers are not an ExistingObligation allowlist.
Point report/code/claim/read handlers currently lack the decorator described in
older reports, so do not claim LOCKED access there from documentation alone.
Claim evidence upload/real carrier and Admin lock/unlock workflows remain planned.

## Ví mô phỏng

Simulated wallet/topup backend is implemented in OpenAPI 0.13.0; read ADR 0018 and
`docs/features/SIMULATED_WALLET_REPORT.md`. The finite 100M VND source is journalled;
it is not the POL-42 incident fund. Only independent TEST_OPERATOR events may credit
an intent through the signed simulator adapter. Balance comes from immutable entries.
No withdrawal/adjustment handlers exist. RN/Expo web now has an opt-in internal
read-only wallet/history screen; see [C01 evidence](../handoff/C01_WALLET_2026_09_30.md).
It does not enable topup/checkout or close release gates. ReviewRequired
is sticky; daily reconciliation and resolution remain planned. Use `wallet:check`
after API build for read-only source/ledger reconciliation. Never refill by editing SQL.

## Địa chỉ, fulfillment và quote

Member address book and authenticated HCM demo service-area directory are implemented
in OpenAPI 0.9.0. Read ADR 0014 and `docs/features/ADDRESS_BOOK_REPORT.md`.
Owner update17/10: [ADR0039](../adr/0039-book-circulation-regions.md) names the
operational circulation zones TP.HCM/DEMO-A, Bình Dương/DEMO-B and Vũng Tàu/DEMO-C.
These are not official wards or handover points. The HCM-DEMO-v1 envelope is kept
for compatibility; migration0030 changes reference labels, not saved address keys.
Listing DirectDelivery origin selection is implemented in OpenAPI 0.10.0; read
ADR 0015 and `docs/features/LISTING_FULFILLMENT_REPORT.md`. Address content versions
and identity-only history protect frozen revisions when a contact is edited/deleted.
Unconfigured listings remain readable/moderatable; no checkout eligibility is implied.
DirectDelivery sale quote create/read APIs are implemented in OpenAPI 0.11.0; read
ADR 0016 and `docs/features/DIRECT_SALE_QUOTE_REPORT.md`. Quotes are immutable estimates,
never reservations or money holds. Use the shared command executor/QuoteReceipt,
DB decision time after locks, and pinned policy/address/listing versions.
Member DirectDelivery checkout UI remains incomplete. Bounded auction ViaPoint
Orders exist; ordinary sale/exchange ViaPoint and carrier legs remain planned. Native address/fulfillment has
scoped evidence in handoff; use READINESS for the remaining acceptance, not this historical feature summary.

## Client, catalog, listing và media

React Native is the first member client. Keep the shared NestJS API compatible with
Flutter and the operations web. The implemented reference slice is auth/profile;
read `docs/REACT_NATIVE_START.md` and ADR 0003 before adding a feature.
Catalog requests/review/public reads and owner listing drafts have real API handlers.
Owner media handlers, Supabase adapter, Sharp worker and RN private drafts are implemented;
live Supabase verification passed; Android debug build/UI emulator checks passed.
Native picker cancel and JPEG upload/Ready/preview/save/reopen passed on Android 15;
PNG/WebP and scoped upload failure/retry/background checks were added on MongoDB;
read `docs/handoff/READINESS.md` for evidence and remaining full native acceptance.
Listing submission/moderation, reviewer media reads and public shelf/detail/media are implemented.
Read ADR 0011 and `docs/features/PUBLIC_SHELF_REPORT.md` before extending public reads.
RN guest shelf is `/`, account is `/account`, book detail is `/book?id=...`.
Approved edits, visibility/archive/removal are implemented; read ADR 0012 and
`docs/features/LISTING_LIFECYCLE_REPORT.md`. Completed paid transactions remain planned.
Read `docs/features/LISTING_ACCEPTANCE_REPORT.md` for the 32-case evidence audit;
listing native acceptance remains pending and browser storage fixtures are not live Supabase evidence.
Operations web catalog/listing review is implemented; read ADR 0010 and
`docs/features/OPERATIONS_REVIEW_REPORT.md` before extending it.
RN and operations share `packages/session-client`; browser tokens remain memory-only.
RN listing form, catalog selection/requests, submit and rejection/resubmission are implemented;
read `docs/features/RN_LISTING_SUBMISSION_REPORT.md` for retry behavior and pending native checks.
Read ADR 0009 and `docs/features/LISTING_REVIEW_API_REPORT.md` before extending review.
Read ADR 0008 and `docs/features/MEDIA_UPLOAD_REPORT.md` for
media limits; never present mocked storage tests as live-provider evidence.
Read `docs/features/LISTING_DATA_CONTRACT.md`, `docs/features/CATALOG_DRAFT_API_REPORT.md`
and ADRs 0005–0006 before extending them. Preserve hand-written SQL checks/triggers
in migration history and the user/role locking protocol.
