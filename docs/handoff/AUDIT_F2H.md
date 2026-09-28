# Rà soát trước bàn giao F2h — vòng kỹ thuật đầu tiên

28/09/2026 · Nhánh `codex/f2h-handoff-audit` · OpenAPI 0.20.0 · 17 migration.
Phạm vi được duyệt: củng cố code hiện có, tài liệu tiếp nhận, UI rồi mốc Git;
không triển khai bước nhận hàng mới trong đợt này.

## Kết luận và giới hạn

Đã có nền backend có ranh giới service, command/replay, transaction, constraints
và negative/race tests. Tuy nhiên chưa thể coi workspace hiện tại là gói bàn giao
hoàn chỉnh: phần lớn baseline chưa commit, chưa kiểm chứng checkout sạch, còn UI/native
acceptance và review độc lập. Đây là rà soát theo rủi ro, không là chứng nhận bảo mật,
không khẳng định đã đọc/kiểm chứng mọi nhánh của mọi dòng code.

[START_HERE](START_HERE.md) là điểm bắt đầu cho người tiếp nhận;
[READINESS](READINESS.md) là danh sách gate cần tiếp tục.

## Phạm vi đã đối chiếu

| Khu vực | Mã/tài liệu đã đọc và điều đã kiểm tra | Bằng chứng/giới hạn |
|---|---|---|
| Contract/controller | AST decorator trong 14 controller so với OpenAPI | 72 method/path khớp, không thiếu/thừa/trùng; không thay test permission/behavior |
| Auth | Global guards, method-only ExistingObligation, auth service, limiter, ADR 0003/0019 | User→session locks, revoke/refresh, LOCKED deny-by-default; auth/obligation suites |
| Session client | Shared transport/storage queue/revision, RN SecureStore/web memory, operations cache | Phát hiện và sửa ba vấn đề bên dưới; 20 tests sau sửa |
| Command/replay | CommandService, ContractInput, PageService và mutation callers | Auth trước receipt, key/body hash, advisory lock, transaction/audit/outbox; negative/replay/race suites |
| Catalog/listing/public | Listing lifecycle/commitment policy, public eligibility/projection, media pipeline, các controller | Approved edit/review, không public địa chỉ, pin revision/media; API và browser regression |
| Địa chỉ/báo giá | AddressesService, fulfillment, QuotesService, quote-money và tài liệu F0 | Version/snapshot, demo locality, quote không giữ sách; address/quote/migration suites |
| Tiền/reservation | LedgerService, ReservationsService, Order create/pay/refund/accept | Ledger bất biến, hold P+S, release sau refund; wallet/payment/raw SQL/race suites |
| Fulfillment | Order aggregate locks, shipment simulator, packaging service, expiry worker | Label không custody, auth sau storage I/O, review giữ tiền/sách; preparation/packaging/pickup/overdue suites |
| RN/operations | Routes/features/session owner, intent runners, errors, Screen/Sheet, browser runners | Không thêm token store; retry cùng key/body; visual và native vẫn cần vòng riêng |
| Setup/CI/tài liệu | setup-local, Docker/CI, README, RN start, AGENTS, transaction plan | Bổ sung DB QA riêng, sửa nội dung lỗi thời; chưa chứng minh clone sạch |

Không thay đổi SQL, Prisma schema, API contract hay quy tắc chuyển trạng thái trong
vòng này. Các trigger được kiểm chứng bằng migration/negative/race suite hiện có,
không tuyên bố mọi trigger đã được một reviewer thứ hai đọc lại độc lập.

## Phát hiện và xử lý

