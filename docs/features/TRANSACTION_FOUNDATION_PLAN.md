# Thứ tự xây nền giao dịch

**Ưu tiên hiện hành 28/09/2026:** đóng phạm vi tại F2h/OpenAPI 0.20.0 để rà soát,
hoàn thiện UI hiện có và chuẩn bị bàn giao theo [READINESS](../handoff/READINESS.md).
Các bước nghiệp vụ bên dưới vẫn là lộ trình sau bàn giao, chưa mở F2i trong đợt này.

27/09/2026 · Sau [listing acceptance audit](LISTING_ACCEPTANCE_REPORT.md).
Chốt [ADR0013](../adr/0013-exclusive-commitment-foundation.md),
[thiết kế](COMMITMENT_DESIGN.md) và [CM-AC](COMMITMENT_ACCEPTANCE.md) trước code.
Đây là kế hoạch triển khai, không là API đã hoàn thành. Không ấn định deadline.

## Increment này đã làm gì

- Đối chiếu SRS1.1/ADR0007 với code listing, command orchestrator, schema và SQL triggers.
- Chốt authority giữ sách, snapshot, transfer, closure, lock order, deadline, worker,
  quyền nghĩa vụ cũ, ranh giới service và migration/contract impact.
- Viết32ca nghiệm thu có trace và mốc thực thi; tách rõ các race cần barrier DB.
- Chưa đổi OpenAPI0.8.0/Prisma/handler/UI. Không tạo record demo Order/Exchange giả.

Kiểm tra increment tài liệu trên working tree `codex/transaction-foundation-design`,
Node24.19.0/pnpm11.19.0: contract check, lint, typecheck,96unit hiện có và build
API/operations đều qua. Đã kiểm tra liên kết local,32mã CM-AC không trùng và code
fences. Đây là hồi quy nền hiện có; không có test reservation, SQL migration mới,
API E2E hoặc native runtime được chạy trong increment tài liệu này.

## F0 — Đầu vào giao kết và thiết kế contract

Implementation27/09: sổ địa chỉ + directory vùng demo có API/RN/migration và
[bằng chứng](ADDRESS_BOOK_REPORT.md), OpenAPI0.9.0. Nơi gửi DirectDelivery gắn revision
đã triển khai trong OpenAPI0.10.0; xem [fulfillment](LISTING_FULFILLMENT_REPORT.md).
Quote DirectDelivery đã triển khai OpenAPI0.11.0: hai API create/read riêng buyer,
policy/amount/expiry bất biến và negative/race/upgrade tests; xem
[bằng chứng](DIRECT_SALE_QUOTE_REPORT.md) và [ADR0016](../adr/0016-direct-sale-quotes.md).
F0 cho mua trực tiếp đã có đầu vào backend; UI quote/checkout và ViaPoint còn planned.
Mục increment ở trên giữ số liệu lịch sử của đợt thiết kế trước.

Các đầu vào F0 cho mua trực tiếp đã triển khai theo thứ tự:

1. Contract service-area demo HCM-DEMO-v1 và địa chỉ riêng Member (tối đa10, đúng một
   default nếu có). Mã địa bàn từ dataset có nhãn mô phỏng; không lọc chuỗi “HCM”,
   không dùng IP. Snapshot không chứa tọa độ/đối tác bịa.
2. Listing fulfillment gắn revision: origin address reference/version, service area,
   DirectDelivery allowed, eligible point references khi ViaPoint được hỗ trợ.
   Sửa field này theo cơ chế sửa bài đã duyệt, không bypass review. Private projection
   giữ địa chỉ; public chỉ thông tin vùng/phương thức an toàn.
3. Contract quote: server tính P/S/phí/payer, ID/version/expiry và các expected revisions;
   quote không giữ sách. Chốt wire schema/route/error trong OpenAPI, generate, viết tests.
4. Catalog/listing cũ chưa đủ thông tin vẫn đọc được, checkout báo cần hoàn thiện;
   không seed địa chỉ mặc định hoặc migrate mọi listing thành TP.HCM tùy tiện.

Mỗi PR một feature (service-area/address → fulfillment → quote). Chưa bật nút mua
khi chưa có F1/F2. Đây là dữ liệu cần cho BR-02/FR-H06, không phải bước trang trí UI.

## F1 — Giữ/hủy/hết hạn Order chưa trả tiền

