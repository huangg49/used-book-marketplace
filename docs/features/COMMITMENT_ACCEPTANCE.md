# Nghiệm thu cam kết độc quyền

27/09/2026 · Theo [thiết kế](COMMITMENT_DESIGN.md) và
[ADR 0013](../adr/0013-exclusive-commitment-foundation.md).
**Cập nhật F1 backend:** xem [báo cáo thực thi](UNPAID_ORDER_REPORT.md) để biết phần
đã kiểm chứng của từng hàng. Các phần native client/F2–F5 vẫn Planned. Số liệu 114
API E2E và 96 unit của đợt listing trước không phải bằng chứng cho các miền mới.
CM-AC bổ sung, không thay [LS-AC](LISTING_ACCEPTANCE.md),
[AC-H/AC-AU](LOCAL_TRANSACTION_ACCEPTANCE.md) và AC trong SRS.
F2a có [wallet/topup](SIMULATED_WALLET_REPORT.md); F2b có
[LOCKED existing obligations](LOCKED_OBLIGATIONS_REPORT.md), bổ sung phần CM-AC16
cho Order chưa trả tiền và wallet reads. Không đánh pass chat/evidence/paid/custody
hoặc native gates từ các kiểm thử backend này.
F2c có [bằng chứng funding/refund](ORDER_PAYMENT_REPORT.md) cho CM-AC14, phần hoàn
trước xác nhận của CM-AC15 và paid cancellation/rejection của CM-AC16. Không đánh
hoàn thành toàn bộ F2 hoặc các ca custody/acceptance chưa có.
F2d bổ sung [acceptance/pickup deadline](ORDER_PREPARATION_REPORT.md), gồm phần
AC-11 nhận đơn đua hủy, deadline/quyền/replay/rollback và mở task giữ hold. Chưa có
pickup thật, carrier late event hoặc resolution để đánh pass toàn bộ custody gates.

## Môi trường và cách đánh giá

PostgreSQL thật, DB tên kết thúc `_test`, schema riêng mỗi run và full migration.
Fixture tối thiểu: Buyer M1/M2/M3, hai Seller, Restricted/Locked, Staff/Admin độc lập;
listing Sale/Exchange/Both đã approve qua service, revision/ảnh Ready, address trong/
ngoài vùng, clock test và người dùng có hạn/quota khác nhau. Giai đoạn ViaPoint mới
thêm điểm/slot/custody; funding mới thêm ledger có journal nguồn. Không tạo endpoint
set trade/credit balance/advance time để demo.

Race phải có barrier ở khóa hoặc failpoint test, xác nhận qua `pg_blocking_pids` hay
bằng chứng tương đương rằng contender thực sự chờ. Hai `Promise` có thể chạy tuần tự
không đủ. Chạy hai thứ tự thắng cho mỗi cặp có nghĩa; kiểm tra DB sau **commit**, không
chỉ HTTP. Test100 requests mở cùng gate, chia nhiều actor và thêm nhóm cùng actor để
kiểm quota. Ghi số thành công/conflict/busy và retry hợp lệ, không hứa cả99 lỗi là409
nếu timeout trả503. Kết quả cuối chỉ một Active và một workflow thắng, không orphan.

Sau mỗi ca đếm: contexts/items, Active/history commitments, listing version/trade,
events, receipt, audit/outbox; thêm slots/holds/journals khi có module. Assert losers
không để lại snapshot/Order/slot/tiền. Không log địa chỉ, token hoặc request body.

## Ma trận

Mốc triển khai F1–F5 được giải thích trong [lộ trình](TRANSACTION_FOUNDATION_PLAN.md).

