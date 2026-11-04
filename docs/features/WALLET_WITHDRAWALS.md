# Rút tiền qua Admin — 04/11/2026

Owner làm rõ: nhập số tài khoản bất kỳ, Admin duyệt thì hoàn tất rút tiền trong
ví, không qua bước vận hành simulator. [ADR0073](../adr/0073-manual-wallet-withdrawals.md)
thay luồng đơn mới của [ADR0072](../adr/0072-simulated-wallet-withdrawals.md).

Nhánh bàn giao `codex/wallet-withdrawals-ready`:14commit chức năng/UI từ
`91e7c011` đến `daa2441a`, đồng bộ main `3cfe0c6d` bằng merge `aaf6e6cc` không
xung đột. Owner04/11 yêu cầu tách commit và push nhánh; chưa giao PR/merge/deploy.
Gói đầu tại `codex/wallet-withdrawals`. Contract0.74.1; migration0061không sửa
0060hoặc dữ liệu lịch sử. Bằng chứng mới nhất theo từng refinement ở cuối file;
sync main chỉ mang cập nhật Flutter, không thay source web/API đã kiểm.

| Vai trò | Entry và thao tác | Kết quả |
| --- | --- | --- |
| Member | Ví → Rút tiền, popup số tiền/lý do/ngân hàng/tài khoản/chủ nhận → xác nhận | Requested, giữ khoản rút riêng; không cần cấu hình simulator hoặc xác minh với ngân hàng |
| Admin độc lập | Yêu cầu rút tiền → Xem đơn → Duyệt yêu cầu → popup Xác nhận, không nhập lý do duyệt | Completed + debit từ hold + thông báo + lịch sử Rút tiền trong cùng transaction |
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

## Bố cục bước xác nhận — 04/11/2026

Owner yêu cầu làm đẹp phần kiểm tra trước khi gửi. Nhánh
`codex/withdrawal-confirmation-layout`, base `6008f1c2`; checkpoint subject
`refactor(wallet): clarify withdrawal confirmation layout`.

Tách số tiền/phí/khả dụng sau gửi thành vùng cream bên trái; tài khoản nhận và
lý do ở bên phải trên nền paper, ngân hàng/chủ nhận cùng hàng và số tài khoản
24px nổi bật. Số tiền28–36px, bỏ dải số dư lặp lại; ghi chú hold/refund ở dưới,
nút Chỉnh sửa có mũi tên và không bẻ chữ trên mobile. Dưới680px xếp một cột.
Giữ animation, màu nút fallback/focus, draft/back, disabled/unknown và receipt.

Đồng thời snapshot số dư cho preview khi vào review: nếu mất ACK mà server đã
giữ tiền, cập nhật số dư Ví không làm preview trừ thêm một lần. Chỉ sửa trình bày;
server vẫn kiểm số dư/quyền và key/body như trước, không đổi API/contract/ledger.

PASS320Member unit/typecheck/build/lint (cảnh báo cũ ngoài phần đổi), browser cuối
33captures1440/1000/390/320/chữ130%,0page errors/overflow;111button states vẫn
đọc rõ. Kiểm back/edit giữ giá trị; mất ACK đã hold thật, thẻ ví cập nhật400k và
preview vẫn400k, không tính300k do trừ lặp; retry/duyệt/từ chối/refund/owner-only
giữ nguyên. API/Mongo QA thật, funding/storage fixture. Hai lượt kiểm giao diện:
đã xem desktop/390/320, sửa Back khỏi ngắt chữ rồi xác nhận mobile. Detector một
lượt chỉ advisory16px modal cũ, không sửa token/hiệu ứng dùng chung.

Evidence private `.tmp/withdrawal-confirmation-evidence/`,
`.tmp/withdrawal-confirmation-browser-final.log`,
`.tmp/withdrawal-confirmation-{build,unit,lint}.log`. QA teardown/dừng, main apps
giữ chạy, không mutation tiền owner. Không push/merge/READINESS hoặc suy
native/human/CI/release PASS từ browser.

## Bỏ tay nắm kéo giãn ô lý do — 04/11/2026

