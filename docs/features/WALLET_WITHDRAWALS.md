# Rút tiền mô phỏng — 03/11/2026

Nhánh `codex/wallet-withdrawals`, base `93289df5`. Owner yêu cầu lý do bắt buộc,
Admin duyệt, lịch sử mục đích Rút tiền, form popup và giao diện Admin đồng bộ.
[ADR0072](../adr/0072-simulated-wallet-withdrawals.md), OpenAPI0.74.0,
migration0060 là contract và quyết định của gói.

| Vai trò | Entry | Điều kiện và thao tác | Kết quả / bước tiếp |
| --- | --- | --- | --- |
| Member web | Ví → Rút tiền | Member không LOCKED, đủ available; popup nhập số tiền, lý do, thông tin nhận và xác nhận | Requested + hold; mở chi tiết ngay sau ACK; đóng về lịch sử Ví |
| Member web | Ví → Yêu cầu rút tiền / thông báo | Đúng owner, kể cả LOCKED; đọc hồ sơ bằng ID ngoài trang đầu | Timeline, trạng thái, lý do admin, tài khoản che bớt; chờ Admin/kết quả |
| Admin | Quản lý → Yêu cầu rút tiền | ACTIVE ADMIN độc lập; lọc trạng thái, danh sách ưu tiên đơn cũ | Xem đơn → chi tiết → popup lý do duyệt/từ chối |
| Admin | Chi tiết đơn Approved | Phiên trong15phút; gửi lệnh chi mô phỏng | Processing + payoutRef cố định; chờ operator, không gửi thêm lệnh chi |
| Test Operator | Mô phỏng → Chi tiền mô phỏng | TEST_OPERATOR độc lập; chọn yêu cầu Processing và kết quả trong popup | Success→Completed; Unknown→Processing; verified failure→FailedVerified |
| Admin | Chi tiết đơn FailedVerified | Phiên trong15phút; popup xác nhận hoàn | Refunded + trả đúng hold; Member nhận thông báo |

Mất ACK giữ nguyên key/body/version. Member giữ form và có nút kiểm tra lại;
Admin dùng ActionPanel/command/recovery/leave guard hiện có. Key không được đổi
để ép thành công. Lỗi quyền che dữ liệu cũ, form lỗi giữ nội dung, phân trang có
retry. Tài khoản nhận không tự thay trên đơn cũ khi người dùng sửa thông tin mới.

UI giữ palette đỏ rượu/kem và shell hiện có. Member dùng PurchaseDialog native
để giữ focus, Escape/Back, scroll và focus-return; Admin giữ Button, Notice,
StatusPill, ActionPanel cùng typography/filter/route. Không thêm thư viện UI.
Sửa grid/actions Ví cho màn nhỏ; không đổi thiết kế thẻ hoặc hiệu ứng hiện có.

## Kiểm chứng

PASS61Mongo tests/6SKIP (PG import/failover không cấu hình); upgrade giữ checksum
và ledger cũ, validators/index/role đúng snapshot0060.

PASS12API withdrawal E2E trên Mongo thật: validation/owner/role/self-review,
current auth trước replay, recent session, hold/payout/refund/unknown, event dedupe,
hai rút cạnh tranh và duyệt/từ chối cạnh tranh bằng Mongo write-lock barrier.
PASS5seller-wallet checkout ca liên quan (43ngoài filter SKIP); cập nhật kỳ vọng
phí0theoADR0063, không đổi hành vi thanh toán để khớp test. Cập nhật wallet
capability test và ca20event retry503 cùng key/body theoADR0027, như ca100event.

PASS320Member unit,229Admin unit,150session-client unit,14RN wallet unit;
API wallet/config unit30PASS và catalog-classification7PASS. Typecheck API/
Member/Admin/RN, build API/Member/Admin, contract generate/check/routes và lint
API/Member/Admin PASS (warning có sẵn ngoài scope). Node24.21.0/pnpm11.19.0.

PASS browser22captures:1440/390/320và chữ130%, field bắt buộc, popup/form giữ
nội dung, Member và Admin lost-ACK/exact retry, approval chưa payout, unknown giữ
hold, success một lần, reject hoàn, history/owner deep link từ chối.0page errors,
0document overflow. Không coi fixture là tiền ngân hàng thật.

Impeccable detector1lượt:8advisorytype/radius so với brief, không material sau
đối chiếu component hiện có. Finish review ban đầu yêu cầu recapture state/animation;
full review sau recapture có1P2history mobile. Đã sửa grid metadata/amount và badge,
recapture390/320/chữ130%; reviewer verdict **ship—listed fix resolved**, chỉ trong
phạm vi finding đó, không là một full review mới. Documenter đối chiếu source/
ảnh và giữ nguyên DESIGN.md/token sidecar; không thêm raster.

Bộ unit API đầy đủ ban đầu FAIL; lỗi vòng import catalog do snapshot mới đã sửa
và7catalog tests PASS. Barcode tests PASS khi chạy riêng; Windows shutdown test
vẫn FAIL timeout10s (file không đổi). Bộ hồi quy wallet rộng có57PASS/1FAIL ở
stress100topup khi một số lệnh vẫn503hết ngân sách retry; không tính là toàn suite
PASS hoặc sửa transaction budget để làm xanh. Ca withdrawal12vẫn PASS.
Native/browser RN, ngân hàng thật, daily scheduled reconciliation, human review,
CI/push/merge/deploy và nâng DB/app chính NOT RUN.
Browser runner: `node scripts/test-withdrawals.mjs`, dùng rs-test57017 và database
ngẫu nhiên `ops_browser_*_test`; API/Mongo thật, storage/payout mô phỏng.
Ảnh và log riêng ở `.tmp/withdrawals-evidence/`; không commit credential hoặc PII.

## Kích hoạt và giới hạn

Trước dùng source mới trên app hiện có, migrator chạy migration0060 và refresh
least-privilege app role bằng bootstrap hiện có theo ENV_HANDOFF. Restart API/
worker cùng source, rồi Member/Admin. Không reset/seed hoặc chạy test trên DB chính.
Không sửa `.env`, password hoặc cờ release. Gói source này không tự push/merge/
deploy, không thay READINESS hoặc coi AI review là human review.
