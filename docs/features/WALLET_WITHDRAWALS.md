# Rút tiền qua Admin — 03/11/2026

Owner làm rõ: nhập số tài khoản bất kỳ, Admin duyệt thì hoàn tất rút tiền trong
ví, không qua bước vận hành simulator. [ADR0073](../adr/0073-manual-wallet-withdrawals.md)
thay luồng đơn mới của [ADR0072](../adr/0072-simulated-wallet-withdrawals.md).

Nhánh `codex/wallet-withdrawals`; gói đầu `91e7c011`, phần làm rõ tiếp trên cùng
nhánh. Contract0.74.1; migration0061không sửa0060hoặc dữ liệu lịch sử.

| Vai trò | Entry và thao tác | Kết quả |
| --- | --- | --- |
| Member | Ví → Rút tiền, popup số tiền/lý do/ngân hàng/tài khoản/chủ nhận → xác nhận | Requested, giữ khoản rút riêng; không cần cấu hình simulator hoặc xác minh với ngân hàng |
| Admin độc lập | Yêu cầu rút tiền → Xem đơn → popup lý do → Duyệt | Completed + debit từ hold + thông báo + lịch sử Rút tiền trong cùng transaction |
| Admin độc lập | Popup Từ chối có lý do | Rejected + trả hold về khả dụng |
| Member | Lịch sử/chi tiết/thông báo | Trạng thái, lý do, tài khoản che bớt và tiến độ; owner-only |

Phiên Admin trong15phút, current auth trước replay, version/key/body và ledger
invariants được giữ. Mất ACK thử lại cùng yêu cầu, không trừ lần hai. Đây là cập
nhật tiền trong ứng dụng, không có chuyển khoản ngân hàng. Đơn Simulator cũ vẫn
được đọc/xử lý theo trạng thái cũ; không tự chuyển Processing chưa rõ thành thành công.

## Kiểm chứng

Follow-up PASS13withdrawal E2E,31Mongo schema/member-account/local-demo upgrade,
320Member/229Admin unit, API/Member/Admin typecheck/build, contract/routes và docs
check. Các ca mới kiểm arbitrary account `123456`, simulator tắt, Admin duyệt hoàn
tất trong một command, replay một journal và không fake simulator event.

Browser PASS22captures ở1440/390/320/chữ130%,0page errors/overflow: popup/required
fields, Member/Admin mất ACK và retry cùng key/body, duyệt độc lập hoàn tất ngay,
một payout, từ chối trả tiền và owner-only deep link. API/Mongo QA thật; funding
fixture và storage fake, không gọi ngân hàng. Đã xem lại form desktop, Admin
completed desktop và Member completed mobile; giữ popup, component và brand cũ.
Evidence private: `.tmp/manual-withdrawals-evidence/result.json`, ảnh cùng folder;
log `.tmp/manual-withdrawals-api.log`, `.tmp/manual-mongo.log`,
`.tmp/manual-admin-tests.log`, `.tmp/manual-user-tests.log`.

Gói đầu có12withdrawal E2E,61Mongo/6SKIP,150session/14RNwallet và22ảnh browser
cho luồng Simulator cũ. Không cộng các lượt đó thành kết quả follow-up.

Gói đầu full API còn Windows shutdown timeout và stress100topup503khi hết retry;
không xem các suite đó là PASS. Follow-up không sửa runtime budget hoặc nghiệp vụ
nạp tiền. Native UI, ngân hàng thật, human acceptance và CI/remote publication
không nằm trong bằng chứng web/QA.

## Vận hành local

Đã áp migration0060/0061 trên bản sao nhất quán ở rs-test/_test:4628bản ghi cũ
nguyên vẹn, ledger cân. Sau đó backup private DB chính, áp đúng hai migration
pending và cập nhật role app cho collection mới. Kiểm lại toàn bộ bản ghi cũ và
password không đổi, ledger cân; không reset/seed hoặc đổi `.env`. Báo cáo private
ở `.tmp/manual-withdrawals-activation/qa-report.json` và `main-report.json`; archive
backup nằm cùng thư mục bị ignore, không đưa vào Git.

Tại lượt kích hoạt, API3000 và hai worker đã restart từ build mới;
GET API chính PASS health, withdrawalsEnabled=true và owner-only withdrawal read.
Không tạo/duyệt đơn hoặc trừ tiền owner khi kiểm tra; toàn bộ mutations ở QA riêng.

Ở lượt tiếp tục cuối phiên, các tiến trình đã dừng. Đã bật lại Member5174/Admin5173,
Docker Desktop, container Mongo local cũ và API/worker bằng cấu hình hiện có.
Docker gặp socket tạm lỗi truy cập; đóng/mở lại Docker giải quyết được, không cần
xóa socket/reset/volume hoặc chuyển DB. Container healthy; GET wallet/withdrawals
chính lại PASS và withdrawalsEnabled=true, không tạo đơn. QA vẫn dừng.
Người dùng tải lại `/wallet` để dùng luồng mới.

Chưa push/merge, không đổi READINESS; checkpoint follow-up dùng subject
`fix(wallet): complete withdrawals on admin approval without simulator`.
