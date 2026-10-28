# Đánh giá giao dịch và uy tín — 28/10/2026

Gói nền0.57 owner duyệt thay thế Forum, commit `0c9ce87`, triển khai local trên
`codex/transaction-reviews-reputation`, base `4f09c17`. Commit subject:
`feat(reviews): complete transaction reviews and member reputation`.
Theo [ADR0052](../adr/0052-transaction-reviews-and-reputation.md),
FR-R01–R05/FR-A08, AC-42–AC-43. Đây là evidence kỹ thuật, chưa là ký nghiệm thu
người thật hoặc bản đã tích hợp lên main. Flutter vẫn scaffold.

## Bổ sung minh bạch điểm0.58 — 28/10/2026

Nhánh `codex/reputation-rating-transparency`, base `0c9ce87`; commit subject
`fix(reputation): show sample counts for each rating`. Owner duyệt hiển thị số
mẫu riêng, làm rõ nhãn/công thức/empty; giữ nghiệp vụ và các gate hiện tại.

- Contract0.58, vẫn191operations/29controllers. Thêm `partnerRatingCount` và
  `bookRatingCount`; aggregate tính số mẫu ngay cùng `$group` đang tính mean,
  cùng predicate public/hidden/deleted và snapshot. Không thêm query đếm rời,
  counter tích lũy, migration hoặc thay trọng số. `reviewCount` giữ nguyên.
- Web/RN hiển thị từng số mẫu sát điểm, “Chất lượng sách đã cung cấp”, giải
  thích trung bình cộng và phân biệt chất lượng bản sách với nội dung tác phẩm.
  Count0/mean null hiển thị “Chưa có điểm”, không biến thành0/5. Điểm đối tác và
  điểm sách có thể có mẫu khác nhau; số giao dịch hoàn tất không thay số mẫu.
- PASS: API unit225 (vẫn loại riêng4 ca carrier-adapter gọi GHN), review HTTP/
  Mongo9 với assertions mới cho3mẫu đối tác/1mẫu sách, seller-only null, pending,
  tombstone, hide/restore và limit1 vẫn trả tổng mẫu toàn tập. Session29,
  User-web251/RN161 unit; API/web/RN lint/typecheck, Admin typecheck, API/web build,
  RN web export và contract/generated/routes PASS. API/web còn warnings cũ/chunk.
- Browser real API/Mongo QA + storage fake PASS: số mẫu2/1 cạnh từng điểm,
  hồ sơ trống0/null trên web/RN, hide làm mẫu sách về0 mà vẫn giữ mẫu đối tác,
  các regression gửi/sửa/xóa/replay/history trước đó. Web1440/768/390/320,
  RN web390/320 và chữ130% đã xem; detector một lần0findings. Browser không
  là native/human acceptance. Flutter không đổi; không chạm GHN/DB chính.
- Không chạy lại Mongo schema/import/failover hoặc54ca Exchange/obligations
  vì không đổi validator/migration/auth/command/settlement. Bằng chứng gói nền
  bên dưới được giữ đúng source, không cộng thành kết quả mới của các gate đó.