| ID | Mức | Phát hiện có thể tái hiện | Xử lý |
|---|---|---|---|
| HA-01 | P1 | Login A chờ ghi storage; login B bắt đầu; ghi A lỗi. Catch của A gọi discard và xóa phiên/token B | Guard revision ở thời điểm xử lý lỗi, bỏ qua queued write lỗi thời; vẫn revoke token A. Regression dùng promise barrier, fail trước fix/pass sau |
| HA-02 | P2 | Gọi login trong lúc logout đang chờ revoke có thể cấp phiên mới rồi bị logout xóa | Login từ chối với SIGNING_OUT trong thời gian revoke; test chứng minh không gửi thêm request login và storage rỗng sau logout |
| HA-03 | P2 | Spread `RequestInit.headers` làm mất Headers/tuples; object có `content-type` chữ thường tạo giá trị Content-Type ghép sai | Chuẩn hóa bằng Headers, session sở hữu bearer; 3 representation tests kiểm bytes/content-type/key/ticket cả trước và sau refresh |
| HA-04 | P2 | README/RN start còn ghi shipment hoặc funding chưa triển khai; sơ đồ gợi ý worker chạy BullMQ | Sửa mô tả hiện hành, liên kết status matrix F2h; giữ báo cáo/snapshot lịch sử |
| HA-05 | P2 | Hướng dẫn test cũ giả định port 5432 và dùng chung server DB app; môi trường người trước còn helper `.tmp` | Compose QA project/volume riêng, loopback 55434; hướng dẫn migration/test khôi phục env trong finally |
| HA-06 | P2 | Browser test bấm Escape ngay khi nút Đóng vừa được vẽ, trước effect RN Web kích hoạt modal | Đợi accessible `role=dialog` trước thao tác bàn phím; giữ assertion Escape đóng. Không thêm sleep hoặc bỏ kiểm tra |
| HA-07 | Gate | Baseline gồm nhiều file untracked và thay đổi chưa commit từ các increment trước | Ghi rõ chưa có snapshot bàn giao; kiểm bộ file/commit/tag/clone nằm ở gate cuối, không stage tất cả mù quáng |
| HA-08 | P1 (QA/CI) | Test upgrade Order dùng `to_regclass('direct_orders')` theo search_path, nhìn thấy bảng ở public thay vì schema fixture. DB test đã deploy đủ migration thất bại dù upgrade fixture rollback đúng | Truy vấn tên schema cụ thể bằng parameter. Tái hiện 479/480 trên DB mới; focused regression sau fix PASS. Không sửa migration để làm test qua |

HA-01–03: thêm 5 test, chạy trên code cũ **5 fail/15 pass**, sau fix **20/20 pass**.
Không đổi tuổi thọ token hoặc contract server. Package dùng chung nên đã build/typecheck
và kiểm tra cả hai client tiêu thụ nó.

HA-06: kiểm tra RN Web `ModalContent` trong dependency hiện cài cho thấy role dialog
và xử lý Escape chỉ hoạt động khi modal active. Lượt đầu timeout; sau khi đợi role
dialog thì toàn bộ RN browser journey qua. Đây là sửa đồng bộ test, không tuyên bố
đã sửa lỗi Modal native hoặc hoàn tất polish.

## Bằng chứng thực thi vòng này