Owner yêu cầu bỏ góc `///` kéo dài ô nhập. Nhánh
`codex/withdrawal-textarea-no-resize`, base `e1c70627`; checkpoint subject
`fix(wallet): disable manual resizing of withdrawal reason`.
Textarea lý do dùng resize none/overflow-y auto, giữ rows3/maxlength500 và nội
dung form. Browser smoke với CSS module thật PASS: computed none, nội dung dài
cuộn trong ô và kéo góc không đổi chiều cao. Đây là CSS fixture riêng, không
authenticated wallet journey hoặc API command; không chạy lại luồng tiền.
PASS320Member unit/typecheck/build/lint (cảnh báo cũ ngoài phần đổi), docs/diff
check. Detector một lượt còn advisory16px modal cũ. Evidence private
`.tmp/withdrawal-textarea-resize-smoke.mjs` và `.tmp/withdrawal-textarea-*.log`.
Main apps giữ chạy; không đổi API/dữ liệu/READINESS hoặc push/merge.

## Dấu chấm hàng nghìn trong ô số tiền — 04/11/2026

Owner yêu cầu5300500hiện5.300.500khi nhập. Nhánh
`codex/withdrawal-amount-grouping`, base `5df75183`; checkpoint subject
`feat(wallet): format withdrawal amounts with thousands separators`.

Chỉ ô tiền rút hiển thị dot groups; state vẫn digits, validation/preview và API
vẫn dùng số nguyên. Preset/Tối đa cùng format; dán số có dấu chấm/khoảng trắng,
xóa trống, thay vùng chọn và sửa giữa số giữ caret. Backspace/Delete sát dấu phân
cách xóa chữ số lân cận, nhưng chọn riêng dấu chấm không làm mất chữ số. Từ chối
dấu âm/chữ/scientific thay vì biến thành số dương khác; format bằng string không
làm tròn số lớn, safe-integer/balance checks vẫn giữ nguyên. Native pattern chấp
nhận display có nhóm3chữ số. Không đổi số tài khoản/API/contract/ledger.

PASS339Member unit (19ca helper mới), typecheck/build/lint với warning cũ ngoài
phần đổi; browser33captures/0page errors/overflow và111button states. Kiểm typing
5300500→5.300.500, paste, clear, middle replace, hai hướng delete/dấu chấm riêng,
preset/back, native validity và POST amount100000là number cùng exact key/body
sau lostACK; hold/preview/approve/refund/owner-only giữ nguyên. API/Mongo QA thật,
funding/storage fixture. Đã xem form desktop; detector TS một lượt0finding.
Evidence private `.tmp/withdrawal-amount-grouping-evidence/`,
`.tmp/withdrawal-grouping-{browser,unit,build,lint}.log`. QA teardown/dừng, main
apps giữ chạy; không mutation owner, push/merge hoặc đổi READINESS. Không suy
native/human/CI acceptance từ browser.

## Làm gọn popup chi tiết — 04/11/2026

Owner yêu cầu làm đẹp popup chi tiết. Nhánh `codex/withdrawal-detail-popup`, base
`c792f5c6`; checkpoint subject `refactor(wallet): refine withdrawal detail popup`.
Header đỏ rượu, nền giấy và opening/microinteraction dùng cùng form rút tiền.
Khối kem làm rõ tiền/trạng thái thật và phí0; chỉ Requested có nhắc xử lý dưới24h
và giữ tiền. Thông tin nhận tiền bên trái, timeline thật bên phải; dưới600px xếp
dọc. Số tài khoản vẫn che từ API, lý do/notes đầy đủ; mã UUID mở từ summary44px
bằng click hoặc bàn phím. Giữ error/retry, deep link owner và Processing recovery.

Finish review trên screenshot desktop,320px và390px/chữ130%: hierarchy tiền →
recipient → tiến độ rõ, không ngang tràn; chữ và state có icon/text, không chỉ màu.
Verdict: refinement phù hợp brief hiện có, không đổi DESIGN/token hoặc thêm raster.
PASS339Member unit, typecheck/build/lint (warning cũ ngoài phần đổi); browser API/
Mongo QA thật39captures,0page errors/overflow,111button states. Kiểm disclosure
Enter/full UUID, Requested/Completed/Rejected, mobile/chữ lớn, notification/deep
link, lostACK/exact retry và hold/payout/refund. Detector một lượt chỉ advisory
16px modal đã có. Evidence private `.tmp/withdrawal-detail-evidence/` và
`.tmp/withdrawal-detail-{browser,build,unit,lint}.log`. QA teardown/dừng; main apps
bật lại, không sửa .env/migrate hoặc mutation owner để kiểm. Không push/merge,
đổi READINESS hoặc suy native/human/remote CI PASS.

