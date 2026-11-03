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

## Thông báo đơn chờ duyệt trên Ví

Owner yêu cầu03/11 hiển thị rõ số đơn chờ và thời gian xử lý dưới24giờ. Nhánh
`codex/wallet-pending-withdrawal-notice`, base `cec2fc6f`; checkpoint subject
`feat(wallet): highlight pending withdrawal requests`.

Thông báo nằm ngay dưới tiêu đề, phía trên thẻ ví/lịch sử, dùng wine/cream hiện có.
Copy: “Bạn đang có N đơn rút tiền chờ duyệt” và “Yêu cầu sẽ được xử lý trong vòng
dưới 24 giờ kể từ khi gửi.” Đây là thời gian xử lý owner yêu cầu công bố; không
thêm job tự duyệt hoặc thay quyền Admin.

Đọc endpoint owner-only hiện có với state Requested; duyệt hết cursor pages,
dedupe ID để đếm đủ, không suy từ10đơn lịch sử đang tải hoặc số tiền hold. Cache
theo owner, kiểm lại15giây khi tab đang hiển thị và sau gửi/đọc trạng thái đơn.
Không có đơn thì ẩn; đọc lỗi có retry, không hiện count cũ hoặc suy zero. Một đơn
có nút Xem chi tiết, nhiều đơn mở đơn mới nhất, giữ query params khác. Không sửa
API/contract/migration/số dư/dữ liệu owner. Giữ DESIGN/token; không thêm ảnh.

PASS320Member unit/typecheck/build/lint; không có cảnh báo lint trong component
đổi, các cảnh báo cũ ngoài feature còn. Detector một lượt:4advisory cũ của CSS
form/list (size/radius), không finding mới ở banner. Browser cuối PASS30captures
1440/1000/390/320/chữ130%,0page errors/overflow, API/Mongo QA riêng thật:

- Một đơn chờ có thông báo dưới24giờ trên màn đầu, link mở đúng chi tiết.
- Hai đơn chờ với server trả một đơn mỗi cursor page vẫn đếm2; Completed/Rejected
  không tính và thông báo ẩn khi hết chờ. Không đổi quyền, ACK/replay/hold/refund.
- Main UI HMR; không tạo đơn trên dữ liệu owner. QA fixture/roles được teardown,
  Mongo QA dừng, app chính3000/5173/5174 giữ chạy.

Lượt browser đầu FAIL do assert deep link trong lúc login còn đang chuyển trang;
helper nay chờ URL đích sau click, không nới timeout hoặc rút motion. Lượt chạy
lại PASS. Build đầu bắt lỗi suy luận kiểu trong cursor loop; đã thêm type tường
minh và build lại PASS. Evidence private `.tmp/pending-withdrawals-evidence/`,
`.tmp/pending-wallet-browser-retry.log`, `.tmp/pending-wallet-build.log`,
`.tmp/pending-wallet-unit.log`. Không coi đây là native/human/CI/release PASS;
không push/merge hoặc đổi READINESS.

## Bỏ khối danh sách yêu cầu riêng

Owner yêu cầu bỏ khối “Yêu cầu rút tiền” dưới lịch sử trong ảnh follow-up.
`codex/wallet-remove-withdrawal-list`, base `4876c54c`; checkpoint subject
`refactor(wallet): remove separate withdrawal request list`.

Bỏ list/read pagination riêng và CSS/icon không còn dùng. Giữ banner chờ duyệt,
lịch sử giao dịch “Rút tiền”, form/chi tiết popup và deep link từ thông báo. Refresh
số dư/lịch sử theo polling banner thay cho list cũ, để Admin xử lý xong vẫn cập
nhật được. Không xóa bản ghi, journal hoặc chức năng rút tiền; không sửa API/DB.

PASS320Member unit/typecheck/build/lint (cảnh báo cũ ngoài component đổi).
Browser cuối PASS30captures1440/1000/390/320/chữ130%,0page errors/overflow:
khối riêng vắng mặt, pending banner/count/SLA còn, form/exact retry hoạt động,
duyệt/từ chối và popup từ thông báo đúng đơn, history và owner-only giữ nguyên.
API/Mongo QA thật, funding/storage fixture. Đã xem desktop/320px, giữ DESIGN/token.
Detector một lượt chỉ có2advisory radius10px cũ trong form, không finding mới.

Các lượt browser trước chưa PASS: thêm login để mở detail gây429 ở QA, selector
nhầm nhãn notification với nhãn trạng thái, và header menu timeout. Runner cuối
vào trực tiếp `/wallet`, mở detail qua notification thật; không nới timeout hoặc
đổi auth/rate limit/runtime budget. Evidence private
`.tmp/withdrawals-without-list-evidence/`,
`.tmp/without-withdrawal-list-browser-direct.log` và
`.tmp/without-withdrawal-list-{build,unit,lint}.log`. QA fixture được teardown,
Mongo QA dừng, app chính giữ chạy. Không push/merge hoặc đổi READINESS.

## Popup rút tiền và hiệu ứng tương tác

Owner yêu cầu làm đẹp form và thêm nhiều hiệu ứng. Nhánh
`codex/withdrawal-form-motion`, base `6c81c12a`; checkpoint subject
`feat(wallet): refine withdrawal form with receipt transitions`.

