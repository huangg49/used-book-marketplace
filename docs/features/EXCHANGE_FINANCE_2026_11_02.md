# Exchange gói 3 — khung tài chính hội thoại — 02/11/2026

Owner duyệt sửa điểm tiếp theo sau gói recovery. Branch `codex/exchange-financial-summary`,
base `650db20f`, subject `fix(web): distinguish exchange deposits from purchase totals`.
[Khảo sát core](CORE_EXCHANGE_AUDIT_2026_11_02.md),
[gói snapshot](EXCHANGE_AGREEMENT_2026_11_02.md),
[gói recovery](EXCHANGE_RECOVERY_2026_11_02.md). Đây là lát cắt Member web React/Vite,
không là gói sửa giao nhận/expiry/settlement hoặc bằng chứng hoàn tất toàn core.

## Vấn đề đã xác nhận và kết quả

Trước sửa, NegotiationWorkspace mode Exchange vẫn hiện “Tiền sách/Tổng thanh toán”
từ agreedPrice hoặc salePrice và quote mua. Fixture sách quy đổi150k/giá bán125k,
sách đối ứng100k/bù50k lại có khung tổng125k. Đây là sai ngữ nghĩa UI, chưa có bằng
chứng ledger thu125k. SRS FR-X02/FR-X05 tách giá trị sách, bên/số bù và hai cọc;
cọc mỗi bên bằng giá trị sách nhận, không khấu trừ tiền bù tương lai vào nghĩa vụ.
Không thay công thức tiền, API, schema contract, Mongo migration hoặc provider.

[NegotiationWorkspace](../../apps/user-web/src/pages/NegotiationWorkspace.tsx) nay
chọn khung theo mode đã được hai bên chấp thuận. Exchange không đọc giá bán,
agreedPrice hoặc quote mua để trình bày nghĩa vụ; không mở địa chỉ quote mua trong
khung này. Badge không nói đã chốt giá mua và vai trò được gọi theo đề nghị/chủ sách.
Mode Negotiation giữ khung thanh toán và quote mua riêng. Đề nghị chuyển mode chưa
được chấp nhận không tự đổi mode đang dùng.

[ExchangeFinanceSummary](../../apps/user-web/src/components/conversation/ExchangeFinanceSummary.tsx)
dùng đúng query key `exchangeDetail/userId/id`, mapper và dữ liệu phiên đã có của
phiếu nhúng, không dựng projection tài chính thứ hai. Mapper bổ sung partnerDeposit
trực tiếp từ cọc bên còn lại của API. Giá trị sách lấy snapshot; fundingAmount lấy
cùng mapper với phiếu, không tính lại từ listing hiện tại. ID ưu tiên phiếu lịch sử
đang xem → activeExchangeId → ID create ACK đã biết khi GET room còn cũ. Không tự
clear pending intent hoặc ACK từ summary; quyền/lệnh vẫn ở phiếu và server.

| Vai trò / entry | Điều kiện / nội dung | Kết quả và bước tiếp |
| --- | --- | --- |
| Hai Member / Chat → Phiếu thỏa thuận, mode Exchange | Chưa có đề nghị | Giá trị quy đổi đang đăng là tham khảo; cọc/bù chưa có thỏa thuận. Link anchor đưa focus tới phần chọn sách/đề nghị, không giả số0 |
| Người mở đề nghị / chọn sách | Đủ giá trị quy đổi hai phía | [ExchangeOffer](../../apps/user-web/src/components/conversation/ExchangeOffer.tsx) preview hai cọc và khoản mình sẽ nộp, ghi rõ dự kiến/chưa gồm phí; giá thiếu thì giải thích, có nút tải lại giá trị sách và chặn gửi mới. Retained intent vẫn replay body gốc kể cả dữ liệu hiện tại thiếu |
| Hai Member / đã có Proposed | Đọc phiếu đã lưu | Hiện tổng giá trị sách giao/nhận, bên bù/số bù, hai cọc và khoản dự kiến nộp nếu chấp nhận; chưa khẳng định đã giữ sách/tiền |
| Hai Member / AcceptedAwaitingFunding | Đọc fundedAt của chính viewer | Chưa nộp hiện khoản cần nộp; đã nộp hiện ghi nhận/chờ bên kia; unknown command/GET lỗi/hạn đã qua không nhắc gửi tiền mới. Link tới đúng phiếu để kiểm tra và thao tác |
| Hai Member / lịch sử hoặc trạng thái khác | Xem đúng ID đang chọn | Giữ nghĩa vụ trên phiếu, không biến số tiền thành bằng chứng đã hoàn cọc/chuyển bù. Legacy thiếu snapshot không dựng giá trị sách từ listing mới |

