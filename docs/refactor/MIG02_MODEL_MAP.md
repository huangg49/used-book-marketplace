# MIG-02 — Bản đồ mô hình và backstop PostgreSQL → MongoDB

29/09/2026, nhánh `codex/mongodb-refactor`. Nguồn: `apps/api/prisma/schema.prisma`
và 17 migration SQL ở baseline. Đích: `apps/api/src/database/mongo/migrations/0001-baseline-schema.ts`
(validator/index/quyền) và `0002-reference-data.ts`. Giao thức: [ADR 0027](../adr/0027-mongodb-persistence-protocol.md).

## Quy ước

- Mỗi bảng → một collection cùng tên snake_case; field giữ tên camelCase của Prisma.
- `_id` là UUID string chữ thường (không ObjectId). Giá trị UUID từ client (path,
  Idempotency-Key) phải được chuẩn hóa chữ thường trước khi ghi/đọc, vì PostgreSQL
  kiểu `uuid` so sánh không phân biệt hoa thường còn string thì có. Validator chỉ nhận
  chữ thường nên bỏ sót sẽ bị từ chối, không tạo bản ghi trùng.
- Khóa tự nhiên/ghép: `_id` xác định (`service_areas`=code, `address_books`=ownerId,
  `order_preparations`=orderId, `agreement_snapshots`=contextId, policy=code/scope;
  `revision_media`=`revisionId:mediaId`, `ledger_entries`=`journalId:accountId`,
  `workflow_items`=`contextId:listingId`, `shipment_packaging_evidence`=`shipmentId:evidenceId`,
  `service_localities`=`areaCode:code`). Validator kiểm `_id` ghép khớp các field.
- Cột nullable luôn lưu `null`, không bỏ field; `additionalProperties:false` từ chối field lạ.
- Tiền là số nguyên BSON `int` (VND); ledger ≤ 100.000.000 nên không cần int64.
- Thời gian: BSON date, **mili giây** (PostgreSQL micro giây). Dữ liệu import bị cắt về ms;
  thứ tự trùng thời gian luôn phân xử bằng `_id`. Cursor v1 bị từ chối 400 (`keyset.ts`).
- Chuỗi văn bản sắp xếp theo khóa đã chuẩn hóa (bỏ dấu, `đ→d`, chữ thường) so sánh nhị phân;
  không tái tạo collation glibc của PostgreSQL (khác biệt chỉ ở thứ tự dấu câu/khoảng trắng).
- Sequence: `ledger_journals.sequence` lấy từ `counters.ledger_journal_sequence` trong cùng
  transaction; vì posting khóa tài khoản nên thứ tự sequence khớp thứ tự commit.
- Đồng hồ quyết định: `$$NOW` sau khi khóa (ADR 0027).

Ký hiệu thay thế: **V** validator (`$jsonSchema`/`$expr`) · **I** unique/partial index ·
**P** quyền role `latlai_app` · **W** giao thức ghi của ứng dụng (khóa-bằng-ghi, filter
điều kiện trạng thái trước) · **C** kiểm bất biến liên-document lúc commit, chạy trong
transaction trước commit (port cùng module ở MIG-03…05). **W/C là tầng ứng dụng: DB
MongoDB không tự thực hiện**; P giới hạn writer nào có thể đi vòng.

## 44 model