Form riêng760px: header wine/cream,2bước local, số dư thật, tiền/reason bên trái
và tài khoản nhận bên phải; mobile một cột. Chọn nhanh50k/100k/500k/tối đa không
vượt số dư; vẫn giữ raw digits, validation và lý do Member. Bước kiểm tra là
phiếu tóm tắt số tiền/người nhận/lý do/phí0/số dư sau gửi; quay lại không mất input.
Giữ disabled fieldset khi review/busy/unknown, expected body/key và chỉ mở kết quả
sau ACK. Không đổi API/contract/DB hoặc popup dùng chung.

Effects: popup520ms, backdrop fade320ms + blur4px tĩnh, header light một lượt900ms,
nhóm field420ms lệch80ms, underline320ms, Other240ms, receipt360ms, focus/hover/
press180ms, CTA light650ms/arrow và spinner900ms chỉ khi đang gửi. Hover lift
giới hạn fine pointer, motion giữ nguyên cả hai OS preferences theo owner; không
thêm delay chặn thao tác hoặc vòng nền liên tục. Scope, type/spacing/motion ở
[surface brief](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-walletwithdrawals-tsx.md);
giữ DESIGN/token, không thêm asset/dependency.

PASS320Member unit/typecheck/build/lint (cảnh báo cũ ngoài feature), hai lượt
browser30captures desktop/1000/390/320/chữ130%,0page errors/overflow, API/Mongo QA
thật và funding/storage fixture. Kiểm computed popup520ms ở cả2OS preferences,
preset tối đa/100k, back/edit giữ input, lostACK/exact retry, chỉ một payout,
notification detail, reject/refund và owner-only. Đã xem desktop/320px/receipt
mobile; finding input bị CSS global đè đã sửa bằng selector scoped và kiểm
font>=24px/border0. Không sửa global forms. Modal16px là quyết định scoped;
detector một lượt có2advisory radius (16px mới có chủ đích,10px receipt cũ),
không chạy lại để lấy0findings. Token hover/error/shelf khai báo trong popup vì
native dialog portal không kế thừa biến từ trang Ví.

Evidence private `.tmp/withdrawal-form-motion-evidence/`,
`.tmp/withdrawal-form-browser-final.log`, `.tmp/withdrawal-form-build.log`,
`.tmp/withdrawal-form-unit.log`, `.tmp/withdrawal-form-lint.log`.
Smoke bổ sung PASS hover giữ nền wine, focus có vòng2px/tiền>=24px và motion520ms
khi OS reduce: `.tmp/withdrawal-form-hover-smoke.log`; QA riêng, không gửi
đơn. Final build PASS sau token portal fix. QA đã teardown/dừng; main apps giữ
chạy, không mutation owner, push/merge hoặc đổi READINESS. Đây là review AI trên
browser, không thay native/human/CI acceptance.

## Màu nút khi hover/nhấn/focus — 04/11/2026

Owner báo nút Tiếp tục trắng khi tương tác và yêu cầu rà nút khác. Nhánh
`codex/wallet-button-interaction-colors`, base `bd985543`; checkpoint subject
`fix(wallet): keep popup buttons readable in every interaction state`.

Tái hiện trước sửa: thiếu inherited hover token làm Tiếp tục và nút Bỏ bản nháp
trong portal có foreground/background đều paper (contrast1:1) khi hover/active.
Form chính được kiểm cả tình huống cố ý bỏ token; guard draft là trường hợp
portal thật không có token của form. Thêm fallback theo brand cho primary,
secondary và pending-link, foreground rõ ở hover/active/focus; ring nút đóng trên
header wine dùng paper. Không đổi API, handler, disabled, key/body hoặc hiệu ứng.
Rà source nút Wallet/PurchaseDialog; kiểm tương tác các nút enabled trên Ví,
popup nạp/rút tiền, review/retry, guard draft và pending notice.

PASS111tổ hợp nút/trạng thái trong8context, keyboard focus/hover/nhấn thực bằng
Playwright, contrast thấp nhất5.08:1 sau sửa; chặn riêng click của phép đo để không
submit hoặc điều hướng. Chạy tiếp journey thật PASS30captures/0page errors/0overflow,
API/Mongo QA riêng, funding/storage fixture: form,2OS motion, exact retry, approve,
reject/refund, owner-only và notification detail. PASS320Member unit/typecheck/
build/lint (cảnh báo cũ ngoài phần sửa). Detector một lượt chỉ2radius advisory cũ.
Đã xem lại form desktop; không thay DESIGN/token chung hoặc thêm ảnh.

Regression dùng [helper đo state](../../scripts/wallet-button-states.mjs) trong
runner hiện có. Evidence private `.tmp/wallet-button-states-evidence/button-states.json`,
`.tmp/wallet-button-states-before.log` (FAIL tái hiện),
`.tmp/wallet-button-states-after.log`, `.tmp/wallet-button-states-{build,unit,lint}.log`.
Không tác động tiền/dữ liệu owner; QA teardown/dừng, main apps giữ chạy. Không
push/merge, native/human/CI acceptance hoặc đổi READINESS.
