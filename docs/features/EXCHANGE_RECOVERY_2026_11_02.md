# Exchange gói 2 — phục hồi thao tác Member — 02/11/2026

Owner duyệt triển khai tiếp sau gói thỏa thuận. Branch `codex/exchange-intent-recovery`,
base `a1258e1a`, subject `fix(exchange): preserve exact intents across uncertain responses`.
Bằng chứng dưới đây chạy trên base + source của commit chứa báo cáo; không là CI
của main. Working tree còn28file UI/ảnh ngoài gói được bảo toàn; browser/build
đọc workspace kết hợp này, không phải clean checkout chỉ riêng commit mới.
Manifest/checksum đối soát local ở `.tmp/exchange-recovery/scope.json` và
`.tmp/batch-integration/local-preserved.json`.
[Khảo sát core](CORE_EXCHANGE_AUDIT_2026_11_02.md),
[gói 1](EXCHANGE_AGREEMENT_2026_11_02.md),
[ADR0063](../adr/0063-exchange-agreement-snapshots.md).

## Kết quả và giới hạn

Web và RN dùng cùng bộ giữ lệnh trong [session-client](../../packages/session-client/src/exchange-commands.ts).
Mất phản hồi, timeout,429,5xx hoặc phản hồi không xác minh được không tạo key mới,
không thay body/version gốc. Hai lượt bấm đồng thời dùng một request; lệnh khác bị
chặn khi kết quả chưa rõ. GET mới hơn không tự chứng minh lệnh đã được ghi nhận.
Lỗi4xx xác định cho phép sửa thông tin/gửi lệnh mới;401/403/408/429 và
IdempotencyConflict giữ intent nếu identity chưa thay đổi.

Sau ACK hợp lệ, chỉ đọc lại. Với funding phải xác nhận fundedAt của đúng người
tham gia trước khi nói đã ghi nhận tiền. GET lỗi hoặc lùi revision giữ ACK và
khóa thao tác; chỉ mở lại khi GET đủ mới đã đến dữ liệu thực render. Snapshot
revision cao nhất trong phiên ngăn lần GET cũ sau đó làm hiện lại nút nộp tiền.
Tạo đề nghị lưu ID đã xác nhận theo sách nhận để GET hội thoại cũ không mở lại
form tạo trùng; giữ tới khi đã đọc/render trạng thái terminal của đề nghị đó.

Store chỉ ở RAM, gắn SessionClient/identity/generation. Logout/đổi tài khoản xóa
state và loại continuation/ACK/GET muộn. **Reload trình duyệt, khởi động lại app,
đổi thiết bị hoặc tab khác không có recovery xuyên phiên**; phải tìm giao dịch
hiện có/đối soát trước khi tạo mới. Không thêm token store hoặc persist body/PII.
Tin nhắn mở đầu RN vẫn best-effort như trước; không tuyên bố chat/address inline
có idempotency mới. Không đổi API, contract, migration, worker hay nghiệp vụ tiền.

## Hành trình và source

| Vai trò / entry | Điều kiện và thao tác | Kết quả, bước tiếp và phục hồi |
| --- | --- | --- |
| Member web / hội thoại đã chốt mode Exchange | [ExchangeOffer](../../apps/user-web/src/components/conversation/ExchangeOffer.tsx), chọn sách/nơi nhận rồi gửi | Giữ proposal qua Back; khi ACK có ID hiện link mở đề nghị kể cả GET room cũ. Chặn đổi terms/mode tại [NegotiationWorkspace](../../apps/user-web/src/pages/NegotiationWorkspace.tsx) khi proposal chưa rõ kết quả |
| Member web / phiếu trao đổi hoặc phiếu nhúng trong room | [service](../../apps/user-web/src/services/exchange.ts), [detail mapper](../../apps/user-web/src/services/exchangeDetail.ts), [page](../../apps/user-web/src/pages/ExchangeDetailPage.tsx), [ActionCard](../../apps/user-web/src/components/exchange/ActionCard/index.tsx) | [RecoveryPanel](../../apps/user-web/src/components/exchange/ExchangeRecoveryPanel.tsx): chưa ACK thì retry đúng lệnh; có ACK thì chỉ tải trạng thái. Lỗi xác định giữ input trong dialog; lỗi bất định đóng dialog để lộ recovery |
| Member RN / Tài khoản → Trao đổi của tôi → mở phiếu | [detail](../../apps/mobile-react-native/src/features/exchanges/exchange-detail-screen.tsx), [actions](../../apps/mobile-react-native/src/features/exchanges/exchange-actions-card.tsx) | Cùng store/schema đầy đủ cho9lệnh Exchange. ACK funding không nhầm khoản của đối tác; GET lỗi chặn lệnh mới. Back giữ intent trong cùng runtime |
| Member RN / sách công khai → Đổi sách → soạn | [compose](../../apps/mobile-react-native/src/features/exchanges/exchange-compose-screen.tsx) | Proposal replay body/key gốc kể cả sách đã bị giữ hoặc inventory GET lỗi; ACK mở đúng ID, không tạo lại. Điều kiện chưa đủ vẫn có loading/error và Back |

