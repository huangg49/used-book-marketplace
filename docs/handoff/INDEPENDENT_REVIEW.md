# Gói review độc lập trước bàn giao F2h

28/09/2026 · **Chưa có người review ký nhận.** Tài liệu này tập hợp đường đọc,
câu hỏi cần trả lời và mẫu kết luận; không là review độc lập của tác giả.
Quy tắc người review ở [TEAMWORK](../TEAMWORK.md): owner review implementation;
cần reviewer thứ hai cho wallet, settlement, permissions và disputes.
Team tự điền tên, không mặc định người tạo báo cáo là reviewer độc lập.

## Gói hiện tại — 01/11/2026

**Rà kỹ thuật của tác giả đã thực hiện; chủ dự án chấp thuận tự kiểm cho gói này.**
Ngày01/11/2026, sau hồ sơ tại `d7341fe5`, chủ dự án nói: “Không cần Review thứ 2
nữa đâu, mình bạn làm là được rồi.” Gói hiện tại không chờ thêm reviewer; đây là
ngoại lệ mới cho chuỗi từ `be581aec` tới source `aeee8b81`, không kế thừa PR83
và không miễn review chung cho thay đổi tương lai. Review độc lập người thật
chưa thực hiện. Ngoại lệ không tự cấp quyền push/PR/merge/deploy hoặc đóng các
gate UX người thật, native và AI.

- Base/main/origin/main sau fetch: `be581aeca4afaf3a7cea8b4b047281fd78e661de`.
- Chuỗi khảo sát: Exchange `65b40161`, RN `1574d986`, AI offline `c5c30261`,
  evidence Android `1aa958beecff779ea7dd56a513e3fb7aa4ed4646`.
- Source sau sửa finding: `aeee8b81e89b0c1ab257fc13c76348a3d2721965`, nhánh
  `codex/money-permission-review`. Reviewer đọc toàn bộ diff từ base, không chỉ
  commit sửa cuối. Một worktree; trước lượt review sạch, không có local work bị bỏ.
- Runtime MongoDB; contract0.64.0. Không đổi migration, ledger/backend trong lượt
  review này. Không GHN/carrier/Driver, env, DB chính, push/PR/merge/deploy.

### Finding xác nhận và đã sửa

**R10 · P2 · intent bị bỏ sau HTTP408/429 dù kết quả trước chưa rõ.**
[Hai helper dùng chung](../../packages/session-client/src/order-response.ts)
trước sửa loại408/429 cùng nhóm từ chối chắc chắn. Tái hiện offline: gửi create
hoặc accept/reject/pay/cancel nhận503 mô phỏng mất ACK; retry nhận408 hoặc429;
map intent mất mục đã lưu. Client có thể tạo key/version mới hoặc bỏ chặn quyết
định đối nghịch trước khi lấy được receipt cũ, vi phạm invariant retry trong
AGENTS. Với429 ở lần retry, bị giới hạn request không chứng minh lần trước chưa
commit. Đây là lỗi client được tái hiện, **không phải bằng chứng đã phát sinh đơn
trùng hoặc mất tiền**; backend vẫn có state/version/receipt guards.

- Lỗi quyết định accept/reject có từ base; gói RN mở rộng helper cho pay/cancel và
  thêm create nên cũng chịu cùng lỗi. Không gán toàn bộ lỗi cho increment RN.
- Sửa bằng cùng một predicate cho hai helper:401/403/408/429, network/5xx và
  lỗi đọc receipt giữ intent;409 từ chối chắc chắn vẫn cho phép intent mới theo
  protocol hiện có. Không thay key/body/version khi retry hoặc tự gọi mutation.
- [Regression](../../packages/session-client/src/order-response.test.ts):10ca
  mới FAIL trước sửa (8quyết định,2create); PASS sau sửa. Kiểm giữ map, chặn
  opposite trước HTTP, retry đúng key/body/version và xóa pending khi ACK hợp lệ.
  Đây là fake transport/unit, không proxy thật hoặc kiểm ledger/Mongo mới.

### Đường đọc và kết luận trong phạm vi đã rà

