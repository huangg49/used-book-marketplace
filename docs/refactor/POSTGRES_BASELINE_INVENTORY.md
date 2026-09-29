# Inventory PostgreSQL trước chuyển MongoDB

Baseline `1e08969dfeb8c712a286cb2c365bdf7614906f3b`, ngày 29/09/2026.
Đếm lexical từ file được Git track, không đọc .env/DB và không là review invariant hoàn chỉnh.
Đã đối chiếu source của merge với nhánh Q01; phần runtime không thay đổi.

- 44 Prisma models; 17 migration SQL.
- 27 file API source khớp Prisma types/raw SQL/PostgreSQL locks/DB clock.
- 25 file có `$queryRaw`/`$executeRaw`; 22 dưới `src/modules`.
- Các số này không đếm đủ SQL nhiều dòng, constraint semantics hoặc coupling trong test/scripts.

## Cách tái lập phạm vi

Dùng `git ls-files apps/api/src apps/api/prisma/migrations`, đọc `.ts`/`.sql`;
đánh dấu `$queryRaw|$executeRaw`, `FOR UPDATE|FOR SHARE|pg_advisory`,
`clock_timestamp|transaction_timestamp`, `generated/prisma|Prisma.`.
Model lấy từ dòng `model <name> {` trong schema.prisma. Kiểm các migration
riêng để lập ma trận thay thế từng constraint/trigger; chưa coi bước đó DONE.

## Source cần port/đối chiếu

| File từ root | Dấu hiệu | Dòng đầu khớp |
|---|---|---|
| `apps/api/prisma/migrations/20260926000000_listing_contract_foundation/migration.sql` | prisma-types, postgres-lock | 397 |
| `apps/api/prisma/migrations/20260926010000_role_mutation_lock/migration.sql` | postgres-lock | 7 |
| `apps/api/prisma/migrations/20260927000000_member_address_book/migration.sql` | postgres-lock | 37 |
| `apps/api/prisma/migrations/20260927010000_listing_fulfillment/migration.sql` | postgres-lock | 44 |
| `apps/api/prisma/migrations/20260927030000_unpaid_direct_orders/migration.sql` | postgres-lock | 140 |
| `apps/api/prisma/migrations/20260928010000_simulated_wallet/migration.sql` | postgres-lock, db-clock | 76 |
| `apps/api/src/app.controller.ts` | raw-sql | 22 |
| `apps/api/src/database/database.service.ts` | prisma-types | 4 |
| `apps/api/src/local-check.ts` | raw-sql | 82 |
| `apps/api/src/modules/auth/auth.service.ts` | prisma-types, raw-sql, postgres-lock, db-clock | 10 |
| `apps/api/src/modules/catalog/catalog.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/commands/command.service.ts` | prisma-types, raw-sql, postgres-lock, db-clock | 4 |
| `apps/api/src/modules/commands/page.service.ts` | prisma-types, raw-sql | 4 |
| `apps/api/src/modules/listings/listing-commitment-policy.service.ts` | raw-sql, postgres-lock | 16 |
| `apps/api/src/modules/listings/listing-drafts.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/listings/listing-fulfillment.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/listings/listing-lifecycle.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/listings/listing-projection.ts` | prisma-types | 1 |
| `apps/api/src/modules/listings/listing-review.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/listings/public-listing.service.ts` | prisma-types, raw-sql | 2 |
| `apps/api/src/modules/media/media-worker.service.ts` | raw-sql, postgres-lock | 14 |
| `apps/api/src/modules/media/media.service.ts` | prisma-types, raw-sql, postgres-lock | 5 |
| `apps/api/src/modules/orders/order-clock.ts` | raw-sql, db-clock | 6 |
| `apps/api/src/modules/orders/order-expiry.service.ts` | prisma-types, raw-sql | 6 |
| `apps/api/src/modules/orders/orders.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/orders/packaging-evidence.service.ts` | prisma-types, raw-sql, postgres-lock | 5 |
| `apps/api/src/modules/quotes/quote-clock.ts` | raw-sql, db-clock | 6 |
| `apps/api/src/modules/quotes/quotes.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/reservations/reservations.service.ts` | raw-sql, postgres-lock | 105 |
| `apps/api/src/modules/shipments/shipments.service.ts` | prisma-types, raw-sql, postgres-lock | 3 |
| `apps/api/src/modules/wallet/ledger.service.ts` | prisma-types, raw-sql, postgres-lock | 2 |
| `apps/api/src/modules/wallet/wallet.service.ts` | prisma-types, raw-sql, db-clock, postgres-lock | 3 |
| `apps/api/src/wallet-check.ts` | raw-sql | 13 |

## Models

- `WalletAccount`
- `TopupIntent`
- `SimulatedPaymentEvent`
- `LedgerJournal`
- `LedgerEntry`
- `User`
- `UserRole`
- `AuthSession`
- `LoginAttempt`
- `CatalogBook`
- `CatalogRevision`
- `CatalogDecision`
- `Listing`
- `ListingRevision`
- `ListingMedia`
- `RevisionMedia`
- `ListingDecision`
- `MutationReceipt`
- `AuditEvent`
- `OutboxEvent`
- `MediaProcessingJob`
- `ServiceArea`
- `ServiceLocality`
- `AddressBook`
- `MemberAddress`
- `AddressIdentity`
- `SaleQuotePolicy`
- `SaleQuotePolicySelection`
- `SaleQuote`
- `DirectOrder`
- `OrderPreparation`
- `PickupReview`
- `OrderPackagingEvidence`
- `DirectShipment`
- `CarrierPickupEvent`
- `OrderDeliveryReview`
- `OrderNonReceiptReport`
- `CarrierPickupReview`
- `ShipmentPackagingEvidence`
- `WorkflowContext`
- `WorkflowItem`
- `AgreementSnapshot`
- `ExclusiveCommitment`
- `CommitmentEvent`

## Migration lịch sử phải giữ nguyên

- `apps/api/prisma/migrations/20260924000000_auth_foundation/migration.sql`
- `apps/api/prisma/migrations/20260926000000_listing_contract_foundation/migration.sql`
- `apps/api/prisma/migrations/20260926010000_role_mutation_lock/migration.sql`
- `apps/api/prisma/migrations/20260926020000_catalog_isbn_prefix/migration.sql`
- `apps/api/prisma/migrations/20260926030000_media_storage_reservation/migration.sql`
- `apps/api/prisma/migrations/20260926040000_media_ready_reservation/migration.sql`
- `apps/api/prisma/migrations/20260927000000_member_address_book/migration.sql`
- `apps/api/prisma/migrations/20260927010000_listing_fulfillment/migration.sql`
- `apps/api/prisma/migrations/20260927020000_direct_sale_quotes/migration.sql`
- `apps/api/prisma/migrations/20260927030000_unpaid_direct_orders/migration.sql`
- `apps/api/prisma/migrations/20260928010000_simulated_wallet/migration.sql`
- `apps/api/prisma/migrations/20260928020000_order_wallet_payment/migration.sql`
- `apps/api/prisma/migrations/20260928030000_order_preparation/migration.sql`
- `apps/api/prisma/migrations/20260928040000_order_packaging_evidence/migration.sql`
- `apps/api/prisma/migrations/20260928050000_direct_shipment_registration/migration.sql`
- `apps/api/prisma/migrations/20260928060000_carrier_pickup/migration.sql`
- `apps/api/prisma/migrations/20260928070000_delivery_overdue/migration.sql`