[Hook RN/panel](../../apps/mobile-react-native/src/features/exchanges/exchange-recovery.tsx)
dùng snapshot theo revision và opt-out React Compiler tại đúng hook đọc mutable
external store. Browser đã tái hiện compiler memo hóa selector theo client/id và
bỏ dependency revision: intent tồn tại nhưng nút thường vẫn hiện. Đã sửa và chạy
lại cùng ca lỗi PASS; không tắt compiler cho toàn app.

## Kiểm chứng

Môi trường: Windows, Chromium headless, Member web1440/390 và RN Expo web390;
HTTP Nest + Mongo replica set `rs-test` tại127.0.0.1:57017. Fixture ngẫu nhiên
`ops_browser_*_test`, tài khoản/ảnh tổng hợp, storage fake/Sharp thật, mail local,
ví simulator có TEST_OPERATOR độc lập; không provider trả phí. Bút toán nạp tiền
qua API simulator, không sửa balance/capital. Thời gian/version cố định trong
fault GET/429 là fixture có chủ ý. Token/body được so sánh trong RAM, không ghi
vào report/log. Không gọi GHN/Brevo/Supabase/AI thật hoặc DB chính27017.

| Check | Kết quả | Phạm vi |
| --- | --- | --- |
| Shared session-client unit | **129 PASS** |23ca recovery mới: key/body/version,429/408/401/403/5xx/conflict, concurrent/negative, malformed ACK, own funding proof, read fence/version floor, logout/late response/proposal |
| Member web unit | **278 PASS** |16ca Exchange service, gồm3ca thêm về429, ACK+GET503 và late mapper/đổi identity |
| RN unit | **223 PASS** | Full bộ hiện có; behavior store mới được kiểm ở shared và browser, không gọi đây là23ca native mới |
| RN/web/Admin types, web build | PASS | Consumers TypeScript của shared export; không thay cấu hình typecheck |
| RN Expo web export | PASS,32route | Exit0; CLI force-exit sau export. Không là Android/iOS/native PASS |
| Browser/HTTP runner | **5/5 scenario PASS** | Chi tiết bên dưới; API/Mongo thật, lỗi mạng/GET/429 có kiểm soát |
| Lint phạm vi | PASS với giới hạn | Web còn2warning effect địa chỉ có sẵn; không sửa test/rule để che lỗi |
| UI mechanical detector | **19 advisory**, exit0 | Màu có sẵn ở ActionCard CSS/ExchangeComposePage/NegotiationWorkspace; không có CSS/palette mới, không gọi detector sạch hoặc critique PASS |
| Contract/routes/docs/scoped diff checks | PASS | Contract/route không đổi từ gói1; không migrate DB chính. Whole-workspace diff-check FAIL do trailing whitespace có sẵn ở AccountMenu ngoài gói |
| Native/TalkBack/chữ lớn/người thật/live provider/CI source mới | **NOT RUN** | Giữ các gate hiện hành, không suy từ Expo web hoặc test tự động |