| Phần | Source và invariant đã đối chiếu | Kết luận / giới hạn |
| --- | --- | --- |
| Phân xử Exchange | [service](../../apps/api/src/modules/exchanges/exchanges.service.ts): listResolutions/resolveDispute; [executor](../../apps/api/src/modules/commands/mongo-command.service.ts): actor/execute/executePrincipal; [controller](../../apps/api/src/modules/exchanges/exchange-operations.controller.ts); [ADR0057](../adr/0057-exchange-resolution-safety.md) và OpenAPI | Current ACTIVE role/session và self-participant check trước receipt; quyết định mới bị chặn, queue loại self. Không mở thực thi phân xử hoặc kết luận dispute hoàn chỉnh |
| Tiền/sách và worker | [inspection policy](../../apps/api/src/modules/exchanges/exchange-inspection.ts), expireInspection; [E2E](../../apps/api/test/exchanges.e2e-spec.ts): Exchange resolution safety | Predicate không settle claim; denial không đi vào ledger/release. Đọc assertions cả2decision,2role/2participant,600.000đ, replay/revoke và Gate contention;45/45 là evidence lượt65b40161 đã ghi, không chạy lại Mongo trong lượt này |
| Session và hành trình RN/web | [helper](../../packages/session-client/src/order-response.ts), [checkout](../../apps/mobile-react-native/src/features/orders/buy-now-modal.tsx), [OrderFocus](../../apps/mobile-react-native/src/features/orders/order-focus-screen.tsx), [web](../../apps/user-web/src/components/OrderResponse.tsx) | R10 đã sửa; map theo identity/generation, late ACK không điều hướng phiên đã đóng. Bộ nhớ chỉ tồn tại trong tiến trình; không tuyên bố chịu được app bị kill. [Native evidence](../ui/MEMBER_NATIVE_DEMO_2026_11_01.md) thuộc sourcec5c30261, chưa chứa sửa408/429 |
| AI offline | [preflight](../../apps/api/eval/autofill-assist/run.ts), [qualityGate](../../apps/api/eval/autofill-assist/quality.ts), [workflow](../../.github/workflows/listing-ai-offline-ci.yml), [corpus/evidence](../features/LISTING_AI_CORPUS_2026_10_29.md) | Check-only thoát trước adapter/provider; workflow dùng fixture, gate từ chối failure/thiếu điểm/trùng ID. Không sửa model/prompt.0ảnh điện thoại/0human review; không nâng technical PASS thành chất lượng AI đã nghiệm thu |

### Kiểm tra thực chạy trong lượt review

Windows/Node local; source sửa tương ứng `aeee8b81`. Các lệnh dưới không bật app,
gọi provider hoặc dùng DB. Không thay assertion cũ để che lỗi.

| Check | Kết quả | Giới hạn |
| --- | --- | --- |
| Session focused trước sửa | FAIL10/20 như dự kiến | Regression chứng minh map bị xóa sau408/429 |
| `pnpm --filter @used-books/session-client test` | PASS75/75,9file | Fake transport; gồm10ca mới |
| RN `typecheck` và `test` | PASS164/164,24file | Không Android build hoặc native runtime mới |
| User web `typecheck` và `test` | PASS253/253,38file | Không browser E2E mới |
| Oxlint hai file session sửa | PASS | Chạy binary local từ root với đường dẫn nằm trong repo |
| `pnpm docs:check` / `git diff --check` | PASS |484Markdown/3106relative links/6skill pairs; không kiểm anchor, URL ngoài hoặc business claims |
| Mongo/contract/build/browser/native/AI live | NOT RUN lượt này | Không đổi API/schema/UI/model; giữ evidence có SHA của từng gói, không chạy lại harness nặng |

### Remote và môi trường đã xác minh