| Model PostgreSQL | Collection | Quyền app | Ghi chú |
|---|---|---|---|
| User | users | mutable | roles nhúng |
| UserRole | users.roles | (nhúng) | PK (user,role) → V roles không trùng |
| AuthSession | auth_sessions | mutable | |
| LoginAttempt | login_attempts | deletable | |
| CatalogBook | catalog_books | mutable | |
| CatalogRevision | catalog_revisions | appendOnly | |
| CatalogDecision | catalog_decisions | appendOnly | |
| Listing | listings | mutable | |
| ListingRevision | listing_revisions | mutable | bản đã nộp bất biến bằng W |
| ListingMedia | listing_media | mutable | |
| RevisionMedia | revision_media | deletable | sắp lại ảnh nháp |
| ListingDecision | listing_decisions | appendOnly | |
| MutationReceipt | mutation_receipts | appendOnly | thêm `principal` |
| AuditEvent | audit_events | appendOnly | |
| OutboxEvent | outbox_events | mutable | chỉ field lease/attempt/processed |
| MediaProcessingJob | media_processing_jobs | mutable | |
| ServiceArea | service_areas | reference | seed 0002 |
| ServiceLocality | service_localities | reference | seed 0002 |
| AddressBook | address_books | mutable | |
| MemberAddress | member_addresses | deletable | |
| AddressIdentity | address_identities | appendOnly | |
| SaleQuotePolicy | sale_quote_policies | reference | seed 0002 |
| SaleQuotePolicySelection | sale_quote_policy_selection | reference | seed 0002 |
| SaleQuote | sale_quotes | appendOnly | |
| DirectOrder | direct_orders | mutable | |
| OrderPreparation | order_preparations | appendOnly | |
| PickupReview | pickup_reviews | appendOnly | |
| OrderPackagingEvidence | order_packaging_evidence | mutable | Pending→Ready bằng W |
| DirectShipment | direct_shipments | appendOnly | |
| CarrierPickupEvent | carrier_pickup_events | appendOnly | |
| OrderDeliveryReview | order_delivery_reviews | appendOnly | |
| OrderNonReceiptReport | order_non_receipt_reports | appendOnly | |
| CarrierPickupReview | carrier_pickup_reviews | appendOnly | |
| ShipmentPackagingEvidence | shipment_packaging_evidence | appendOnly | |
| WorkflowContext | workflow_contexts | mutable | |
| WorkflowItem | workflow_items | appendOnly | |
| AgreementSnapshot | agreement_snapshots | appendOnly | |
| ExclusiveCommitment | exclusive_commitments | mutable | |
| CommitmentEvent | commitment_events | appendOnly | |
| WalletAccount | wallet_accounts | appendOnly | khóa qua `account_locks` |
| TopupIntent | topup_intents | mutable | |
| SimulatedPaymentEvent | simulated_payment_events | appendOnly | |
| LedgerJournal | ledger_journals | appendOnly | |
| LedgerEntry | ledger_entries | appendOnly | |

Hạ tầng mới (không có model): `command_locks` (khóa idempotency, TTL), `account_locks`,
`counters`, `_migrations` (chỉ migrator ghi). Test kiểm 43 collection + 1 model nhúng = 44.

Quyền (`roles.ts`): appendOnly = find+insert; mutable = +update; deletable = +remove;
reference = find. App không có createCollection/collMod/createIndex/bypassDocumentValidation.
`latlai_migrator` = dbAdmin+readWrite trên đúng DB. Admin/root vẫn có thể sửa tay — giống
superuser PostgreSQL, ngoài phạm vi backstop.

## Khóa ngoại

Không có FK trong MongoDB. Thay bằng: (W) service kiểm tồn tại/sở hữu trong transaction sau
khi khóa document cha; (P) không có quyền remove trên collection được tham chiếu nên
"ON DELETE RESTRICT" không thể bị vi phạm bởi app; (C) kiểm bất biến lúc commit xác minh
chuỗi receipt→audit→outbox và các tham chiếu chính của aggregate. FK `ON DELETE CASCADE`
(user_roles, auth_sessions) không còn đường xóa user trong app. Tham chiếu hỏng do sửa
tay bằng tài khoản admin **không** bị DB chặn.

## CHECK một hàng → V (đã có test mẫu trong `schema.mongo-spec.ts`)

