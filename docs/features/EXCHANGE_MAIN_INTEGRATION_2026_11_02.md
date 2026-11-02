# Ghép chuỗi local với main — Exchange/Support/AI — 02/11/2026

Owner duyệt tích hợp sau [gói tài chính](EXCHANGE_FINANCE_2026_11_02.md). Branch
`codex/integrate-exchange-main`, parent local `f3291409`, parent main
`add4d6151f217b4cc7c9e4dfb92136e22af68211`; subject
`merge: integrate main support and AI hardening with Exchange recovery`.
Tại mốc kiểm source: merge local. Owner sau đó duyệt push branch/tạo PR và kiểm
CI; chưa cho merge main/deploy. Trạng thái CI cuối ghi tại PR đúng head, không
suy từ kiểm local dưới đây. Không đổi quyền release,
không migrate/bootstrap/seed DB chính hoặc gọi provider ngoài phạm vi.

## Bảo toàn và phạm vi

Checkout gốc ở `C:/Users/DESKTOP/Documents/WDP391/used-book-marketplace` giữ nguyên
branch `codex/exchange-financial-summary`/`f3291409` và28file UI/ảnh dirty/untracked.
Đã ghi/đối soát SHA256, không stash/reset/clean hoặc stage chúng. Vì router và
NotificationBell có overlap main, tạo worktree riêng bằng công cụ Codex tại
`C:/Users/DESKTOP/.codex/worktrees/integrate-exchange-main/used-book-marketplace`.
Worktree mới xuất phát sạch; pnpm frozen/offline install riêng, không copy .env,
secret hoặc node_modules từ máy gốc. Các checks của gói này chạy trên source đã
merge trong worktree, không trộn28file ngoài gói. Worktree giữ lại để tiếp tục.