Fetch không có main mới; GitHub trả0PR mở. Sáu workflow sau cùng PASS ở **base
be581aec**, không phải ở local head: [API](https://github.com/huangg49/used-book-marketplace/actions/runs/41163724896),
[User Web](https://github.com/huangg49/used-book-marketplace/actions/runs/41163724953),
[RN](https://github.com/huangg49/used-book-marketplace/actions/runs/41163724882),
[Operations](https://github.com/huangg49/used-book-marketplace/actions/runs/41163724892),
[Docs](https://github.com/huangg49/used-book-marketplace/actions/runs/41163725001),
[Demo](https://github.com/huangg49/used-book-marketplace/actions/runs/41163724878).
CI của local chain **NOT RUN**; không nhận thành Admin/Flutter/native PASS.

Mongo app và Mongo QA đều dừng; không listener3000/3009/3020/57017/8089/5037 tại
lượt kiểm. Không bật thêm dịch vụ hoặc ghi/xóa DB. READINESS giữ nguyên.

### Đường kiểm tham khảo và bước tích hợp

Đường đọc dưới đây được giữ để người nhận có thể kiểm lại. Với ngoại lệ vừa được
chủ dự án cấp ở đầu mục này, gói hiện tại không chờ owner/reviewer thứ hai ký nhận;
không ghi thêm chữ ký người thật hoặc nhận là review độc lập đã PASS.

1. Chấp nhận phạm vi fail-closed của ADR0057: tiền/sách giữ khi protocol quyết định
   chưa đủ; replay lịch sử không là quyền tạo phán quyết mới.
2. Đối chiếu current auth trước replay, cả2participant/2role và worker contention;
   nếu cần chạy lại, dùng replica QA/DB `_test`, không DB chính.
3. Đọc R10/fix/regression và giới hạn tiến trình/native; nhận xét có căn cứ,
   nếu có review bổ sung, ghi reviewer, SHA đã review và kết luận vào phiếu dưới.

Khi owner giao quyền publish, mới push/mở PR và lấy CI ở đúng
candidate head; mọi job áp dụng phải PASS trước merge. Chưa tự thực hiện các
bước đó. Ảnh điện thoại/human AI, UX người thật và native còn mở theo gate riêng.

## Nguồn và ranh giới — baseline lịch sử

Cập nhật09/10: review mới chọn SHA thực tế/contract từ Git và OpenAPI (snapshot
main `da59199`, contract0.30.0,15 migration Mongo). Đọc ADR0027 và các lane
purchase/auction/point-order/notification nếu scope chạm chúng; matrix F2h dưới
đây là baseline28/09, không bao phủ mọi increment mới. Các SHA/contract0.20.0/SQL
bên dưới là lịch sử; không dùng SQL trigger làm bằng chứng runtime Mongo.


- Target ứng dụng: `76230ca09e94df69157845717e4d89d49b4641a0`.
  Baseline F2h lưu ở `beea372`, hồ sơ clone sạch ở `793eb72`; cả ba nằm trong
  lịch sử nhánh `codex/handoff-acceptance-pack`.
- `76230ca` chỉ sửa operations: nhãn hai giá, skip link, focus recovery và test.
  Reviewer cần đọc cả baseline backend, không chỉ diff UI của commit cuối.
- Contract [OpenAPI](../../packages/api-contract/openapi.yaml) 0.20.0,
  [17 migration](../../apps/api/prisma/migrations), scope [START_HERE](START_HERE.md).
  Delivered/inspection/settlement-to-Seller/claim resolution chưa triển khai.
- [AUDIT_F2H](AUDIT_F2H.md), [REBUILD](REBUILD.md) và
  [OPERATIONS_UI_QA](OPERATIONS_UI_QA.md) là bằng chứng tự kiểm để tham khảo.
  Số test PASS không thay việc reviewer đọc invariant và chỉ ra rủi ro còn lại.

## Đường đọc theo rủi ro

Các đường dẫn là entry point; reviewer theo tiếp dependency/caller/migration
liên quan. Với mỗi hàng, ghi file/hàm đã đọc, cách kiểm chứng và nhận xét.

| ID | Entry point | Câu hỏi bắt buộc đối chiếu | Test tham chiếu |
|---|---|---|---|
| R01 | [auth guard](../../apps/api/src/modules/auth/auth.guard.ts), [roles guard](../../apps/api/src/modules/auth/roles.guard.ts), [obligation decorator](../../apps/api/src/modules/auth/obligations.decorator.ts), [auth service](../../apps/api/src/modules/auth/auth.service.ts) | LOCKED bị từ chối mặc định? ExistingObligation chỉ ở method đã duyệt và service còn kiểm ownership/state? Refresh/revoke/login/role change có đúng thứ tự khóa? Replay phải kiểm quyền hiện tại | [auth](../../apps/api/test/auth.e2e-spec.ts), [obligations](../../apps/api/test/obligations.e2e-spec.ts) |
| R02 | [command executor](../../apps/api/src/modules/commands/mongo-command.service.ts), [contract input](../../apps/api/src/modules/commands/contract-input.service.ts) | Key/body hash có phân biệt actor/operation? Auth trước receipt, concurrent same-key không ghi hai lần? Mutation/receipt/audit/outbox cùng transaction? DB time lấy sau khóa? | [catalog/drafts](../../apps/api/test/catalog-drafts.e2e-spec.ts), [orders](../../apps/api/test/orders.e2e-spec.ts) |
| R03 | [commitment policy](../../apps/api/src/modules/listings/listing-commitment-policy.service.ts), [reservations](../../apps/api/src/modules/reservations/reservations.service.ts), [Orders](../../apps/api/src/modules/orders/orders.service.ts) | Một sách chỉ có một workflow độc quyền? Reserved không thể tồn tại thiếu workflow? Version ownership/commitment khác Order version sau funding được xử lý đúng? Expiry không tự thả sách đang hold/review? | [Order migration](../../apps/api/test/order-migration.e2e-spec.ts), [orders](../../apps/api/test/orders.e2e-spec.ts), [listing schema](../../apps/api/test/listing-schema.e2e-spec.ts) |
| R04 | [ledger](../../apps/api/src/modules/wallet/ledger.service.ts), [wallet](../../apps/api/src/modules/wallet/wallet.service.ts), [simulator](../../apps/api/src/modules/wallet/payment-simulator.ts) | Số dư chỉ từ immutable entries? Nguồn mô phỏng 100M hữu hạn, không là incident fund? Operator độc lập, chữ ký/dedupe đúng, ReviewRequired sticky? Không có đường tự nạp/sửa SQL | [wallet](../../apps/api/test/wallet.e2e-spec.ts), [wallet migration](../../apps/api/test/wallet-migration.e2e-spec.ts) |
| R05 | [Orders payment/refund/accept](../../apps/api/src/modules/orders/orders.service.ts), [expiry worker](../../apps/api/src/modules/orders/order-expiry.service.ts) | Hold frozen P+S đúng một lần? Refund failure giữ tiền/sách; posting+release atomic? Chỉ pre-acceptance dùng full-refund; Seller acceptance chặn đường refund cũ? Worker retry bounded, không đổi trạng thái trước commit? | [payment](../../apps/api/test/order-payment.e2e-spec.ts), [payment migration](../../apps/api/test/order-payment-migration.e2e-spec.ts), [preparation](../../apps/api/test/order-preparation.e2e-spec.ts) |
| R06 | [packaging evidence](../../apps/api/src/modules/orders/packaging-evidence.service.ts), [shipment](../../apps/api/src/modules/shipments/shipments.service.ts), [carrier adapter](../../apps/api/src/modules/shipments/carrier-simulator.ts) | Label không chứng minh custody; ảnh được seal, contact/fee snapshot đúng? Auth kiểm lại sau storage I/O? Pickup operator độc lập, replay ở cap, late/conflict giữ canonical event/hold, deadline 240h pinned? | [packaging](../../apps/api/test/packaging-evidence.e2e-spec.ts), [shipments](../../apps/api/test/shipments.e2e-spec.ts), [pickup](../../apps/api/test/carrier-pickup.e2e-spec.ts) |
| R07 | [Order review intake](../../apps/api/src/modules/orders/orders.service.ts), [delivery expiry](../../apps/api/src/modules/orders/order-expiry.service.ts) | Buyer và worker cùng một review; Buyer chỉ một report; deadline từ Applied pickup? Evidence trên review không tăng version/đổi identity; không refund/restock/kết luận custody từ report? | [delivery overdue](../../apps/api/test/delivery-overdue.e2e-spec.ts) |
| R08 | [Mongo migrations](../../apps/api/src/database/mongo/migrations), [model map](../refactor/MIG02_MODEL_MAP.md), [integrity](../../apps/api/src/integrity/integrity.ts) | Validator/index/role và commit checks thay SQL backstop đầy đủ? Applied migration checksum còn nguyên? Đối soát read-only, không tự refill? | [Mongo schema](../../apps/api/test/mongo/schema.mongo-spec.ts), [import](../../apps/api/test/mongo/postgres-import.mongo-spec.ts) |
| R09 | [shared session](../../packages/session-client/src), [RN session owner](../../apps/mobile-react-native/src/core/session/session-provider.tsx), [native storage](../../apps/mobile-react-native/src/core/session/token-storage.ts), [operations decision](../../apps/admin-web/src/features/review/decision-form.tsx) | Race login/logout/storage đã xử lý cả lỗi? Không giữ access token lâu dài? Đổi user xóa cache; lost-ack retry giữ body/key; focus mới không làm gửi mutation tự động? | Session unit, [operations browser](../../apps/admin-web/tests/browser.mjs), [RN browser](../../scripts/test-public-shelf.mjs) |

Đọc ADR 0013, 0017–0025 và các báo cáo feature được trỏ từ START_HERE khi đánh giá
R03–R08. Không áp quy tắc nghiệp vụ dự kiến của ViaPoint/auction vào API chưa có.
Hai managed points mô phỏng và carrier/topup simulator không là tích hợp đời thật.

## Cách kiểm chứng một phát hiện

1. Ghi invariant bị vi phạm, trạng thái đầu, actor và chuỗi lệnh tối thiểu.
2. Chạy test liên quan trên DB riêng có hậu tố `_test` theo START_HERE. Không dùng
   shared app DB; không chạy hai suite đồng thời trên cùng DB khi chúng sửa fixture.
3. Với race, dùng barrier và kiểm trạng thái cuối/ledger/receipt, không dùng sleep
   hoặc chỉ đếm status HTTP. Với auth, kiểm cả actor sai/quyền mới bị mất trước replay.
4. Nếu cần sửa contract/schema, tuân thủ contract-first và migration mới được review;
   không sửa lịch sử migration hoặc xóa assert để làm test qua.
5. Sau fix chạy focused regression rồi các gate bị ảnh hưởng. Ghi commit fix và
   reviewer kiểm lại; không bắt chạy lại gate đã đóng nếu không có liên quan.

Ví dụ lệnh đọc source và chạy focused test (đã cấu hình môi trường QA):

```sh
git show --stat 76230ca
pnpm --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/order-payment.e2e-spec.ts
```

Không thêm `--` trước tên file khi gọi script pnpm, tránh vô tình chạy toàn suite.
Không đưa `.env`, dump DB, signed URL hoặc body chứa PII vào nhận xét.

## Phiếu review cần điền

```text
Target commit / baseline đã đối chiếu:
Reviewer owner / reviewer thứ hai / ngày:
R01..R09: mỗi ID ghi files/functions đã đọc | invariant | kiểm chứng | kết luận
Phát hiện: ID | mức độ | file/hàm | bước tái hiện | ảnh hưởng | đề xuất
Fix commit / test sau fix / reviewer đã kiểm lại:
Giới hạn chưa review / việc cần tiếp tục:
Kết luận từng reviewer: cần sửa / chấp nhận phạm vi (kèm lý do)
```

Hiện trạng: R01–R09 **NOT_REVIEWED độc lập**. Chưa có nhận xét/ký nhận từ người
ngoài tác giả. Agent không tự điền tên reviewer hoặc gửi lời mời thay người dùng.
Sau khi có báo cáo, link từ [READINESS](READINESS.md). Review này không đóng gate
[native](NATIVE_ACCEPTANCE.md); native PASS cũng không thay review tiền/quyền.