| Migration | Ràng buộc | Thay thế |
|---|---|---|
| 20260924 | enum UserStatus/RoleCode, NOT NULL | V |
| 20260926000000 | catalog_version_positive, catalog_confirmed_isbn_state, confirmed_isbn_valid | V (checksum ISBN-13 bằng `$reduce`) |
| | catalog_revision_number, catalog_metadata_required, catalog_year, catalog_authors, catalog_isbn_valid | V (ISBN-10 mod 11, ISBN-13) |
| | listing_version_positive, listing_removal_reason | V |
| | revision_number_positive, revision_prices, revision_mode_prices, submitted_content_complete | V |
| | media_position, media_version_positive, media_upload_limits, media_pixels, media_ready, media_processing, media_failure | V |
| | listing_decision_details (checklist đúng 6 key true), catalog_decision_details | V (không phụ thuộc thứ tự key) |
| | receipt_one_target, receipt_shape, audit_one_target, audit_projections, outbox_attempts/payload, media_job_attempts | V |
| 20260926020000 | catalog_isbn_prefix, confirmed_isbn_prefix | V |
| 20260926030000 | media_reserved_bytes | V |
| 20260927000000 | address_books.version ≥ 0; member_addresses tên/điện thoại/chi tiết | V |
| 20260927010000 | revision_fulfillment_complete; member_addresses.version ≥ 1 | V |
| 20260927020000 | policy ranges; selection scope; quote version=1, seller≠buyer, price/fee/bps, commission=(price·bps+5000) div 10000, buyerTotal, sellerProceeds, expires ≤ created+5m | V |
| 20260927030000 | direct_orders state/version/closed; contexts kind/version/phase; agreement schemaVersion=1; commitments status/version/ended/reason; commitment_events kind/sequence | V |
| 20260928010000 | wallet_account_shape; topup amount/currency/state/version/updated≥created; payment event provider/hash/amount/currency/outcome/disposition; journal_shape; entries một phía dương ≤ 100M | V |
| 20260928020000 | order_shape (paid/deadline 48h/cancellation), order_terminal_time, receipt_principal/audit_principal theo system actor | V |
| 20260928030000 | preparation pickup=accepted+48h, policy; pickup_review reason; order_shape mở rộng | V |
| 20260928040000 | packaging_shape (reserved=bytes+2MB, Pending/Ready đủ field) | V |
| 20260928050000 | shipment version/state/carrier/tracking/direction/fee_policy; evidence position | V |
| 20260928060000 | pickup event sequence 1..128, occurred ≤ received, Applied ⇔ deadline=+240h; review reason; order_shape InTransit/ResolutionPending 4|5 | V |
| 20260928070000 | delivery review openedBy/policy; non-receipt description 20..2000 đã trim | V |

Khác biệt ngữ nghĩa có chủ đích: CHECK PostgreSQL coi `NULL` là đạt; `$expr` so sánh với
`null` là không đạt. Các chỗ phụ thuộc NULL đều đã có IS NULL tường minh, nên V chặt hơn
hoặc bằng. `btrim` chỉ bỏ dấu cách: V dùng `$trim` với `chars:' '` để giống hệt.

## UNIQUE → I

Mọi UNIQUE được giữ; UNIQUE trên cột nullable dùng partial filter `$type:'string'` (PostgreSQL
cho nhiều NULL): confirmedIsbn, pinnedKey, derivativeKey, audit.receiptId, uploadReceiptId,
wallet ownerId/orderId, journal topupId/eventId/receiptId, (orderId,type). Partial index
nghiệp vụ: `commitment_one_active_listing` (status Active), `address_one_default`
(isDefault), `pickup_one_applied` (outcome Applied). Hai unique receipt
(actor,op,key)/(system,op,key) gộp thành `(principal, operation, key)`; V buộc
`principal` khớp actorId/systemActor. Test: `schema.mongo-spec.ts`.

## Trigger bất biến → P (+ W)