Fetch lúc bắt đầu có [PR88](https://github.com/huangg49/used-book-marketplace/pull/88)
giao diện/transit và [PR87](https://github.com/huangg49/used-book-marketplace/pull/87)
AI review hardening, cùng [PR86](https://github.com/huangg49/used-book-marketplace/pull/86)
Support. Giữ cả tính năng incoming và chuỗi local snapshot/accept revalidation,
BookCounter, exact recovery, financial summary, Buyer gate và Seller RN đã commit.
Không dùng chọn toàn bộ ours/theirs để bỏ nhánh kia. Chuẩn hóa whitespace của ba
phiên bản UI trước giải conflict để phân biệt thay đổi nghiệp vụ với formatter.

## Các giao điểm đã xử lý

| Giao điểm | Kết quả |
| --- | --- |
| Contract/API | OpenAPI0.72.0,234operations khớp37controllers; generated types được tạo lại. Giữ Support/AI v2, carrier events và snapshot/private Exchange photos, không chỉ tăng version |
| Shared session | Export Support cùng exchange agreement/commands, không bỏ một nhánh; session/token semantics giữ nguyên |
| Member web | Giữ preference matching/BrandIcon/fallback cover từ main, SupportLink, dispute form và snapshot/counter/recovery/summary local. Summary và phiếu cùng cache/identity, route support giữ từ main |
| RN Exchange | Giữ form dispute/UI mới của nhóm; command vẫn qua shared schema/store, unknown/ACK khóa lệnh và panel đúng trạng thái. Khôi phục Proposed/lastProposedBy logic và chọn sách thay thế, không gọi free-money counter cũ; đổi account bỏ late continuation |
| Hạn kiểm tra | Giữ hai hạn72giờ và cọc không giải phóng sớm theo ADR0050. Loại câu incoming “48h”, “tất toán sớm/giải phóng ngay” trên web, giữ hai deadline riêng.4SSR regression mới kiểm đúng nội dung và khoản funding |
| Gate/worker | Buyer DirectDelivery completion vẫn chặn theo quyết định local, AI recheck hooks từ main vẫn có. Không đóng READINESS hoặc coi UI/durable report là custody/settlement acceptance |
| GHN | API carrier byte-identical main, handler GHN RN giống main sau bỏ whitespace. Không sửa/config/call provider. Tích hợp source đã lên main không phải nghiệm thu carrier thật |

### Migration và ADR

Main đã có `0052-listing-auto-review-v2`; Exchange local chưa publish/áp dụng DB
chính chuyển sang [0053-exchange-agreement](../../apps/api/src/database/mongo/migrations/0053-exchange-agreement.ts).
Main migrations67file (không tính index registry) giữ nguyên từng byte, checksum
0050Support/AI giữ nguyên; không sửa migration đã áp dụng để xử lý conflict.
Registry67migration/67ID duy nhất, cuối0052AI→0053Exchange.

Kiểm nâng cấp ban đầu FAIL7ca:0053 snapshot thừa kế spec lịch sử gồm notifications,
áp lại sau Support làm mất SupportUpdated/ReviewModerated và target mới. Đã giới
hạn **0053 chỉ collection exchanges**, không động thông báo/audit/receipt. Các
upgrade từ auto-first/support-first/both-reversed cùng schema union và legacy
Exchange sau sửa32/32PASS. Không sửa assertion/validator chuẩn để né lỗi.

Trùng số ADR được xử lý bằng đổi **hai ADR local chưa publish**, giữ bản trên main:

- Buyer gate cũ0062 → [ADR0064](../adr/0064-direct-delivery-completion-release-gate.md).
- Exchange snapshot cũ0063 → [ADR0065](../adr/0065-exchange-agreement-snapshots.md).
- Support0062 và AI hardening0063 main giữ nguyên. Cập nhật đường dẫn nội bộ;
  báo cáo cũ có thể còn số tại thời điểm ghi, mapping này là số hiện hành. Nội dung
  quyết định/gate không đổi. Snapshot migration cũ0052 trong báo cáo trước nay là0053.

### CI API / test AI có tính ngẫu nhiên

GitHub API xác nhận CI main đúng SHA add4d615:8jobPASS,1jobAPI FAIL tại
[API run/job](https://github.com/huangg49/used-book-marketplace/actions/runs/41396480445/job/125118793486).
API lint/types/unit/Mongo trên job đó PASS; E2E FAIL ở ca
`sweeps due approvals, records a pass, and skips what changed`; các bước sau bị skip.
Không gọi main CI xanh hoặc CI của source kết hợp PASS.

Local tái hiện cùng lỗi: test lấy checks.at(-1), nhưng HumanAudit lấy mẫu UUID có
thể cùng tồn tại với AiRecheck và cùng timestamp; bản cuối không chứng minh loại.
[Test](../../apps/api/test/listing-auto-review.e2e-spec.ts) nay buộc audit rate1
trong đúng ca đó, chọn AiRecheck và yêu cầu đúng1bản ghi, Passed/Skipped cùng lý
do nguyên vẹn. Không tắt audit/worker hoặc nới assertion. Ca tập trung1PASS/30SKIP,
sau đó full file31PASS. AI fake trong test, không là chất lượng mô hình thật.

### PR89 / kiểm tra CI source kết hợp

[PR89](https://github.com/huangg49/used-book-marketplace/pull/89) đã mở, chưa merge,
không auto-merge. Lượt đầu tại `6fed6f1d`:9jobPASS, API và User Web FAIL.
API dừng ở test nâng cấp tài khoản: suffix thiếu0053Exchange nên baseline lịch sử
bị cộng nhầm migration mới. Bổ sung0053 vào danh sách nâng cấp, giữ baseline59 và
đối chiếu toàn bộ ID/checksum với fixture main `be581aec`; không sửa migration cũ.
Local chạy lại member-account/Support union/Exchange upgrade:3file,5caPASS trên
rs-test57017/*_test, gồm giữ users/sessions/ledger/checksum và quyền tối thiểu.

User Web dừng ở browser chat đơn hàng: fixture thiếu deliveredAt/inspectionDeadline,
carrierReview/deliveryReview và preparation.pickupReview bắt buộc nullable trong
contract hiện hành. Bổ sung null đúng trạng thái trước giao hàng; browser PASS,
giữ assertion private403, vai trò, exact key/body, chống gửi trùng và mobile320/390.
Kiểm thêm browser Exchange phát hiện selector cũ còn chờ form chọn sách sau mất ACK.
UI phục hồi thay form đó; test nay kiểm form không còn chỉnh được, sách trong body
gốc đúng lựa chọn và hai lần gửi vẫn cùng key/body/một proposal. Không nới quy tắc
tiền/quyền/idempotency để lấy CI xanh.

Browser Exchange còn bắt lỗi thật ở bảng tài chính: query lỗi403 vẫn vẽ số tiền
từ cache cùng cảnh báo dữ liệu cũ. Nay401/403/404 ẩn toàn bộ hàng tiền; lỗi503
vẫn giữ dữ liệu cũ có nhãn và retry, đồng thời kiểm viewer identity.5ca unit mới
(full file23PASS), types/lint scopedPASS, detector0findings. Browser API/Mongo
thật create/accept/cancel, lostACK và permission PASS; kiểm503giữ/403ẩn/retry sau
khôi phục, desktop và320px/130% không tràn. Ảnh `exchange-denied-*` trong
`apps/user-web/test-results/exchange/` đã xem; không thay brand/motion. Không là
native/human acceptance hoặc full design critique. Kết quả head mới theo PR89.

Lượt CI `269fcd7f`:9jobPASS, API/User Web đi xa hơn nhưng còn2test lỗi.
API unit382PASS/1SKIP (shutdown Windows không chạy trên Ubuntu), Mongo62PASS;
E2E885PASS/1FAIL/4SKIP (4live AI chủ ý opt-in, không gọi provider trên CI).
Lỗi còn lại cũng từ HumanAudit ngẫu nhiên: private listing có cả HumanAudit và
AiRecheck trong khi test đếm tổng là1. Test nay buộc audit rate1, yêu cầu đủ2loại
và giữ đúng lý do flag; ca revoke chạy cả rate0/rate1 để kiểm StaffOverride mới
và xác nhận HumanAudit hiện có, không phụ thuộc UUID. Không đổi sampling sản phẩm.
Full file AI sau sửa32/32PASS trên QA riêng, provider fake.

User Web đã PASS Exchange nhưng Wallet FAIL ở label retry phân trang. Log cho
thấy503 đã hiện cảnh báo, sau đó refetch trang đầu thành công đổi nút từ
“Thử tải thêm” về “Xem thêm” trong khi cursor và dòng đã tải không đổi. Test chủ
động tái hiện refetch ở điểm đó, yêu cầu retry cùng cursor gốc, giữ dòng đầu,
đọc đủ2dòng ledger thật và đối chiếu balanceAfter. Không tăng timeout hoặc đổi
Wallet UI/API để khớp test. Full browser Wallet sau sửa PASS, gồm provider mô
phỏng, deadline/cancel/lostACK và balance/history; không là thanh toán VNPay thật.

CI `9e933bb9`:User Web PASS (gồm Exchange và Wallet đã sửa); Operations lần này
FAIL ở `test:rn-buy-now:browser`, hai lượt trước PASS. Ảnh lỗi GitHub cho thấy trang
sách có nút mua nhưng không còn modal; helper đổi history rồi bấm trước khi React
render identity sách đích, nên có thể bấm nút của trang cũ. Helper nay chờ đúng mã
`#TIN-<listingId>` trên UI trước thao tác, không tăng timeout/thay logic mua.
Local chạy lại full RN Expo web buy-now/Seller F2h PASS: quote Changed/expiry,
exact create/pay/cancel qua Back/lateACK, ảnh đóng gói/vận đơn lostACK, pickup
độc lập tới InTransit và giữ tiền, quá hạn bỏ thao tác cũ. API/Mongo thật trên QA,
storage/ảnh/funding mô phỏng; không là native hoặc giao nhận/provider thật.

## Gia cố browser runner sau merge PR89

Owner đã merge PR89 thành main `dd7304de5c7cf96e2d7faf51e42fbe73dcac0628`.
[Operations CI đúng SHA](https://github.com/huangg49/used-book-marketplace/actions/runs/41406972829/job/125151105877)
FAIL ở helper openBook chờ “Xác nhận đặt mua” sau khi chuyển sang bản sách thứ ba;
10job còn lại PASS. Ảnh artifact cho thấy trang đích có nút Mua ngay, không có
modal. Hai lượt full local trước sửa (thường và CPU trang Buyer Chromium chậm6lần) đều PASS;
**chưa tái hiện được timeout gốc hoặc chứng minh nguyên nhân duy nhất**.

Gói owner duyệt tiếp theo ở `codex/fix-rn-buy-now-navigation`, base local
`d95161f7` (giữ nguyên gói evidence chưa push). Subject
`test(rn): use shelf navigation for buy-now regression`. Chỉ sửa
[browser runner](../../scripts/test-rn-buy-now.mjs), không đổi app/API, dependency,
contract hoặc migration:

- Bỏ tự `history.pushState({})` rồi phát `popstate`. Expo Router57.0.22 hiện dùng
  ID trong history để ánh xạ state; entry không có ID có thể đi qua resetRoot,
  nên URL/mã sách xuất hiện chưa đủ chứng minh navigation đã ổn định. Đây là điểm
  yếu xác nhận từ helper/SDK, không tự chứng minh là nguyên nhân duy nhất của CI.
- Dùng entry thật: về màn trước nếu đang ở sách → tab Trang chủ → thẻ sách →
  kiểm URL/ID sách đích → Mua ngay. Đưa page ra foreground khi chuyển từ page Seller.
  Ba bản sách QA có cùng đầu sách nhưng giá khác nhau qua revision/duyệt thật,
  chọn thẻ bằng accessible label chính xác, không dùng thứ tự hoặc nút đầu tiên.
- Navigation thật giữ màn Orders ở nền: lượt đầu phát hiện selector text trùng
  giữa màn ẩn/hiện. Nay helper chỉ chọn thẻ đơn đang hiển thị theo đúng ID, mở nút
  trong thẻ đó và chờ heading chi tiết đúng đơn. Không đổi assertion hoặc API.
- Khi lỗi, artifact thêm pathname, ID sách QA đang mở, số nút và số pageErrors;
  không lưu token/body/email/response. Screenshot vẫn nằm trong artifact CI cũ.
- Giữ nguyên timeout15s và mọi assertion quote Changed/expiry, key/body/version,
  lostACK/Back/lateACK, ledger/hold, pickup độc lập, stale action và không settlement.

Kết quả local sau sửa: full runner thường PASS và full runner với CPU trang Buyer
Chromium chậm6lần PASS, đều0pageErrors. HTTP/Nest/Mongo thật trên rs-test57017, database ngẫu nhiên `*_test`;
ảnh/storage/funding simulator. API/RN artifact từ `d95161f7`, RN Expo web390px,
Seller320px. Log ở `.tmp/integration/rn-checkout-*` và ảnh trong
`apps/mobile-react-native/test-results/buy-now/`. Browser không thay native/human.
Remote CI của sửa đổi này **NOT RUN**: chưa push/PR/merge. Main cũ vẫn Operations
FAIL; cần kiểm lại đúng SHA mới sau khi gói được phép đẩy lên, không gọi CI đã xanh.

## Bằng chứng local

Windows, Node24.22.1/pnpm11.19.0, pnpm install --offline --frozen-lockfile
--ignore-scripts (không thay lockfile). Nest/Mongo HTTP thật, rs-test127.0.0.1:57017,
chỉ *_test; browser Chromium headless, web1440/768/390/320 và RN Expo web390.
Ảnh synthetic/storage fake, mail local, ví simulator qua TEST_OPERATOR. Test AI
provider fake, cờ sản phẩm mặc định false; không chạy live model/quảng cáo chất
lượng mới. Native/ARM/iOS/TalkBack và human acceptance không suy từ Expo web.

| Check | Kết quả và giới hạn |
| --- | --- |
| Unit | API383, shared142, Member web303, RN223, Admin228 **PASS** (1279tổng); web có4ca inspection semantics mới |
| Types/build | API/RN/web/Admin types PASS; API/web build PASS; Expo web32route/exit0, có thông báo CLI force-exit sau export. Advisory web bundle >500kB giữ nguyên |
| Lint | RN scoped PASS0warning; web scoped2warning effect địa chỉ có sẵn, API có warnings unused cũ. Không sửa migration cũ để làm lint sạch |
| Mongo upgrade/schema | **32PASS** sau sửa0053; kiểm giữ checksum/data/ledger từ các nhánh Support/AI, snapshotlegacy và schema hiện hành |
| API E2E liên quan |156ca riêng biệt có PASS: lượt đầu3fileExchange54+conversation9+wallet48PASS/2fileFAIL; sau sửa migration Support14+AI31PASS, sau sửa isolation AI31PASS lại. Không gọi đây là một lượt full156PASS; full E2E toàn repo NOT RUN |
| Browser agreement |3scenarioPASS: snapshot/stale accept không reserve, webcounter đảo payer, RNcounter+ảnh participant khi public bịẩn |
| Browser recovery |5scenarioPASS: funding/create lostACK+Back+429, exact replay1journal/1proposal, ACK+GETlỗi/cũ, đổi identity/lateACK/revoked replay401. Sau điều chỉnh chỉ hiển thị lỗi hiện hành khi có recovery, chạy lại5PASS |
| Browser financial summary |7scenarioPASS: hai vai trò/counter đổi bênbù, snapshot/publicchanged, funding1journal, missingprice/retry/lostACK, lịch sử/legacy, mode mua riêng và320–1440px |
| Browser Support/Review |6scenarioPASS,0pageErrors: membercreate/lostACK/Back, Admin assignment/private notes/evidence/answer/close, notification/deep-link; report/review moderation và picker keyboard/320px/130% |
| Contract/routes/docs/diff |PASS0.72/234/37; generated current, docs filelinks và diff-check. Không xác nhận links ngoài/claim nghiệp vụ chỉ vì docscheckPASS |
| UI mechanical detector |52advisory (47color/5radius) trong CSSActionCard cũ/Compose; toàn bộ giá trị đã có ở một parent. Không là critique/human/nativePASS |
| Không chạy |Live GHN/storage/mail/AI, native/Flutter, failover mới, full E2E toàn repo và CI source kết hợp. Readiness giữ nguyên |

Artifacts local tại `.tmp/integration/`, `.tmp/exchange-{agreement,recovery,finance}/`
và `.tmp/support-evidence/`. Không commit token, body hoặc cấu hình riêng.
Schema suite/runner dùng DB riêng; E2E global setup có reset chỉ DB QA xác định,
không dùng DB/bucket local chính.

## Còn mở / hành động kế tiếp

- Owner đã duyệt push nhánh/tạo PR và kiểm CI cho gói này. Chưa có quyền merge
  main/deploy, không áp dụng migration0053 hoặc0050–0052 trên DB chính, không đổi
  cờ AI/gate. Kết quả remote phải lấy từ đúng head PR; CI mainFAIL trên test đã
  sửa vẫn là trạng thái thật của SHA main cũ.
- Source main có form dispute ảnh/video mẫu và tên file ghép trong reason. Giữ
  source để không xóa việc nhóm; **chưa có evidence upload/custody/provider thật**,
  không diễn giải tênfile/preview thành bằng chứng tranh chấp được lưu/xác thực.
- X04/X05 giao nhận từng chiều/expiry chưa khảo sát lại đầy đủ trên source kết hợp;
  không suy PR88 đã sửa hoặc cho phép mở Delivered/settlement/GHN. Đây là gói tích
  hợp và kiểm giao điểm, không quyết định release hoặc full Exchange acceptance.
-28file chưa commit vẫn thuộc checkout gốc, chưa ghép vào branch này. Trước tích
  hợp công việc UI đó phải xác định phạm vi/owner, không chép đè router/notification
  mới từ main. Worktree này là điểm tiếp tục sạch cho chuỗi đã commit.