Runner: `pnpm test:exchange-recovery:browser`, source
[scripts/test-exchange-recovery.mjs](../../scripts/test-exchange-recovery.mjs).
Đọc runner và [QA setup](../handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app)
trước chạy: cần build API, export RN web với API QA3009, port3009/3010/5194/8087
rảnh và MONGO_TEST_URL trỏ đúng QA57017/rs-test/*_test. Runner từ chối URL khác;
không đọc .env riêng hoặc cấu hình provider chính. Không tự thêm runner nặng vào CI.

1. Web funding: POST thật commit rồi mất ACK → Back/trở lại →429 → replay cùng
   key/body và header Idempotency-Replayed. GET503 → GET cũ → GET mới; không gửi
   funding lại sau ACK, không gọi cancel, đúng1OrderPayment journal.
2. RN Expo web funding: cùng chuỗi trên, điều hướng qua Tài khoản rồi browser Back
   trên route thật; GET cũ sau recovery cũng không hồi sinh nút nộp tiền.1journal.
3. Web entry thật ExchangeOffer: commit tạo rồi mất ACK → Back →429 → replay;
   GET room cố ý cũ nhưng hiện ID đã tạo, đúng1proposal, không mở form tạo trùng.
4. RN sách → composer: commit tạo/mất ACK → nút Back về sách → mở lại →429 →
   replay cùng body/key; đúng1proposal đang Proposed, không tạo thêm.
5. Web/API: cancel thật đã commit nhưng giữ ACK, logout thu hồi phiên, đăng nhập
   người còn lại rồi trả ACK cũ; tài khoản mới không có pending/ACK cũ. Replay
   bằng bearer đã thu hồi bị HTTP401 dù receipt đã tồn tại.

Trong dựng bài kiểm tra đã sửa các lỗi harness: dùng điều hướng Expo thật thay
manual popstate cho Back, bấm label của checkbox ẩn, dùng đúng nhãn submit và
alertdialog. Tái sử dụng login UI cho fixture thay đăng nhập thừa làm chạm limiter;
không tắt limiter/đổi nghiệp vụ để bài test qua. Có failure trước sửa hook compiler
như mô tả trên; ca này đã được chạy lại cùng assertions tiền/key/body.
Artifacts local ở `.tmp/exchange-recovery/`; log kiểm tra `.tmp/exchange-recovery-*.log`.
Fixture/server/browser tự dọn finally. Đối soát cuối:0owned database/user/role,
0database QA khác; mongo-test đã dừng,3009/3010/5194/8087/57017 đã đóng. Mongo
chính27017 vẫn healthy/running, không sửa/migrate/reset/seed/dừng. 28file UI/ảnh
ngoài gói giữ nguyên checksum. `AccountMenu.module.css:109` có trailing whitespace
trong local work ngoài gói; không sửa/stage cùng thay đổi này. Đây không phải
kiểm thử storage hoặc provider thật.

## Phát hiện còn mở và bước tiếp

- X06 retry trong [khảo sát](CORE_EXCHANGE_AUDIT_2026_11_02.md) đã xử lý ở phạm vi
  runtime web/RN nêu trên. Chưa có recovery qua cold restart/tab khác; không gọi
  toàn core Exchange hoàn thành. X04/X05 giao nhận từng chiều/expiry chưa sửa.
- **Xác nhận qua source và screenshot:** NegotiationWorkspace mode Exchange vẫn
  có khung “Tiền sách/Tổng thanh toán” dùng agreedPrice/salePrice của luồng mua.
  Fixture salePrice125k, exchangeValue150k đối ứng100k/bù50k nhưng box hiện125k.
  Ảnh `.tmp/exchange-recovery/web-negotiation-exchange-sale-summary.png` thuộc cùng room;
  không phải số tiền ledger thu. Đây là nội dung có sẵn, gói này chỉ khóa command
  và nối recovery, chưa thay toàn khung tài chính thương lượng. Cần sửa scoped
  theo mode và đối chiếu với phiếu thỏa thuận, kiểm cả hai vai trò.
- Main remote fetch lúc bắt đầu vẫn `48ab01fa`/PR86 support; nhánh teammate
  `feature/exchange-policy-and-transit-worker` từ `13e0931d` lên `ab74bb53`
  tại fetch cuối (fix wallet browser test/checkpoint); main giữ nguyên. Trước gói
  giao nhận phải đối chiếu/điều phối source mới này, không chồng sửa mù. Trước
  publish ghép main, giữ union support/AI và giải quyết ADR0062 trùng local/main.
- Chỉ commit local. Không push/PR/merge/deploy hoặc đổi READINESS/ADR0057/GHN.
  Native, UX người thật, human review/release vẫn là bằng chứng/quyền riêng.