| Kiểm tra | Kết quả |
|---|---|
| `pnpm contract:check` | PASS; generated types khớp YAML |
| `pnpm contract:routes` | PASS; 72 operation/14 controller; đã thêm vào API CI |
| `pnpm lint`, `pnpm typecheck` | PASS toàn workspace có script |
| `pnpm test` | PASS 127 tests: API 33, session 20, RN 61, operations 13 |
| API E2E trên DB test trước đó | PASS 480 tests/22 files; không tính là máy sạch |
| DB QA mới | Compose healthy, đủ 17 migration deploy từ DB rỗng; không mount volume app |
| API E2E trên DB QA mới | PASS cuối 480/480, 22 files, 428.11s; lượt đầu 479/480 tìm được HA-08, sửa focused test rồi chạy lại toàn bộ |
| API/operations build | PASS Prisma generate + Nest build; TypeScript + Vite build |
| RN web export | PASS; URL chỉ dùng fixture port 3009; không sửa `.env` RN |
| Operations browser | PASS queue/detail/decision/reason/checklist/leave guard, private ảnh, conflict/replay, responsive/large text, quyền/session |
| RN browser | PASS shelf/detail/filter/pagination/images/recovery; address CRUD/default/conflict/replay; listing upload/Sharp/submit/reject/resubmit/approve/lifecycle |
| `doctor:local` | PASS cấu hình/DB/17 checksum/live private bucket/readiness; WARN RN localhost cần emulator mapping/LAN |
| Liên kết/hygiene ban đầu | 192 local file links trong nhóm tài liệu rà soát tồn tại; danh sách file Git candidate không chứa `.env` ngoài example, `.tmp`, dist hay Prisma sinh ra. Chưa thay kiểm nội dung secrets/asset/commit cuối |
| Native Android/iOS trong vòng này | Debug Android x86_64 build qua sau thay icon/splash; Metro bị automatic approval review chặn, chưa runtime QA mới; iOS chưa kiểm |
| Checkout sạch | PASS nguồn `beea372`: install pnpm 11.19.0, env mới, DB mới/17 migration/seed, 127 unit, 480 API E2E, API/operations build, RN export và hai browser suites. Hồ sơ cuối ở [REBUILD](REBUILD.md) |

Browser fixtures dùng Nest/PostgreSQL/Sharp thật và **storage fake**. Live bucket
check ở doctor là đọc cấu hình/quyền bucket, không phải lần upload Supabase mới.
Các 500/503 do failpoint rollback/availability trong API E2E là hành vi suite đang
kiểm tra; kết luận dựa vào exit code và assertions, không chỉ log có chữ ERROR.

Log cục bộ (ignored, không phải dependency bàn giao): `.tmp/handoff-session-before.log`,
`.tmp/handoff-api-e2e.log`, `.tmp/handoff-fresh-db-e2e.log`, `.tmp/handoff-fresh-db-e2e-final.log`,
`.tmp/handoff-operations-browser.log`, `.tmp/handoff-rn-export.log`,
`.tmp/handoff-rn-browser.log`. Screenshot browser hiện ở `apps/*/test-results/`.
Thư mục evidence có thể chứa ảnh `failure` của lượt cũ; không suy kết quả hiện hành
chỉ từ sự tồn tại của file. Lệnh tái tạo nằm trong START_HERE và CI.

## Những việc còn mở, không được che bằng số test

1. Tiếp tục từ [UI baseline đã xem](UI_BASELINE.md), rà visual và polish các màn hiện có theo UI rules; native picker/upload, bàn phím,
   Back/TalkBack và chữ lớn còn là gate riêng. RN browser pass không là native pass.
2. Mốc nguồn đã được commit và clone kiểm chứng; xem [REBUILD](REBUILD.md) và
   [FILE_REVIEW](FILE_REVIEW.md). Người nhận vẫn cần dựng trên máy riêng và cấu hình
   storage thật; bản kiểm thử không mang theo credentials hoặc database cũ.
3. Reviewer độc lập cho SQL/money/permissions theo TEAMWORK; đây là kết quả tự kiểm.
4. Limiter hiện tính cả login thành công, 5/account/IP/15 phút theo ADR 0003; có thể
   ảnh hưởng demo chung mạng. Không đổi chính sách ngầm trong đợt polish.
5. Test fixture hiện phát cảnh báo pg về query đồng thời trên một client; Expo export
   có thông báo force exit sau khi export xong. Các lệnh trả 0 nhưng cần theo dõi khi
   nâng dependency, không tuyên bố toolchain không còn cảnh báo.
6. Nghiệp vụ chưa triển khai giữ nguyên: Delivered/Inspection/claim resolution/returns/
   settlement, checkout/ví/Order UI, Exchange/ViaPoint/auction. Xem plan sau bàn giao.