Backend đã triển khai OpenAPI 0.12.0: create/read/cancel, snapshot/media riêng,
exclusive commitment và worker expiry. Xem [báo cáo F1](UNPAID_ORDER_REPORT.md)
và [ADR 0017](../adr/0017-unpaid-direct-orders.md) cho coverage từng CM-AC và giới hạn.
Ở thời điểm F1 chưa có funding/custody hay capability LOCKED; các phần backend này
đã được bổ sung dần ở F2 bên dưới. UI checkout vẫn chưa mở; không đánh dấu
các phần client/F2–F5 là hoàn thành từ kiểm thử backend F1.

Lát cắt nghiệp vụ đầu tiên: **DirectDelivery, một cuốn, AwaitingPayment**. Có thật
create/read-own/cancel/expire, snapshot và reservation; không giả Paid/Delivered.
Không bật ViaPoint/AuctionIntake bằng cờ mặc định khi chưa có module.

| Phần | Công việc và gate |
|---|---|
| Contract | TransactionCommandReceipt riêng, Order projection, private reads/media, version/key/errors; đánh dấu planned đến khi handler/tests có |
| Migration | Order tối thiểu có hành vi thật, WorkflowContext Order-only, items/snapshot/commitment/events; receipt/audit principal và context FK; indexes/checks/deferred consistency |
| Command infrastructure | Typed result adapter dùng cùng protocol/bảng receipt; internal worker executor allowlist; giữ toàn bộ test auth/listing/media cũ |
| Services | Listing policy + ReservationsService nhận Tx; Order orchestration; cancel/expiry không có ledger nếu chưa từng giữ tiền |
| Worker | Candidate scan không khóa sai thứ tự, server deadline, persistent dedupe/retry, backlog visibility; không startup process âm thầm trong test |
| QA | Phần F1 của CM-AC,100requests, rollback/raw SQL, race listing/role/status, restart và lost-ack; DB `_test` |

Migration upgrade kiểm tra trước dữ liệu Reserved không có context. Nếu gặp thì
dừng/báo record IDs cho xử lý, không suy diễn chủ cam kết và không reset trạng thái.
Fixture API cũ tạo trade Reserved phải được nâng cấp để tạo context/commitment hợp
lệ hoặc thực hiện test raw SQL rollback; không vô hiệu constraint mới để suite qua.
Giữ checks/triggers migration cũ; chỉ migration additive có review. Không `db push`.

Code và API F1 có thể kiểm thử độc lập ở môi trường dev, nhưng demo Member mua sách
chưa mở khi chưa có funding. Màn RN lúc này chỉ dùng cho QA rõ nhãn chưa có thanh toán;
không cho người dùng chờ một nút thanh toán giả. Gate native listing vẫn cần đóng.

## F2 — Ledger, quyền nghĩa vụ và Order direct đầy đủ

F2a backend đã triển khai ngày 28/09: ledger kép VND và topup simulator với nguồn
hữu hạn, private history, TEST_OPERATOR độc lập, CLI đối soát read-only. Xem
[báo cáo và giới hạn](SIMULATED_WALLET_REPORT.md), [ADR 0018](../adr/0018-simulated-wallet-ledger.md).
F2b backend đã có [LOCKED existing obligations](LOCKED_OBLIGATIONS_REPORT.md),
OpenAPI 0.14.0: profile, Order list/read/media/cancel, wallet/history riêng;
deny-by-default cho các thao tác khác và kiểm tra lại session/status dưới khóa.
F2c đã có [Order funding và hoàn trước xác nhận](ORDER_PAYMENT_REPORT.md), OpenAPI
0.15.0: hold P+S, cancel/reject/48h expiry, durable refund và race với cancel/expiry.
LOCKED được yêu cầu hoàn nghĩa vụ cũ nhưng không thanh toán mới. F2d có
[seller acceptance/Preparing và task pickup quá hạn](ORDER_PREPARATION_REPORT.md),
OpenAPI 0.16.0. Quá hạn vào ResolutionPending giữ nguyên hold/commitment; chưa có
handler xác minh/giải quyết task. F2e có [ảnh đóng gói riêng tư](PACKAGING_EVIDENCE_REPORT.md),
OpenAPI 0.17.0: intent/upload/preview có audit, giữ bản gốc và giới hạn dùng chung
với ảnh listing. F2f có [đăng ký vận đơn DirectDelivery](DIRECT_SHIPMENT_REPORT.md),
OpenAPI0.18.0, pin ảnh Ready và snapshot giao hàng; LabelCreated không là pickup.
F2g có [carrier pickup độc lập](CARRIER_PICKUP_REPORT.md), OpenAPI0.19.0:
InTransit, replay event toàn cục, late/conflicting review giữ hold/commitment và
hạn giao đã pin. F2h có [delivery overdue/Buyer non-receipt intake](DELIVERY_OVERDUE_REPORT.md),
OpenAPI0.20.0: worker và Buyer dùng chung task quá hạn, không refund/restock và giữ
pickup history. Bước tiếp theo là Delivered/Buyer receipt/Inspection và claim tương ứng,
sau đó custody review resolution;
post-acceptance cancellation, dispute/
settlement, withdrawal, daily reconciliation và UI ví/Order vẫn planned.