| Mã | Ca và expected | Mốc / trace |
|---|---|---|
| CM-AC01 | Checkout Sale/Both đúng quote: một Order AwaitingPayment, một Active, Reserved, deadline15phút, immutable snapshot, receipt/audit/outbox cùng commit; chưa có journal | F1 / FR-O02, BR-10 |
| CM-AC02 | Guest/Member khác đọc private context; tự mua/không MEMBER/Restricted/unverified; cùng account nhiều role không vượt quyền; không tạo side effect | F1 / SRS §4, BR-02 |
| CM-AC03 | Lần lượt Draft/Pending/Rejected/Hidden/Removed/deleted/nonAvailable, catalog chưa Confirmed, ảnh chưa Ready, Active commitment hoặc custody blocker: acquire bị chặn | F1, mở rộng F4 / BR-02–03 |
| CM-AC04 | Listing/revision/quote/address/policy/fulfillment đổi sau preview: conflict, không âm thầm dùng giá mới; address người khác404; ngoài vùng422, không giữ | F1 / AC-07, AC-H01/05/24 |
| CM-AC05 | 100 checkout khác key tranh cùng listing: đúng một workflow thắng và một Active; lỗi/retry không tạo Order mồ côi hoặc trừ tiền | F1 / NFR-02, AC-08 |
| CM-AC06 | Một Buyer cạnh tranh mua ba listing: tối đa2 AwaitingPayment; cancel/expiry giải quota, paid Order không chiếm quota chưa trả; không tăng quota khi replay | F1/F2 / POL-24 |
| CM-AC07 | Checkout vs owner revise/hide/archive hoặc staff remove/revoke role/restrict: barrier hai thứ tự; nếu acquire thắng thì lệnh chỉ cho Available bị chặn; nếu thay đổi thắng checkout recheck | F1 / BR-02, FR-L05 |
| CM-AC08 | Hai requests cùng key/body: một commit/receipt; payload/target khác409; replay sau expired/cancelled trả receipt cũ sau authorization, không tăng deadline | F1 / ADR0006, NFR-09 |
| CM-AC09 | Failpoint snapshot/commitment/projection/event/receipt/audit/outbox: rollback toàn bộ; retry cùng key tạo đúng một kết quả | F1 / C-05 |
| CM-AC10 | Đến T−1ms được nhận lệnh, T/T+1ms bị chặn; request đến trước nhưng đợi khóa qua T hoặc session expiresAt cũng bị chặn; clock lấy sau khóa, worker trễ không gia hạn | F1/F2 / SRS §3.2 |
| CM-AC11 | Cancel/timeout chưa trả và chưa dispatch: Released đúng context; hai worker hoặc cancel cùng timeout chỉ một transition; restart/lost-ack không nhân đôi | F1 / FR-O03, BR-04 |
| CM-AC12 | SQL bypass thử tạo hai Active, sai revision/listing, context không typed FK, sai cardinality, Reserved không Active và ngược lại, sửa event/snapshot/owner: DB từ chối ở commit | F1, mở rộng F3/F5 / C-01–06 |
| CM-AC13 | Xóa cookie/reload/background RN hoặc mất response: GET trạng thái server, cùng key retry; countdown không mở khóa locally; private image của Reserved chỉ participant có quyền đọc | F1 client gate / NFR-07/11 |
| CM-AC14 | Payment vs timeout/cancel: chỉ một state; payment thắng thì journal+hold đúng một lần; timeout thắng không charge; nạp ví muộn không fund đơn cũ | F2 / BR-27, AC-09/10 |
| CM-AC15 | Refund/settlement thất bại sau quyết định hủy: giữ Active/Reserved và SettlementPending; retry journal không trả lặp; chưa có tiền cũng không tạo khoản hoàn giả | F2 / BR-08, NFR-09 |
| CM-AC16 | Restricted tiếp tục nghĩa vụ cũ, không tạo mới; Locked chỉ capability nghĩa vụ cũ, không quyền tổng quát; session revoke/mất role và worker có kết quả đúng policy | F2 gate / SRS §4 |
| CM-AC17 | Tạo/counter/refuse/expire Proposed: không reservation/slot/hold; đúng awaiting user và48h; quota5, cặp A-B/B-A không tạo hai Proposed mở | F3 / FR-X01–04, POL-23 |
| CM-AC18 | Accept hai Exchange/Both khác chủ, đúng hai versions: hai Active và snapshots/values cùng Tx, hạn funding24h; sai một listing rollback cả hai | F3 / BR-05, AC-17/18 |
| CM-AC19 | Order mua A vs accept A↔B, rồi accept A↔B vs B↔C và A↔B vs B↔A: một bộ thắng, không giữ lẻ, không deadlock vô hạn | F3 / AC-19 |
| CM-AC20 | Listing bị giữ rồi release: proposal cũ vẫn ClosedUnavailable do version; worker stale không đóng counter revision mới; từ chối proposal không release cam kết người khác | F3 / BR-04, AC-20 |
| CM-AC21 | Counteroffer đổi participant/resource set giữa discovery/lock: rollback/discover lại, không thêm user lock ngược thứ tự; hết retry trả lỗi an toàn | F3 / C-05 |
| CM-AC22 | Exchange funding một bên rồi hết hạn: hoàn đúng khoản và phí chưa phát sinh; hai commitments chỉ close khi đủ disposition/tiền; chưa đủ funding cấm pickup | F3 / FR-X05–11, AC-21–23 |
| CM-AC23 | Slot cuối: hai Order hoặc Exchange cần2slot với chỉ1 còn lại; winner đúng capacity, loser không giữ sách/tiền; point Paused/địa bàn thay đổi được recheck | F4 / AC-H03/04/05 |
| CM-AC24 | Hết hạn/cancel khi AtPoint/Carrier/Unknown/Returning hoặc incident chưa giải quyết: giữ Active+slot, không Available; OwnerConfirmed một phía chưa close cả Exchange | F4 / AC-H19/20, BR-08 |
| CM-AC25 | Return xác minh: không đổi tình trạng thì Available nhưng giữ Hidden/Removed; đổi tình trạng cần revision mới PendingReview, không sửa Approved revision cũ; mất thì ClosedUnavailable theo quyết định | F4 / SRS §7.1 |
| CM-AC26 | Pickup/claim/incident vs closure: hai thứ tự, không release sau blocker thắng; event đến muộn gắn context cũ, không release/ghi đè commitment mới | F2/F4 / BR-08, AC-H23 |
| CM-AC27 | Intake auction vs checkout/accept: một Active/cuốn, không lệch slot/funding; Both/Exchange không intake; seller quota2 kiểm dưới khóa | F5 / AC-AU01/02, POL-41 |
| CM-AC28 | BuyNow/close chuyển sang Order: cùng commitment ID, Active liên tục, cùng slot ID, context mới typed FK, history link cũ; failpoint rollback; unique outcome chỉ một Order | F5 / AC-AU02/07/13 |
| CM-AC29 | Winner deadline=endAt+24h, BuyNow15phút; worker chạy sau hạn không cho trả; PaymentExpired/Unsold không reopen/relist khi còn custody; không runner-up | F5 / AC-AU08/09/14 |
| CM-AC30 | Cross-context release/transfer, systemActor từ HTTP, giả worker, context người khác hoặc sai commitment version: bị chặn; system replay dedupe mà không fake user | F1, mở rộng F5 / BR-04, NFR-07 |
| CM-AC31 | Public list/detail/media sau acquire/transfer: không lộ đơn/địa chỉ/ảnh private mới; participant đọc snapshot riêng đúng vai và BR-46; sửa sổ địa chỉ không đổi thỏa thuận | F1/F3 / NFR-07, BR-46 |
| CM-AC32 | Migration fresh/upgrade đủ6migration cũ, giữ checks/triggers; legacy Reserved không có context phải báo lỗi để xử lý, không tự Available; restart worker/outbox và đối soát không tạo lại effect | F1, mở rộng mọi mốc / NFR-09 |

## Bàn giao và gate

Mỗi hàng khi chạy cần ghi phạm vi con đã chạy, commit hoặc working-tree ID, phiên bản
DB/runtime, command, expected/actual, artifact và limitations. Ca F1/F2 không được
đánh pass toàn hàng khi phần F4/F5 chưa có. Storage giả không chứng minh Supabase;
API simulated money không là thanh toán thật; browser không thay Android/iOS.

Gate F1: contract/migration/services/worker + mọi phần F1 của ma trận có bằng chứng,
không bán trùng, không orphan, không lỗi quyền hoặc replay. Gate F2 thêm ledger cân
bằng và locked obligations. Gate F3 giữ hai cuốn/funding hai bên. Gate F4/F5 giữ các
gate [AC-H/AC-AU](LOCAL_TRANSACTION_ACCEPTANCE.md) tương ứng; không chỉ32ca ở đây.
Không sửa trạng thái Planned trong tài liệu này trước khi có báo cáo thực chạy.
