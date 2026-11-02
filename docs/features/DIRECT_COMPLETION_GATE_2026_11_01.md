# Bảo vệ Buyer trước completion DirectDelivery — 01/11/2026

Gói theo owner duyệt sau [khảo sát core](CORE_BUY_NOW_AUDIT_2026_11_01.md).
Base main `2ae2212b`, branch `codex/direct-delivery-release-gate`. Phạm vi là sửa
ranh giới an toàn, không mở toàn bộ claim/return/settlement. Quyết định tại
[ADR0062](../adr/0062-direct-delivery-completion-release-gate.md).
Source của gói: subject `fix(orders): enforce direct delivery completion release gate`.
Implementation: [policy](../../apps/api/src/modules/wallet/direct-order-release.policy.ts),
[OrdersService](../../apps/api/src/modules/orders/orders.service.ts),
[worker](../../apps/api/src/modules/orders/order-expiry.service.ts),
[ledger](../../apps/api/src/modules/wallet/ledger.service.ts) và
[OpenAPI](../../packages/api-contract/openapi.yaml).

## Hành vi

| Actor / entry | Điều kiện và kết quả | Tiền/sách và bước tiếp |
| --- | --- | --- |
| Buyer gọi confirm-receipt mới | Current role/session/owner trước kiểm receipt;409 InvalidState khi chưa có receipt lịch sử | Không mở Inspection hoặc ghi receipt thành công; giữ hold/commitment và theo dõi đơn, không ép demo tới Completed |
| TEST_OPERATOR gọi delivery-events mới | Current ACTIVE, độc lập và binding đúng trước kiểm receipt;409 InvalidState cho command mới | Không ghi Delivered/72h hoặc giải ngân; không ảnh hưởng pickup hay point-delivery |
| Actor replay receipt cũ | Cùng actor/key/body/target và quyền hiện tại; trả stored receipt. Sai schema422; conflict hợp schema409; mất quyền/phiên vẫn bị từ chối | Không chạy lại ledger/transition; đọc Order để lấy trạng thái hiện tại |
| Worker gặp Inspection có sẵn | Không gọi settle khi gate đóng; báo inspectionBlocked/inspectionOverdueBlocked | Giữ nguyên hold, listing Reserved, context/commitment và lịch sử; chờ gói Buyer protection được duyệt, không tự tạo kết luận custody |
| Service/ledger bị gọi trực tiếp | Cùng policy đóng; shared payout alias cũng nhận diện DirectOrder | Không tạo journal/counter/entry hoặc chi tiền qua tên hàm PointOrder |

OpenAPI0.68.0 giữ route/request/receipt shape; canConfirmReceipt=false, mô tả rõ
compatibility replay và giới hạn. Không có request/env flag để mở gate. Không
migration mới hoặc sửa checksum. Phần trước completion (quote/tạo/pay, Preparing,
packaging/shipment/pickup, expiry/review và refund trước acceptance hợp lệ) giữ
protocol hiện có. Auction PointOrder/Exchange không đổi điều kiện giải ngân.

## Kiểm chứng

Môi trường local Windows/Node24.22.1/pnpm11.19.0. Mongo QA rs-test riêng, các
database `latlai_direct_completion_*_test`, `wallet_checkout_*_test` và ledger
integrity riêng; storage ảnh/signing fake, tiền và carrier mô phỏng, mail local.
Không provider trả phí, Brevo, GHN thật hay DB/bucket chính.

Fixture lịch sử tạm dùng policy fake trong try/finally chỉ để tạo chain receipt/
audit/outbox hợp lệ của implementation trước gate. Mọi assertion denial/replay/
worker/ledger chạy sau restore policy thật. Không gọi đây là acceptance mở release.
Snapshot đối soát mọi field nghiệp vụ/receipt/journal/entry/commitment/outbox;
chỉ bỏ lockSeq vì private read cũng lấy write locks theo protocol.
Suite wallet dùng database ngẫu nhiên riêng cho cả API lẫn migrator fixture:
worker không quét hồ sơ của file E2E khác. Full reconciliation vẫn kiểm toàn bộ
chain của48ca trước teardown; afterAll xác nhận DB/user/role riêng được xóa.

