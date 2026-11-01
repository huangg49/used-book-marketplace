# Admin khóa/mở tài khoản — 01/11/2026

Nhánh local `codex/admin-account-controls`, base `f49160fa`, subject
`feat(admin): control account locks while preserving existing obligations`.
Theo FR-A07/AC-02/AC-49 và [ADR0059](../adr/0059-administrative-account-controls.md).

| Vai trò/entry | Điều kiện/command | Kết quả/bước tiếp |
|---|---|---|
| ACTIVE ADMIN: Người dùng → tên tài khoản | Current role/session, target version; lý do/điều kiện mở/reference → xác nhận | LOCKED, lịch sử bất biến; tải lại trước quyết định khác |
| ACTIVE ADMIN: tài khoản LOCKED | Lý do → khôi phục trạng thái trước khóa; legacy cần chọn rõ | ACTIVE hoặc RESTRICTED; không xóa violations/freezes/holds |
| Member bị khóa: đơn/hồ sơ/ví đang có | Existing-obligation service checks; chat chỉ real owned Order | Tiếp tục nghĩa vụ hỗ trợ; không tạo thương lượng, giao dịch hoặc nạp mới |
| Staff/outsider/self/ineligible Admin | Server từ chối trước replay | Không có tác động; UI không thay quyền server |

Source: [service](../../apps/api/src/modules/users/operations-users.service.ts),
[controller](../../apps/api/src/modules/users/operations-users.controller.ts),
[Admin](../../apps/admin-web/src/features/users/account-controls.tsx),
[Order chat](../../apps/api/src/modules/purchases/purchases.service.ts).
Confirmation giữ path/body/version gốc dù state refetch; mất ACK giữ intent qua
Back/remount, không chuyển Lock sang Unlock. History có cursor bound actor/target.

Contract0.66/210operations/32controllers, registry61 qua migration0048. Migration
thêm optional lock metadata và audit index; chỉ QA `_test` trên `rs-test`57017,
không DB chính. Không GHN/carrier, Flutter, ledger hoặc quyền settlement.

| Kiểm tra | Bằng chứng |
|---|---|
| API HTTP/Mongo | PASS76/76: account controls11, directory3, Order62; genuine target/actor contention, mutual Admin lock, stale/replay/body conflict/revoke, immutable-audit rollback, exact restore and legacy choice; actual Admin command locks Order participants, vẫn cancel/read/media/chat, new commands403 |
| Schema | PASS27/27, có0048; giữ checksum migrations cũ |
| Admin unit/typecheck/lint/build | PASS219/219, typecheck/lint/build; không dependency upgrade |
| API typecheck/build/lint, contract/routes | PASS; lint còn8warning cũ ngoài phạm vi |
| Shared intent | Dùng helper đã có, thêm đọc pending path để remount không đổi operation |
| UI detector | PASS0finding; không thay human UX acceptance |
| Browser | PASS: real Admin entry/confirm/stale refusal/history14rows pagination/lost ACK+refresh+Back/remount exact key/body;1440/390/320px +130%, đã xem ảnh320px |
| Native/live provider/remote CI/human | NOT RUN cho gói này; giữ local, READINESS không đổi |

Harness [account-controls](../../apps/admin-web/tests/account-controls.mjs) dùng
Nest/Mongo thật, storage fake, database ngẫu nhiên `_test`; tự dọn app process.
Schema/browser có một lượt bị gián đoạn khi Docker QA dừng, không tính PASS;
khởi động lại riêng replica QA rồi chạy kiểm chứng lại. Không suy DB chính từ đó.
Staff đề nghị khóa là phần yêu cầu còn riêng, không tuyên bố đã triển khai.