| Trigger | Thay thế |
|---|---|
| latlai_append_only trên catalog_revisions, catalog/listing_decisions, mutation_receipts, audit_events, address_identities, sale_quote_policies, sale_quotes, workflow_items, agreement_snapshots, commitment_events, order_preparations, pickup_reviews, direct_shipments, shipment_packaging_evidence, carrier_pickup_events/reviews, order_delivery_reviews, order_non_receipt_reports | P appendOnly (test: update/delete bị 13 Unauthorized) |
| latlai_wallet_immutable (accounts, journals, entries, payment events) | P appendOnly; khóa tài khoản chuyển sang `account_locks` |
| no_order/context/commitment_delete, guard_outbox delete, topup delete, packaging delete | P mutable không có remove |
| guard_outbox (identity/payload bất biến) | W: chỉ `$set` attempts/availableAt/leaseUntil/processedAt |
| latlai_guard_revision (bản nộp bất biến, identity) | W: update nháp luôn lọc `submittedAt:null`, không `$set` id/listingId/number; C kiểm lúc commit |
| latlai_guard_revision_media (ảnh của bản đã nộp; media chưa purge) | W: xóa/chèn chỉ khi revision nháp đã khóa; media khóa và `purgedAt:null` |
| latlai_guard_media (identity/input bất biến, Ready bất biến, reservation, tombstone, version +1, media đang dùng không purge) | W: update có filter trạng thái cũ + `$inc version`; không bao giờ `$set` field identity; purge lọc không có revision_media |
| latlai_guard_aggregate (owner/requester bất biến, catalog Confirmed bất biến, version +1) | W: filter `version` cũ + `$inc:1`; không `$set` owner/requester; update catalog lọc `status≠Confirmed` |
| latlai_guard_decision (chỉ khi PendingReview/Pending, đúng revision hiện hành, không tự duyệt) | W trong service review (khóa listing/catalog trước) + C |
| role_mutation_lock | cấu trúc: roles nhúng trong user được khóa (ADR 0027) |
| latlai_address_write_guard / address_book_version / address_content_version | W: khóa user + address book; version sổ +1; version địa chỉ +1 khi đổi nội dung; identity chèn cùng lúc |
| latlai_revision_origin_check | W: khóa và đọc địa chỉ hiện hành của owner; C |
| latlai_sale_quote_check | W: quote dựng từ nguồn đã khóa; V cho số học |
| latlai_guard_order_transition (orders/contexts/commitments) | W: update lọc state/version cũ, chỉ các chuyển trạng thái hợp lệ; V kiểm hình dạng kết quả |
| latlai_topup_transition | W: filter state/version cũ; V hình dạng |
| latlai_wallet_entry_lock | W: khóa `account_locks` mọi tài khoản của journal trước khi đọc số dư |
| latlai_guard_packaging | W: update chỉ Pending→Ready, lọc `status:'Pending'` |
| shipment_evidence_insert_guard / shipment_insert_guard | W: chèn liên kết trước receipt trong cùng transaction; order phải Preparing v3 đã khóa; C |
| latlai_guard_order_snapshot (item/agreement khớp nguồn đã khóa) | W: dựng snapshot từ nguồn đã khóa; C so sánh lại |

## Constraint trigger DEFERRED (kiểm lúc commit) → C

Bắt buộc port thành hàm TypeScript chạy trong transaction, sau receipt/audit/outbox, trước
commit, cho mọi aggregate bị chạm. Đọc bằng snapshot của chính transaction (thấy ghi của nó).

| Hàm PostgreSQL | Hàm C (module port) |
|---|---|
| latlai_check_listing, latlai_check_catalog | `checkListing`, `checkCatalog` (MIG-04) |
| latlai_address_book_check (≤10 địa chỉ, đúng 1 mặc định) | `checkAddressBook` (MIG-04) |
| latlai_check_order, _order_funding, _order_preparation, _order_pickup, _delivery_review, latlai_check_commitment_projection, latlai_packaging_consistency, latlai_check_shipment | `checkOrder` + các hàm con (MIG-05) |
| latlai_check_journal (+ _funding_journal_v1), latlai_check_topup, latlai_hold_account_constraint | `checkJournal`, `checkTopup` (MIG-05) |

Giới hạn thật: C chỉ chạy cho writer đi qua command executor. Writer khác có quyền
`latlai_app` (script, sửa tay bằng user app) có thể ghi trạng thái mà C không thấy; P chỉ
chặn update/delete trên dữ liệu append-only. Vì vậy MIG-06 thêm công cụ đối soát chạy
toàn bộ C trên toàn DB (tương đương các lệnh `SELECT latlai_check_order(id)` cuối migration).

## Dữ liệu tham chiếu (0002)

`HCM-DEMO-v1` + DEMO-A/B; policy `HCM-DIRECT-v1` (30.000, 500 bps, 300 s), selection
`DirectSale`; tài khoản SimulatorCapital/Clearing với id cố định, journal mở đầu
`…0003` sequence 1 cân 100.000.000; counter sequence = 1. Chỉ chèn khi thiếu.