- Thiết kế/implement ledger kép VND, simulated funding và journal nguồn hữu hạn;
  available không âm, idempotency, không Admin sửa số dư trực tiếp. Funding, refund,
  settlement có mục đích/nguồn riêng. Direct Order phí ứng ship đúng POL-22/FR-H02.
- Chốt contract và thực thi capability nghĩa vụ cũ cho LOCKED theo SRS §4, cập nhật
  ADR0003 có negative tests. Không mở toàn bộ API cho LOCKED, không trông chờ worker
  thay quyền xem đơn/nộp bằng chứng của participant.
- Payment/cancel/timeout, seller confirmation, carrier simulator/custody, claim/
  inspection/settlement tích hợp cùng reservation; test dưới barrier và failpoint.
- RN quote → xác nhận giữ sách → funding → theo dõi/nhận/khiếu nại đúng trạng thái.
  401/network/conflict không xóa intent; giá/phí thay đổi phải xem lại và chủ động xác nhận.
  Nút/đếm ngược lấy quyền hiện tại từ server. Không đổi receipt cũ thành trạng thái mới.

F2 phải chia các PR ledger/auth obligations/Order funding/fulfillment-dispute-client;
không là một PR khổng lồ. Gate chỉ mở mua direct khi chuỗi nghĩa vụ bắt buộc chạy đủ,
kể cả lỗi tiền/custody, không chỉ happy path trả tiền.

## F3 — Exchange trên cùng nền

Proposal/revision/awaiting participant/quota trước, accept hai cuốn sau; funding hai
bên dùng ledger đã có. Unique cặp Proposed theo unordered listing IDs, quota5 dưới
user locks; counter tạo revision mới, không thương lượng sửa giá đã duyệt.
Consumer invalidation proposal dùng version, không mass-lock tất cả participant trong
checkout. Test vòng tranh chấp A-B/B-C và hai thứ tự A-B/B-A. Direct Exchange mỗi bên
trả phí chiều mình gửi; không gộp vào cọc/Δ. Gate gồm SRS AC-17–23 và nghiệp vụ hai
chiều/inspection/return; accept thành công chưa đủ để công bố đổi sách hoàn chỉnh.

## F4 — ViaPoint và xử lý hiện vật

Service points/assignments/capacity → slot → intake/inspection → acceptance/barrier →
handover/custody → incident/reclaim/return. Phương thức qua điểm thêm vào checkout/
Exchange đã có, không tạo bản ledger/reservation thứ hai. Đóng gate AC-H trước auction.
Slot giữ cả outbound inspection; không dùng carrier Delivered thay Staff receipt.
Implement return-to-review transition tương thích triggers trước khi mở quy trình
hoàn sách thay đổi tình trạng. Quỹ incident có nguồn/journal; thiếu nguồn không đóng hồ sơ.

## F5 — Auction tạo Order và chuyển cam kết

Chỉ khi Order/ViaPoint đủ nền: intake → Pass → mở phiên → manual/Auto/BuyNow → close
→ Order → funding/fulfillment cũ. Không tự viết settlement riêng cho auction.
Transfer cùng commitment/slot, lịch sử intake còn; một outcome/Order, worker trễ
không kéo dài hạn. Auto trần riêng, buy-now trước bid đầu, không runner-up/relist.
Gate AC-AU01–14, không dùng demo đấu giá để bỏ các test tiền/quyền/custody.

## Cách team làm mà không lệch nghiệp vụ

Một người giữ trách nhiệm contract/migration của mỗi increment, một người khác review
SQL/race; người làm RN và operations dùng types sinh ra và cùng transport/session.
Không chỉ định tên hoặc yêu cầu team chia agent. Luồng có phụ thuộc đi tuần tự theo
gate; có thể làm UI fixture song song nhưng phải có nhãn và không tính implemented.

Mỗi feature bàn giao: contract/generated types, migration reviewed, handlers/services,
negative/race tests, setup/ADR và báo cáo evidence/limitations. Native Android là gate
client đầu tiên; web export không thay picker/Back/TalkBack/khôi phục phiên trên máy.