- Quy tắc vận hành cần nhóm chốt ở [ADR0052](../adr/0052-transaction-reviews-and-reputation.md#quy-tắc-vận-hành-cần-chốt-trước-dùng-thực-tế).
  Điểm thấp tự nó không là vi phạm; không tuyên bố đã có appeal/chống thông đồng.
  Khi tích hợp cần API0.58 trước hoặc cùng client mới; không fallback mẫu sách
  sang tổng reviewCount. Không có migration bổ sung trong gói này.

Ảnh QA0.58: [desktop](../ui/evidence/transaction-reviews/reputation-desktop.png),
[web390](../ui/evidence/transaction-reviews/public-profile.png),
[empty](../ui/evidence/transaction-reviews/reputation-empty.png),
[RN web chữ130%](../ui/evidence/transaction-reviews/reputation-rn-large-320.png).
QA đã dừng sau kiểm, Mongo chính vẫn dừng; chỉ commit local, chưa push/PR/merge.

## Gói nền0.57 tại0c9ce87

## Phần đã nối

| Yêu cầu | Source/luồng đã có | Bằng chứng và giới hạn |
| --- | --- | --- |
| FR-R01/02 | API `modules/reviews/`: ba loại giao dịch Completed, một review/participant, đúng vai trò chấm điểm | HTTP/Mongo kiểm sai người, chưa hoàn tất, hết hạn, tạo trùng, Seller không chấm sách; Completed là fixture QA, không là chứng minh fulfillment |
| FR-R03 | `review-policy.ts`, projection và aggregation dùng cùng quy tắc deadline48h/168h; worker recheck dưới khóa | Pure boundary, hai bên gửi vẫn chưa lộ, review cuối hạn đủ48h, public reads không chờ worker; worker song song/retry |
| FR-R04 | Sửa/xóa/reply, tombstone, legacy disclosure lock, evidence hold, append-only revision | Version race200/409, không tạo lại sau xóa, không reset hạn; target-only pending reply, reply cần Staff/Admin duyệt |
| FR-R05 | Operations queue, hide/restore/reply/evidence decisions với reason/version/key | Role/independence/revoked-session trước replay; hide loại khỏi aggregate; lịch sử20/batch và cursor không dùng chéo actor/review |
| FR-A08 | Public reputation: completed count, book/partner means, verified violations riêng | Review hợp lệ công khai mới được tính; chưa có điểm trả null; không suy violation từ claim đang mở hoặc bịa trust badge |
| Web | `/reviews`, `/members/:id`, Exchange review panel, seller profile link và account navigation | Chọn từng giao dịch, loading/empty/error/retry; mất ACK giữ cùng key/body; lỗi xác định giữ draft; xóa/kiểm public thật |
| React Native | `/reviews`, `/reputation`, entry account; dùng core UI/session chung | RN web gửi và mở profile qua API thật,320px/CSS chữ130%; chưa là kiểm native/TalkBack |
| Staff/Admin | `/transaction-reviews`, navigation/command, quyết định có lý do, history/reply | Browser Staff độc lập hide/restore và xem lịch sử nhiều trang; API kiểm Admin role; dùng lại workspace/session |

Contract **0.57.0**, **191operations/29controllers**; generated types đồng bộ.
Mã backend ở `apps/api/src/modules/reviews/`, migration ở
`apps/api/src/database/mongo/migrations/0040-transaction-review-lifecycle.ts`.
UI ở `src/features/reviews/` của cả ba app, public web ở
`apps/user-web/src/pages/MemberReputationPage.tsx`.
`packages/session-client/src/reviews.ts` giữ schema/intent dùng chung, không
thêm token store hay lưu token browser xuống disk.

## Kiểm chứng thực chạy

Windows x64, Node24.22.1, pnpm11.19.0, Chromium qua Playwright. HTTP dùng API Nest
và replica set QA57017, app user quyền tối thiểu, database riêng `*_test`.
Storage fixture giả; các transaction Completed được tạo có chủ đích trong QA.
Không gọi GHN, không chạy worker/migrate/seed hoặc reset Mongo chính.

| Kiểm tra | Kết quả |
| --- | --- |
| Contract generated + routes | PASS0.57/191/29 |
| API unit | PASS225; loại riêng `test/carrier-adapter.spec.ts` có4 ca gọi GHN, không gọi toàn bộ API unit là đã chạy |
| Mongo suite | PASS49, SKIP6: PostgreSQL import thiếu `TEST_DATABASE_URL`, election thiếu replica set3node/`MONGO_FAILOVER_URL` |
| Schema/migration cuối | PASS26: fresh/legacy upgrade, rerun/baseline revision, checksum cũ, app-role không update/delete revision, VNPay expiry union được bảo toàn |
| Review HTTP/Mongo | PASS9: quyền/replay/race/deadline/tombstone/role scores/reply/aggregate/history cursor và legacy alias/key |
| Exchange + obligations regression | PASS54; cộng với review trước khi thêm history đạt61, review cuối riêng đạt9; không gọi toàn bộ API E2E là PASS |
| Shared SessionClient | PASS29, gồm unknown ACK/remount giữ ý định, definite rejection và identity change |
| User web / RN / Admin unit | PASS251 /161 /219 |
| API, web, RN, Admin typecheck/lint | PASS; API/web còn warnings cũ, không sửa migration cũ để dọn warning |
| Build/export | API build, User-web build, Admin build/bundle budgets và RN web export PASS; web còn chunk warning |
| Browser integration mới | PASS web create/lost ACK/retry cùng key/edit/rejection/refresh503 giữ draft/delete; Guest profile; Staff hide/restore/aggregate/history pagination; RN create/profile;1440/768/390/320px, RN web chữ130% |
| UI workflow | Pro Max + Taste + Impeccable theo brand; context3app, detector một lần0findings; source/DOM/screenshots vẫn là phần kiểm chính |

Lệnh tái chạy: `pnpm contract:check`, `pnpm contract:routes`, lint/typecheck/test/
build theo package, `pnpm test:api:mongo`, API E2E scoped ba file review/exchanges/
obligations theo START_HERE. Browser: build API; export RN với
`EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3009/api/v1`; đặt `MONGO_TEST_URL` QA rồi
`pnpm test:reviews:browser`. Harness tự dựng/dọn DB/users/roles và server fixture;
không cần account hoặc bucket thật.

Ảnh QA đã xem, dữ liệu giả:
[web desktop](../ui/evidence/transaction-reviews/web-desktop.png),
[web320px](../ui/evidence/transaction-reviews/web-320.png),
[RN web chữ lớn](../ui/evidence/transaction-reviews/rn-web-large-320.png),
[public profile](../ui/evidence/transaction-reviews/public-profile.png).
Log và các ảnh còn lại ở `.tmp/review-evidence/` local, không chứa token/env.

Lỗi tìm được và đã sửa trong gói: code cũ công bố review khi hai bên vừa gửi;
form web bị remount lúc pending intent hoặc refresh lỗi nên mất bản sửa; migration
mới ban đầu làm rơi quyền receipt cho VNPay expiry. Những ca tương ứng hiện có
regression; migration đã áp dụng trước đây giữ nguyên.

## Tích hợp và phần chưa nghiệm thu

1. Review source/quyền với owner hai client và reviewer độc lập theo TEAMWORK;
   push/PR/remote CI/merge chưa được giao trong gói này. Nhánh chứa ba commit
   local có trước gói này; khi tích hợp cần quyết định cả chuỗi dependency.
2. Dừng API/worker cũ; backup theo runbook của nhóm. Áp migration0040 và bootstrap
   app role cho `review_revisions`, rồi khởi động API và worker cùng source.
   Không sửa checksum migration cũ, reset/reseed hoặc tự làm trên DB chính.
   Legacy Exchange POST nay bắt buộc Idempotency-Key: cập nhật client cùng API,
   chốt migration window nếu còn consumer cũ ngoài repo.
3. Nghiệm thu native trên thiết bị, TalkBack/ARM/iOS, live provider và human UX/
   permission review còn NOT RUN. Flutter không được triển khai parity. Full
   dispute/claim/assignment/appeal không thuộc hệ thống moderation review này.
   Số vi phạm lấy các sự kiện đã xác minh hiện có ở `member_violations`, không
   thay thế gói quản trị tài khoản/kết luận và đảo kết luận còn thiếu của dự án.
   Evidence hold trong gói chỉ dùng sau publication. Không mở DirectDelivery
   vượtF2h, không thay settlement, không đóng gate READINESS từ test xanh.

Kiểm remote cuối28/10: `origin/main=7d92012`, PR mở0; User Web CI/API CI/Docs CI
trên main đều completed/success. Đây là CI baseline, **không** là CI của nhánh
review chưa push. QA được dừng sau kiểm; Mongo chính giữ trạng thái dừng và dữ
liệu nguyên vẹn. Commit local, chưa push/PR/merge/deploy.