## Làm gọn danh sách Admin — 04/11/2026

Owner yêu cầu làm đẹp trang `/withdrawals` trong shell Admin hiện có. Nhánh
`codex/admin-withdrawal-queue-ui`, base `e212c34c`; checkpoint subject
`refactor(admin): refine withdrawal review queue`. Bỏ mũi tên rời trên title;
header ghép refresh thật, filter/danh sách/phân trang vào một panel giấy phẳng.
Count ghi rõ số yêu cầu đã tải, không suy tổng hàng đợi từ trang đầu. Nhóm initial
và tên thật với mã/ngày; tiền tabular căn phải, Requested là warning có nhãn,
Xem đơn có nền/viền và hover/active/focus rõ. Giữ API/filter URL/cursor/quyền/
simulator action và dialog approve/reject. Không thêm endpoint, KPI hay số liệu mẫu.

Container dưới720px xếp mỗi hàng thành bạn đọc, tiền/trạng thái, lý do, thao tác;
giữ một table với headers/labels,44px target, tên dài và trạng thái dài được xuống
dòng. Label Trạng thái tách khỏi select để tên truy cập không chứa mọi option.
Lượt browser đầu phát hiện vấn đề label này; đã sửa source và chạy lại toàn bộ.

Finish review đã xem desktop,320px,390px/chữ130%: hàng đợi là phần chính, hàng
thông tin dễ quét hơn và không kéo ngang. Giữ brand/shell/root DESIGN; verdict
phù hợp scope refinement, không thêm asset. PASS229Admin unit/typecheck/build/
lint (warning cũ ngoài phần đổi), final browser44captures/0page errors/overflow,
filter Requested→Completed trống→Requested, Xem đơn/Back, text scaling và117state
contrast checks (6mới cho refresh/link Admin). Luồng Member/Admin/hold/payout/
refund và exact retry vẫn qua API/Mongo QA thật với fixture/storage fake. Detector
một lượt còn3advisory literal cũ1.2rem/16px/1.35rem trong empty/dialog, không phải
finding mới của queue. Chưa là human/native/remote CI acceptance.

Evidence private `.tmp/admin-withdrawal-queue-evidence/`,
`.tmp/admin-withdrawal-queue-browser-final.log`,
`.tmp/admin-withdrawal-queue-{unit,build,lint}.log`. QA teardown/dừng, main apps
giữ chạy, không command dữ liệu owner, sửa .env/migration/READINESS hoặc push/merge.

## Rút gọn trạng thái lọc Admin — 04/11/2026

Owner yêu cầu bỏ các lựa chọn không dùng trong luồng duyệt trực tiếp. Nhánh
`codex/admin-withdrawal-status-filter`, base `eb443c0e`; checkpoint subject
`fix(admin): simplify withdrawal status filters`. Menu Admin thông thường chỉ có
Tất cả trạng thái, Chờ duyệt, Thành công, Bị từ chối. Manual duyệt là Completed;
Approved/Processing/FailedVerified/Refunded không còn là lựa chọn mặc định.
Read-only kiểm DB local chỉ thấy Manual Requested/Completed, không ghi dữ liệu.
Không xóa enum/API/lịch sử hoặc gộp Approved thành Completed: All vẫn đọc mọi đơn,
deep link trạng thái cũ giữ đúng lựa chọn cho đến khi đổi lọc. Route simulator
riêng giữ các trạng thái cần cho tương thích cũ. Không đổi ledger/state machine.

PASS229Admin unit/typecheck/build/lint với warning cũ; targeted QA browser kiểm
đúng4options, lọc Completed/Rejected/All, query URL, deep link Approved qua đăng
nhập rồi chọn Requested để trở lại menu gọn,320px/0page errors. QA không tạo đơn
hoặc chạy command tiền; không chạy lại full hold/payout/refund vì không đổi source
liên quan. Detector TS một lượt0finding. Evidence private
`.tmp/admin-withdrawal-filter-evidence/`,
`.tmp/admin-withdrawal-filter-smoke.mjs`,
`.tmp/admin-withdrawal-filter-browser-final.log` và
`.tmp/admin-withdrawal-filter-{unit,build,lint}.log`. QA teardown/dừng, main apps
giữ chạy. Không mutation owner, push/merge/READINESS hoặc native/human/CI claim.

