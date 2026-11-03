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

## Trang Admin gọn hơn và duyệt bằng xác nhận

Owner yêu cầu03/11: rút gọn trang chi tiết, ưu tiên thao tác; popup duyệt không
cần nhập lý do, chỉ bấm “Xác nhận”. Nhánh `codex/admin-withdrawal-detail-ui`,
base `cf23cc66`; checkpoint subject `refactor(admin): compact withdrawal review and confirmation`.

- Số tiền/trạng thái và nút xử lý cùng vùng đầu trang; duyệt hiển thị ngay không
  cần cuộn ở1440×900. Từ chối dùng nút phụ; xác nhận vẫn đi qua popup.
- Sheet nhận tiền gom ngân hàng/tài khoản/chủ nhận, người gửi/ngày gửi/lý do;
  nhật ký gọn ở cột bên. Mã yêu cầu/mã chi vẫn đọc đủ trong “Mã tham chiếu”.
  Mobile một cột, dữ liệu dài xuống dòng. Giữ shell, wine/cream, Be Vietnam Pro,
  component chung, loading/error/retry và quyền hiện có.
- Popup duyệt gọn480px, hiển thị số tiền/người gửi/tài khoản nhận và “Xác nhận”,
  không textarea/validation lý do duyệt. Command ghi nhận cố định “Đã xác nhận
  yêu cầu rút tiền.” qua field `reason` hiện có; đây là xác nhận tự động theo
  thao tác, không phải lời giải thích do Admin nhập. Lý do từ chối và lý do rút
  của Member vẫn bắt buộc. Giữ receipt/key/body/version và retry sau mất ACK.
- Không sửa API/contract/migration hoặc dữ liệu chính. Main Admin5173 dùng HMR;
  không cần restart BE. Taste ledger được áp cho bố cục/độ gọn; giữ wine/cream và
  shell đã duyệt thay vì thay bằng chrome đen/trắng của sheet upstream.

PASS229Admin unit/typecheck/build/lint (4cảnh báo cũ ngoài feature). Browser cuối
PASS25captures1440/1000/390/320/chữ130%,0page errors/overflow, API/Mongo QA thật và
storage/funding fixture: duyệt không textbox, nút Xác nhận dùng ngay, quyết định
trong viewport1440×900, mở/đóng mã tham chiếu, lostACK/exact key-body retry và đúng
một payout, từ chối/refund, owner-only. Đã xem desktop/tablet/320px và popup xác
nhận desktop/390px. Lượt browser đầu timeout20s khi cold-start trang Member; retry
giữ nguyên timeout PASS, rồi lượt sau cập nhật popup cũng PASS. Không tính lần
timeout là PASS. Evidence `.tmp/compact-withdrawals-evidence/`, log
`.tmp/compact-withdrawal-confirm-browser.log` và `.tmp/compact-withdrawal-*.log`.

Detector chạy một lần:4advisory, không có finding chặn. Endpoint heading22px mới
đã đổi24px;3advisory còn lại là size/radius cũ của empty state/popup ngoài phần đổi.
Không chạy lại detector để làm đẹp số liệu. Main apps giữ chạy, chỉ dừng Mongo QA;
không mutation dữ liệu owner, push/merge hoặc đóng gate READINESS.