Phí giao nhận mỗi bên tự chịu theo từng chiều, tách khỏi khoản cọc+bù, không lấy phí
quote mua để cộng vào Exchange. Gói này không thêm dịch vụ tính cước hoặc thay quy
trình carrier. Lỗi đọc hiển thị rõ dữ liệu lần trước hoặc chưa xác định, có retry;
không thay lỗi thành zero. Thông tin mẫu trong runner/test chỉ là dữ liệu QA.

## Kiểm chứng trên source của gói

Windows, Node24.22.1/pnpm11.19.0, Chromium headless. API build tại base kế thừa gói1,
source API không đổi trong gói này; Mongo QA rs-test127.0.0.1:57017, fixture
`ops_browser_*_test`. Dữ liệu synthetic, ảnh/storage fake (Sharp thật), mail local,
ví simulator nạp qua TEST_OPERATOR độc lập; không ghi balance/capital trực tiếp.
Không dùng DB27017 hoặc gọi GHN/Brevo/Supabase/AI thật.28file UI/ảnh ngoài gói được
bảo toàn; browser/build là workspace kết hợp, không là clean checkout CI.

| Check | Trạng thái / evidence |
| --- | --- |
| Web unit | **297 PASS**,42file;18ca component/SSR mới và1ca mapper recipient mới; toàn bộ17ca Exchange service PASS |
| Web types / build | **PASS**; build còn advisory bundle >500kB, không nâng dependency/chỉnh threshold |
| Lint scoped | **PASS,0warning** trên các TS/TSX của gói |
| Browser API/Mongo thật | **7scenario PASS**, chi tiết dưới; assert tiền/key/body/1proposal/1journal giữ nguyên |
| UI responsive/keyboard anchor | **PASS**1440/768/390/320; hai vai trò; anchor focus đúng phiếu; không tràn ngang ở các width đã thử |
| Impeccable mechanical detector | **3advisory màu có sẵn**, exit0; đều ở NegotiationWorkspace và giá trị đã tồn tại tại base. Lượt scan trước bổ sung nút retry cuối; không có finding ở component/CSS mới tại lượt đó. Nút retry tái dùng style cũ, đã lint/browser; không quét lặp để tăng evidence, không gọi formal critique/human acceptance PASS |
| Docs/scoped diff/foreign checksum | **PASS**; whole-workspace diff-check vẫn có trailing whitespace AccountMenu ngoài gói, không sửa/stage |
| RN/Expo/native/Flutter/backend E2E/live provider/200%zoom/human/CI source mới | **NOT RUN** trong gói này; source các app/module đó không đổi, evidence cũ không được tính lại thành PASS mới |

Runner mới: `pnpm test:exchange-finance:browser`,
[source](../../scripts/test-exchange-finance.mjs). Cần API build, QA rs-test57017,
MONGO_TEST_URL kết thúc *_test, port3009/3010/5194 rảnh; không cần RN export. Runner
từ chối target DB khác, dùng shared fixture đã có, đóng browser/Vite/API và dọn
DB/user/role trong finally. Đọc [QA setup](../handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app)
trước chạy; không tự thêm full browser harness vào CI.

1. Giá trị public bị fault GET thành null: reference hiện thiếu dữ liệu, preview
   không giả0, gửi mới bị khóa; bấm nút tải lại giá trị sách khôi phục lựa chọn. Tạo proposal thật rồi
   mất ACK → Back/trở lại →429 → exact replay cùng key/body/header replay;1link
   Exchange/1proposal. Summary mở được ID ACK khi GET room cố ý cũ.
2. A giao100k/nhận150k → cọc150k, trả bù50k, funding200k; B cọc100k/funding100k,
   nhận bù50k nhưng không tự trừ vào cọc. Hai tài khoản đăng nhập thật và đọc cùng
   phiếu. Không còn tổng giá bán/quote mua trong Exchange.