## Popup xác nhận duyệt Admin — 04/11/2026

Owner yêu cầu làm đẹp popup duyệt. Nhánh `codex/admin-withdrawal-approval-popup`,
base `86ad4573`; checkpoint subject `refactor(admin): refine withdrawal approval popup`.
Popup560px có header đỏ rượu, dải tiền nền kem với trạng thái thật và bạn đọc/mã
ngắn. Thông tin nhận tiền dùng nhãn riêng, tài khoản24px giữ số0đầu, ngân hàng/chủ
tài khoản cạnh nhau; dưới480px xếp dọc. Giữ ghi chú phiên15phút và một CTA Xác
nhận, không thêm lý do duyệt. Header sticky trong native popup, max-height/scroll
và20px mobile insets. Opening420ms/backdrop fade240ms với blur4px tĩnh, hover/press
nhanh và nút đóng xoay trên fine pointer. Foreground close/CTA được cố định cho
hover/active/focus để CSS chung không làm mất tương phản.

Giữ ActionPanel, pending/unknown-result locks, intent/key/body/version, retry và
onFinish/ledger cũ. Caption Manual nói hoàn tất yêu cầu; đơn Simulator cũ chỉ nói
kiểm tra trước duyệt. Các action từ chối/chi/hoàn khác giữ nội dung và style hiện có.

Finish review trên browser desktop/390/320/chữ130% và lostACK: tiền, số tài khoản
và người nhận dễ đối chiếu; CTA và nhắc phiên rõ, không ngang tràn. Verdict phù hợp
brand/refinement hiện tại; giữ DESIGN/token, không thêm raster/dependency. PASS
229Admin unit/typecheck/build/lint (warning cũ), final browser47captures/0page
errors/overflow,126interaction states gồm close/Xác nhận/retry. Ca đầu phát hiện
CSS hover chung làm X tối trên nền đỏ; đã cố định foreground, lượt cuối close
contrast≥10.7 và CTA≥9.6 ở các tương tác. Kiểm Escape/restore focus, không textbox
duyệt, tài khoản giữ0đầu, lostACK/exact key/body, một payout, reject/refund giữ đúng.
Detector một lượt còn3advisory1.2rem/16px/1.35rem kế thừa, không có finding mới.

Evidence private `.tmp/admin-withdrawal-approval-evidence/`,
`.tmp/admin-withdrawal-approval-browser-final.log` và
`.tmp/admin-withdrawal-approval-{unit,build,lint}.log`. QA API/Mongo thật với fixture/
storage fake, teardown/dừng; main apps giữ chạy, không command tiền owner. Không
push/merge/đổi READINESS hoặc suy native/human/remote CI acceptance.

## Sửa checks PR96 — 04/11/2026

Head ban đầu `af87ed05` có4checks lỗi; nguồn chính thức là
[PR96](https://github.com/huangg49/used-book-marketplace/pull/96).
Flutter18file được format và sửa18lint tự động (braces/wildcard), analyze sạch và
15widget tests PASS. Fixture order-chat đáp ứng profile theo đúng actor cùng
auth reload; browser PASS và vẫn từ chối route không khai báo. Admin skip-link
focus tường minh, dossier chỉ tự focus khi theo navigation link phù hợp; phản hồi
muộn không chiếm focus menu/queue. Test đi theo tab order có queue region, giới
hạn fault theo moderation Rejected, scope lỗi/retry vào đúng khung. Admin full
browser/229unit/typecheck/build PASS. Origin QA riêng tránh port5174của Member.

Importer chỉ nhận đúng cặp reference baseline→free-shipping0052, giữ policy mới
cho giao dịch tương lai và snapshot phí/ledger lịch sử. Báo cáo không đếm policy
native vào bảng PostgreSQL. Kiểm drift policy/selection và vốn0055 trong7Mongo/
PostgreSQL cases PASS; API typecheck/lint PASS. Không đổi migration cũ, contract
hoặc database local chính. RunbookMIG06 được cập nhật theo0052/0055.

Evidence private `.tmp/pr96-ci/`, `.tmp/pr96-{import,order-chat,admin-browser}.log`,
`.tmp/pr96-flutter-{format-check,analyze,test}.log`. CI remote phải xem theo head
hiện tại tại PR; không dùng local checks làm human/native/release acceptance.