| Check | Trạng thái |
| --- | --- |
| Hai regression trước chốt chặn | FAIL2/SKIP45 như dự kiến: canConfirmReceipt còn true; chưa có metric blocked. Source/khảo sát trước đã xác nhận worker giải ngân |
| Gate-focused sau sửa | PASS7/SKIP40; sau đó thêm biến thể worker với legacy carrier, kiểm đủ8ca trong full wallet |
| Full wallet/checkout | PASS48/48, gồm8ca gate và reconciliation cuối suite; không skip. Rerun sau khi cách ly DB riêng cũng PASS48, gồm cleanup assertions trong afterAll |
| order-preparation/delivery-overdue/shipments | PASS20/SKIP88 theo filter worker/registration/replay/current/LOCKED; không full suite |
| Auction PointOrder | PASS3/SKIP70: settlement bình thường, claim giữ tiền, carrier delivery/settlement mô phỏng; không full auction hoặc GHN thật |
| Mongo ledger integrity | PASS5/5, không bypass validator; không chạy lại import/failover vì không đổi persistence protocol/migration |
| API unit | Lượt đầu song song khi nhiều check cùng chạy:287PASS/1FAIL ở child shutdown Windows. Ca đó chạy riêng PASS1/1, toàn unit chạy tuần tự PASS288/288. Không sửa assertion hoặc tăng timeout; không suy chắc nguyên nhân từ một lần lỗi |
| API types/lint/build | PASS TypeScript6.0.3, Oxlint1.83.0 và Nest build; scope lint Orders/Wallet/worker/wallet-checkout test/Mongo fixture helper |
| Contract/routes | PASS generated check và0.68.0/213operation/33controller |
| Consumer types | PASS RN noEmit, User Web/Admin project build typecheck trong workspace hiện tại; không browser/native acceptance của UI đang sửa dở |
| Docs/diff | PASS trong phạm vi gói; không đưa trailing whitespace của UI ngoài gói vào kết luận này |
| CI mới/native/live provider/human acceptance | NOT RUN gói này; main2ae2212b11/11CI PASS là evidence của base, không thay cho source mới |

Auth matrix kiểm guest/sai owner/Staff, participant giả operator, mất role/phiên,
LOCKED/RESTRICTED existing-obligation replay, overpost flag và key khác target.
Race dùng Mongo user-lock barrier giữa receipt/delivery và delivery-overdue review;
không chỉ gọi tuần tự. Worker lặp không tạo settlement/skipped loop cho Inspection;
legacy Completed vẫn replay quyết toán cũ một lần, không đảo tiền.

## Giới hạn và bàn giao

Đây là containment: claim chất lượng, phủ nhận carrier Delivered trong inspection,
phân xử/return và hoàn tất DirectDelivery vẫn chưa đầy đủ. Dữ liệu Inspection cũ
tiếp tục giữ tiền/sách; không hứa có quy trình thủ công giải quyết đã triển khai.
Task UI quote/trạng thái và Seller RN là các gói tiếp theo, chưa nằm trong diff này.
Không thay READINESS, mở native runtime hoặc suy AI review thành human acceptance.
Push/PR/merge/deploy của gói mới cần đúng quyền riêng; PR84 không tự cấp quyền này.
Đã đối soát/dọn6tên DB QA dùng cho gói, không còn database/user/role tương ứng;
không còn DB khác trong replica set QA nên đã dừng service do lượt này mở.
Các process/môi trường ứng dụng chính giữ nguyên. Các thay đổi UI/ảnh ngoài gói
giữ riêng, không stage cùng checkpoint này.