3. Hai counter qua API thật thay sách của đúng responder, cuối A giao250k/nhận150k:
   B trở thành bên trả bù100k, A funding150k/B350k. Public GET listing gốc của room bị fault600k (đã assert
   request/cache thực nhận), summary vẫn đọc150k trên snapshot. Không sửa DB/listing
   chính hoặc giả đây là mutation giá đã được duyệt lại.
4. B accept thật, A bấm nộp trên web;1OrderPayment journal, summary không còn nhắc A
   nộp lần nữa. Không tiến hành ship/receive/settlement hoặc mở gate.
5. GET503 sau dữ liệu đã xác nhận: giữ facts, báo dữ liệu lần trước/retry. Tải lại
   phục hồi; ảnh và đo overflow1440/768/390/320. Đã thấy số tiền bị cắt chữ số tại320,
   sửa component CSS bằng container reflow và giữ chuỗi tiền cùng dòng, rồi chạy lại.
6. Room khác ngang giá150k/150k → bù0/hai cọc150k. Hủy bằng API, chọn lịch sử đúng ID;
   không nhắc thanh toán. Fault legacy GET thiếu agreement hiển thị thiếu snapshot,
   vẫn đọc đúng cọc đã lưu, không bịa giá sách.
7. Sau khi Exchange room ngang giá đã hủy, chuyển mode bằng command/proposal và
   đối tác chấp nhận thật; khung mua/quote giữ riêng ở Negotiation. Unit SSR kiểm
   thêm cả hai vai trò với agreedPrice90k+quote22k còn sót: Exchange không hiện
   chúng; Negotiation giữ tổng112k. Đây là projection fixture, không gọi quote thật.

Các lỗi harness trong quá trình dựng đã được sửa theo source: public listing có
query bundleSupport nên route fault phải khớp URL này; link nằm ở
conversation_exchange_links, không có trường conversationId trên Exchange. Giữ
assert read thực và đúng1link thay vì bỏ kiểm tra để PASS. Không sửa nghiệp vụ API.
Ảnh/log/JSON tại `.tmp/exchange-finance/` và `.tmp/exchange-finance-*.log`, không
phải artifact CI. Đối soát cuối0owned DB/user/role và0DB QA khác; mongo-test đã dừng,
port3009/3010/5194/57017 đã đóng. Mongo chính27017 healthy/running, không migrate/
reset/seed hoặc dừng.28file ngoài gói giữ nguyên checksum.

## Trạng thái tích hợp và bước sau

- Fetch đầu gói main48ab01fa/nhánh teammateab74bb53. Fetch cuối main đã nhận
  [PR88](https://github.com/huangg49/used-book-marketplace/pull/88) tại `7fe67113`.
  Đã đọc diff: có ExchangeOffer/NegotiationWorkspace, shipment fields và carrier/
  RN actions. Phần tài chính sai cũ vẫn có trên main tại diff đã xem. Không tự ghép
  vào workspace dirty hoặc suy PR merge là source kết hợp đã PASS.
- Main contract ghi0.70 trong khi local có0.71snapshot của gói1; khi tích hợp phải
  giữ union shipment fields + snapshot/contract generated, recovery/session và
  UI mới, cùng support/AI và28file local; giải quyết ADR0062 trùng local/main.
  Không ghi đè nhánh nhóm để giải conflict. Gói này chưa push/PR/merge/deploy.
- X04/X05 giao nhận từng chiều/expiry cần khảo sát lại trên source hợp nhất sau
  PR88 trước khi quyết định sửa. Chưa chứng minh đã được PR88 xử lý; không dùng
  tên commit “transit” hoặc checkpoint thay kiểm chứng. READINESS/ADR0057/GHN giữ
  nguyên, không có migration DB chính hoặc quyết định release mới.
- Bước tiếp nên là chuẩn bị tích hợp chuỗi local với main mới và kiểm giao điểm
  Exchange trên source kết hợp trước mở gói giao nhận khác. Cần quyền gói tích
  hợp/publish riêng; native và UX người thật vẫn cần evidence riêng, không suy
  từ kiểm thử tự động hoặc ảnh web này.
