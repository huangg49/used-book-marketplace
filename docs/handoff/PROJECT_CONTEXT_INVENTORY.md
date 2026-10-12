# Inventory kỹ thuật cho context AI

Snapshot 09/10/2026 · source `da59199` · tạo từ file Git, không đọc database hoặc `.env` thật.

Đọc cùng [PROJECT_CONTEXT](PROJECT_CONTEXT.md). Đây là chỉ mục khai báo trong source; có endpoint/test không đồng nghĩa đã chạy PASS hoặc đã nghiệm thu.

## 1. Contract HTTP

Nguồn: [packages/api-contract/openapi.yaml](../../packages/api-contract/openapi.yaml); OpenAPI 3.1.0, phiên bản API 0.30.0, 108 path, 113 operation, 160 schema. Prefix runtime: `/api/v1`.

Cột quyền chỉ phản ánh security trong YAML; role/owner/eligibility/state vẫn phải đọc controller và service. WebSocket được mô tả riêng trong context chính.

| Tag | Method | Path | operationId | Security |
| --- | --- | --- | --- | --- |
| System | GET | `/health` | `getHealth` | Không khai báo; xem runtime |
| System | GET | `/health/ready` | `getReadiness` | Không khai báo; xem runtime |
| Auth | POST | `/auth/login` | `login` | Không khai báo; xem runtime |
| Auth | POST | `/auth/refresh` | `refreshSession` | Không khai báo; xem runtime |
| Auth | POST | `/auth/logout` | `logout` | Không khai báo; xem runtime |
| Auth | GET | `/auth/me` | `getCurrentUser` | bearerAuth |
| Catalog | GET | `/catalog/books` | `listBooks` | Public |
| Catalog | GET | `/catalog/books/{bookId}` | `getBook` | Public |
| Catalog | POST | `/catalog/requests` | `createCatalogRequest` | bearerAuth |
| Catalog | GET | `/me/catalog-requests` | `listMyCatalogRequests` | bearerAuth |
| Catalog | GET | `/me/catalog-requests/{bookId}` | `getMyCatalogRequest` | bearerAuth |
| Catalog | POST | `/catalog/requests/{bookId}/resubmit` | `resubmitCatalogRequest` | bearerAuth |
| Catalog review | GET | `/operations/catalog-requests` | `listCatalogReviewQueue` | bearerAuth |
| Catalog review | GET | `/operations/catalog-requests/{bookId}` | `getCatalogReview` | bearerAuth |
| Catalog review | POST | `/operations/catalog-requests/{bookId}/decision` | `decideCatalogRequest` | bearerAuth |
| Listings | GET | `/listings` | `listPublicListings` | Public |
| Listings | POST | `/listings` | `createListingDraft` | bearerAuth |
| Listings | GET | `/listings/{listingId}` | `getPublicListing` | Public |
| Purchase conversations | POST | `/listings/{listingId}/purchase-conversations` | `createPurchaseConversation` | bearerAuth |
| Purchase conversations | GET | `/me/purchase-conversations` | `listMyPurchaseConversations` | bearerAuth |
| Notifications | GET | `/me/notifications` | `listMyNotifications` | bearerAuth |
| Notifications | POST | `/me/notifications/read` | `markMyNotificationsRead` | bearerAuth |
| Purchase conversations | GET | `/me/purchase-conversations/{conversationId}/messages` | `listPurchaseMessages` | bearerAuth |
| Listings | GET | `/me/listings` | `listMyListings` | bearerAuth |
| Listings | GET | `/me/listings/{listingId}` | `getMyListing` | bearerAuth |
| Listings | GET | `/me/listings/{listingId}/revisions` | `listMyListingRevisions` | bearerAuth |
| Listings | PUT | `/listings/{listingId}/draft` | `saveListingDraft` | bearerAuth |
| Listings | POST | `/listings/{listingId}/submit` | `submitListing` | bearerAuth |
| Listings | POST | `/listings/{listingId}/revision` | `reviseApprovedListing` | bearerAuth |
| Listings | POST | `/listings/{listingId}/price-suggestions` | `requestPriceSuggestion` | bearerAuth |
| Listings | PUT | `/listings/{listingId}/visibility` | `setListingVisibility` | bearerAuth |
| Listings | POST | `/listings/{listingId}/archive` | `archiveListing` | bearerAuth |
| Listing review | GET | `/operations/listings` | `listListingReviewQueue` | bearerAuth |
| User administration | GET | `/operations/users` | `listOperationsUsers` | bearerAuth |
| Listing review | GET | `/operations/listings/{listingId}` | `getListingReview` | bearerAuth |
| Listing review | GET | `/operations/listings/{listingId}/revisions` | `listReviewRevisions` | bearerAuth |
| Listing review | POST | `/operations/listings/{listingId}/decision` | `decideListing` | bearerAuth |
| Listing review | POST | `/operations/listings/{listingId}/remove` | `removeListing` | bearerAuth |
| Media | POST | `/listings/{listingId}/media` | `createListingUpload` | bearerAuth |
| Media | GET | `/me/listings/{listingId}/media` | `listMyListingMedia` | bearerAuth |
| Media | GET | `/me/listings/{listingId}/media/{mediaId}` | `getMyListingMedia` | bearerAuth |
| Media | GET | `/listings/{listingId}/media/{mediaId}/upload-ticket` | `getUploadTicket` | bearerAuth |
| Media | POST | `/listings/{listingId}/media/{mediaId}/finalize` | `finalizeListingUpload` | bearerAuth |
| Media | GET | `/listings/{listingId}/media/{mediaId}/read` | `getPublicListingMedia` | Public |
| Media | GET | `/me/listings/{listingId}/media/{mediaId}/read` | `getMyListingMediaRead` | bearerAuth |
| Media | GET | `/operations/listings/{listingId}/media/{mediaId}/read` | `getReviewMediaRead` | bearerAuth |
| Media | PUT | `/listings/{listingId}/media/{mediaId}/content` | `uploadListingContent` | bearerAuth |
| Addresses | GET | `/service-areas` | `getServiceAreaDirectory` | bearerAuth |
| Wishlist | GET | `/me/wishlist` | `getMyWishlist` | bearerAuth |
| Wishlist | PUT | `/me/wishlist/catalog-books/{bookId}` | `saveBookToWishlist` | bearerAuth |
| Wishlist | DELETE | `/me/wishlist/catalog-books/{bookId}` | `removeBookFromWishlist` | bearerAuth |
| Wishlist | PUT | `/me/wishlist/listings/{listingId}` | `saveListingToWishlist` | bearerAuth |
| Wishlist | DELETE | `/me/wishlist/listings/{listingId}` | `removeListingFromWishlist` | bearerAuth |
| Addresses | GET | `/me/addresses` | `getMyAddressBook` | bearerAuth |
| Addresses | POST | `/me/addresses` | `createMyAddress` | bearerAuth |
| Addresses | PUT | `/me/addresses/{addressId}` | `updateMyAddress` | bearerAuth |
| Addresses | POST | `/me/addresses/{addressId}/default` | `setMyDefaultAddress` | bearerAuth |
| Addresses | POST | `/me/addresses/{addressId}/archive` | `deleteMyAddress` | bearerAuth |
| Quotes | POST | `/listings/{listingId}/quotes` | `createSaleQuote` | bearerAuth |
| Quotes | GET | `/me/quotes/{quoteId}` | `getMySaleQuote` | bearerAuth |
| Orders | POST | `/orders` | `createDirectOrder` | bearerAuth |
| Orders | GET | `/me/orders/{orderId}` | `getMyOrder` | bearerAuth |
| Orders | POST | `/orders/{orderId}/cancel` | `cancelUnpaidOrder` | bearerAuth |
| Orders | GET | `/me/orders/{orderId}/media/{mediaId}/read` | `getMyOrderMedia` | bearerAuth |
| Wallet | GET | `/me/wallet` | `getMyWallet` | bearerAuth |
| Wallet | GET | `/me/topups` | `listMyTopups` | bearerAuth |
| Wallet | POST | `/me/topups` | `createTopupIntent` | bearerAuth |
| Wallet | GET | `/me/topups/{topupId}` | `getMyTopup` | bearerAuth |
| Wallet | GET | `/me/wallet/history` | `listMyWalletHistory` | bearerAuth |
| Wallet | POST | `/operations/simulator/topup-events` | `emitSimulatedTopupEvent` | bearerAuth |
| Orders | GET | `/me/orders` | `listMyOrders` | bearerAuth |
| Orders | POST | `/orders/{orderId}/pay` | `payOrder` | bearerAuth |
| Orders | POST | `/orders/{orderId}/cancel-paid` | `cancelPaidOrder` | bearerAuth |
| Orders | POST | `/orders/{orderId}/reject` | `rejectPaidOrder` | bearerAuth |
| Orders | POST | `/orders/{orderId}/accept` | `acceptOrder` | bearerAuth |
| Orders | POST | `/orders/{orderId}/packaging-evidence` | `createPackagingEvidence` | bearerAuth |
| Orders | PUT | `/orders/{orderId}/packaging-evidence/{evidenceId}/content` | `uploadPackagingEvidence` | bearerAuth |
| Orders | GET | `/me/orders/{orderId}/packaging-evidence` | `listPackagingEvidence` | bearerAuth |
| Orders | GET | `/me/orders/{orderId}/packaging-evidence/{evidenceId}/read` | `readPackagingEvidence` | bearerAuth |
| Orders | POST | `/orders/{orderId}/shipment` | `registerDirectShipment` | bearerAuth |
| Orders | GET | `/me/orders/{orderId}/shipment` | `getMyDirectShipment` | bearerAuth |
| Orders | POST | `/operations/simulator/pickup-events` | `emitSimulatedPickupEvent` | bearerAuth |
| Orders | GET | `/me/orders/{orderId}/shipment/pickup-events` | `listMyPickupEvents` | bearerAuth |
| Orders | POST | `/orders/{orderId}/non-receipt` | `reportOrderNonReceipt` | bearerAuth |
| Auctions | GET | `/handover-points` | `listHandoverPoints` | bearerAuth |
| Auctions | POST | `/auction-intakes` | `createAuctionIntake` | bearerAuth |
| Auctions | GET | `/me/auction-intakes` | `listMyAuctionIntakes` | bearerAuth |
| Auctions | GET | `/me/auction-intakes/{intakeId}` | `getMyAuctionIntake` | bearerAuth |
| Auctions | POST | `/auction-intakes/{intakeId}/cancel` | `cancelAuctionIntake` | bearerAuth |
| Auctions | GET | `/operations/auction-intakes` | `listPointAuctionIntakes` | bearerAuth |
| Auctions | POST | `/operations/auction-intakes/{intakeId}/receive` | `receiveAuctionIntake` | bearerAuth |
| Auctions | POST | `/operations/auction-intakes/{intakeId}/inspect` | `inspectAuctionIntake` | bearerAuth |
| Auctions | POST | `/operations/auction-intakes/{intakeId}/open` | `openAuction` | bearerAuth |
| Auctions | POST | `/operations/auction-intakes/{intakeId}/reclaim` | `reclaimAuctionIntake` | bearerAuth |
| Auctions | POST | `/operations/auctions/{auctionId}/cancel` | `cancelAuction` | bearerAuth |
| Auctions | GET | `/auctions` | `listAuctions` | Public |
| Auctions | GET | `/auctions/{auctionId}` | `getAuction` | Public |
| Auctions | GET | `/me/auctions/{auctionId}/participation` | `getMyAuctionParticipation` | bearerAuth |
| Auctions | POST | `/auctions/{auctionId}/bids` | `placeAuctionBid` | bearerAuth |
| Auctions | PUT | `/auctions/{auctionId}/auto-bid` | `setAuctionAutoBid` | bearerAuth |
| Auctions | POST | `/auctions/{auctionId}/auto-bid/disable` | `disableAuctionAutoBid` | bearerAuth |
| Auctions | GET | `/me/point-orders/{orderId}` | `getMyPointOrder` | bearerAuth |
| Auctions | POST | `/point-orders/{orderId}/pay` | `payPointOrder` | bearerAuth |
| Auctions | POST | `/point-orders/{orderId}/accept-report` | `acceptPointOrderReport` | bearerAuth |
| Auctions | POST | `/point-orders/{orderId}/reject-report` | `rejectPointOrderReport` | bearerAuth |
| Auctions | POST | `/point-orders/{orderId}/claim` | `claimPointOrder` | bearerAuth |
| Auctions | POST | `/point-orders/{orderId}/collection-code` | `requestCollectionCode` | bearerAuth |
| Auctions | GET | `/operations/point-orders` | `listPointCollections` | bearerAuth |
| Auctions | POST | `/operations/point-orders/{orderId}/handover` | `handOverPointOrder` | bearerAuth |
| Auctions | POST | `/operations/point-orders/{orderId}/receive-return` | `receivePointOrderReturn` | bearerAuth |
| Auctions | GET | `/operations/point-order-resolutions` | `listPointOrderResolutions` | bearerAuth |
| Auctions | POST | `/operations/point-orders/{orderId}/resolve` | `resolvePointOrder` | bearerAuth |
| Auctions | POST | `/auctions/{auctionId}/buy-now` | `buyAuctionNow` | bearerAuth |

## 2. Migrations MongoDB

Nguồn: [apps/api/src/database/mongo/migrations/index.ts](../../apps/api/src/database/mongo/migrations/index.ts). Liệt kê source; chưa truy vấn migration nào đã áp dụng ở DB máy này.

| Migration source |
| --- |
| [apps/api/src/database/mongo/migrations/0001-baseline-schema.ts](../../apps/api/src/database/mongo/migrations/0001-baseline-schema.ts) |
| [apps/api/src/database/mongo/migrations/0002-reference-data.ts](../../apps/api/src/database/mongo/migrations/0002-reference-data.ts) |
| [apps/api/src/database/mongo/migrations/0003-catalog-title-key.ts](../../apps/api/src/database/mongo/migrations/0003-catalog-title-key.ts) |
| [apps/api/src/database/mongo/migrations/0004-wishlist.ts](../../apps/api/src/database/mongo/migrations/0004-wishlist.ts) |
| [apps/api/src/database/mongo/migrations/0005-price-assist.ts](../../apps/api/src/database/mongo/migrations/0005-price-assist.ts) |
| [apps/api/src/database/mongo/migrations/0006-price-suggestion-input.ts](../../apps/api/src/database/mongo/migrations/0006-price-suggestion-input.ts) |
| [apps/api/src/database/mongo/migrations/0007-online-price-lookup.ts](../../apps/api/src/database/mongo/migrations/0007-online-price-lookup.ts) |
| [apps/api/src/database/mongo/migrations/0008-auctions.ts](../../apps/api/src/database/mongo/migrations/0008-auctions.ts) |
| [apps/api/src/database/mongo/migrations/0009-point-orders.ts](../../apps/api/src/database/mongo/migrations/0009-point-orders.ts) |
| [apps/api/src/database/mongo/migrations/0010-point-collection.ts](../../apps/api/src/database/mongo/migrations/0010-point-collection.ts) |
| [apps/api/src/database/mongo/migrations/0011-point-order-resolution.ts](../../apps/api/src/database/mongo/migrations/0011-point-order-resolution.ts) |
| [apps/api/src/database/mongo/migrations/0012-point-order-settlement.ts](../../apps/api/src/database/mongo/migrations/0012-point-order-settlement.ts) |
| [apps/api/src/database/mongo/migrations/0013-auction-business-rules.ts](../../apps/api/src/database/mongo/migrations/0013-auction-business-rules.ts) |
| [apps/api/src/database/mongo/migrations/0014-purchase-conversations.ts](../../apps/api/src/database/mongo/migrations/0014-purchase-conversations.ts) |
| [apps/api/src/database/mongo/migrations/0015-member-notifications.ts](../../apps/api/src/database/mongo/migrations/0015-member-notifications.ts) |

## 3. Collections được type trong source

Nguồn: [apps/api/src/database/mongo/collections.ts](../../apps/api/src/database/mongo/collections.ts); 70 tên. Quyền/validator/index lấy từ migration hiện hành và bootstrap, không suy từ type.

- `account_locks`
- `address_books`
- `address_identities`
- `agreement_snapshots`
- `auction_bidders`
- `auction_bids`
- `auction_intakes`
- `auctions`
- `audit_events`
- `auth_sessions`
- `carrier_pickup_events`
- `carrier_pickup_reviews`
- `catalog_books`
- `catalog_decisions`
- `catalog_revisions`
- `collection_attempts`
- `collection_codes`
- `command_locks`
- `commitment_events`
- `counters`
- `direct_orders`
- `direct_shipments`
- `exclusive_commitments`
- `handover_points`
- `ledger_entries`
- `ledger_journals`
- `listing_decisions`
- `listing_media`
- `listing_revisions`
- `listings`
- `login_attempts`
- `media_processing_jobs`
- `member_addresses`
- `member_notifications`
- `member_violations`
- `mutation_receipts`
- `online_price_offers`
- `order_delivery_reviews`
- `order_non_receipt_reports`
- `order_packaging_evidence`
- `order_preparations`
- `outbox_events`
- `pickup_reviews`
- `point_handovers`
- `point_order_claims`
- `point_order_resolutions`
- `point_orders`
- `point_returns`
- `point_slots`
- `point_staff_assignments`
- `price_assist_usage`
- `price_lookups`
- `price_references`
- `price_suggestions`
- `purchase_conversations`
- `purchase_messages`
- `revision_media`
- `sale_quote_policies`
- `sale_quote_policy_selection`
- `sale_quotes`
- `service_areas`
- `service_localities`
- `shipment_packaging_evidence`
- `simulated_payment_events`
- `topup_intents`
- `users`
- `wallet_accounts`
- `wishlist_items`
- `workflow_contexts`
- `workflow_items`

## 4. Module API và entrypoint

| Module | Thư mục |
| --- | --- |
| addresses | `apps/api/src/modules/addresses` |
| auctions | `apps/api/src/modules/auctions` |
| auth | `apps/api/src/modules/auth` |
| catalog | `apps/api/src/modules/catalog` |
| commands | `apps/api/src/modules/commands` |
| listings | `apps/api/src/modules/listings` |
| media | `apps/api/src/modules/media` |
| notifications | `apps/api/src/modules/notifications` |
| orders | `apps/api/src/modules/orders` |
| price-assist | `apps/api/src/modules/price-assist` |
| purchases | `apps/api/src/modules/purchases` |
| quotes | `apps/api/src/modules/quotes` |
| reservations | `apps/api/src/modules/reservations` |
| shipments | `apps/api/src/modules/shipments` |
| users | `apps/api/src/modules/users` |
| wallet | `apps/api/src/modules/wallet` |
| wishlist | `apps/api/src/modules/wishlist` |

Entrypoint: [apps/api/src/app.module.ts](../../apps/api/src/app.module.ts), [apps/api/src/main.ts](../../apps/api/src/main.ts), [apps/api/src/media-worker.ts](../../apps/api/src/media-worker.ts), [apps/api/src/order-worker.ts](../../apps/api/src/order-worker.ts).

## 5. Lệnh có thật trong package.json

Đây là danh mục lệnh, không phải yêu cầu chạy tất cả. Chọn kiểm tra theo diff và AI_WORKFLOW. Lệnh deploy/DB/demo cần đúng phạm vi và môi trường.

### used-book-marketplace

[package.json](../../package.json)

| Script | Nội dung source |
| --- | --- |
| `demo:books` | `node scripts/demo-books.mjs` |
| `demo:funding` | `node scripts/demo-funding.mjs` |
| `demo:orders` | `node scripts/demo-orders.mjs` |
| `test:demo:orders` | `node scripts/test-demo-orders.mjs` |
| `test:demo:transit` | `node scripts/test-demo-transit.mjs` |
| `test:demo` | `node --test scripts/demo/*.test.mjs` |
| `test:demo:api` | `node scripts/test-demo-books.mjs` |
| `test:demo:funding` | `node scripts/test-demo-funding.mjs` |
| `docs:check` | `node scripts/check-agent-docs.mjs` |
| `setup:local` | `node scripts/setup-local.mjs` |
| `doctor:local` | `pnpm --filter @used-books/api doctor:local` |
| `build:android` | `node scripts/build-android.mjs` |
| `brand:app-icons` | `node scripts/render-app-icons.mjs` |
| `contract:generate` | `pnpm --filter @used-books/api-contract generate` |
| `contract:check` | `pnpm --filter @used-books/api-contract check` |
| `contract:routes` | `node scripts/check-api-routes.mjs` |
| `db:bootstrap` | `pnpm --filter @used-books/api mongo:bootstrap` |
| `db:migrate` | `pnpm --filter @used-books/api mongo:migrate` |
| `db:seed` | `pnpm --filter @used-books/api mongo:seed` |
| `test:api:e2e` | `pnpm --filter @used-books/api test:e2e` |
| `infra:test:up` | `docker compose -f infra/docker-compose.test.yml up -d --wait` |
| `infra:test:stop` | `docker compose -f infra/docker-compose.test.yml stop` |
| `infra:mongo:test:up` | `docker compose -f infra/docker-compose.mongo-test.yml up -d --wait mongo-test` |
| `infra:mongo:failover:up` | `docker compose -f infra/docker-compose.mongo-test.yml --profile failover up -d --wait mongo-failover` |
| `infra:mongo:test:stop` | `docker compose -f infra/docker-compose.mongo-test.yml --profile failover stop` |
| `test:api:mongo` | `pnpm --filter @used-books/api test:mongo` |
| `test:public:browser` | `node scripts/test-public-shelf.mjs` |
| `dev:api` | `node scripts/dev-api.mjs` |
| `dev:media` | `pnpm --filter @used-books/api worker:media` |
| `dev:admin` | `pnpm --filter @used-books/admin-web dev` |
| `dev:rn` | `node scripts/dev-rn.mjs` |
| `dev:user` | `pnpm --filter @used-books/user-web dev` |
| `test:dev` | `node --test scripts/dev-*.test.mjs` |
| `build` | `pnpm -r --if-present run build` |
| `lint` | `pnpm -r --if-present run lint` |
| `typecheck` | `pnpm -r --if-present run typecheck` |
| `test` | `pnpm -r --if-present run test` |
| `infra:up` | `docker compose --env-file .env -f infra/docker-compose.yml up -d` |
| `infra:down` | `docker compose --env-file .env -f infra/docker-compose.yml down` |
| `infra:logs` | `docker compose --env-file .env -f infra/docker-compose.yml logs -f` |
| `dev:orders` | `pnpm --filter @used-books/api worker:orders` |

### @used-books/api

[apps/api/package.json](../../apps/api/package.json)

| Script | Nội dung source |
| --- | --- |
| `build` | `nest build` |
| `deploy` | `nest deploy` |
| `format` | `prettier --write "src/**/*.ts" "test/**/*.ts"` |
| `start` | `nest start` |
| `start:dev` | `nest start --watch` |
| `worker:media` | `nest start --entryFile media-worker` |
| `media:check` | `tsx src/media-check.ts` |
| `media:probe` | `tsx src/media-check.ts --probe` |
| `doctor:local` | `tsx src/local-check.ts` |
| `worker:media:prod` | `node dist/media-worker.js` |
| `start:debug` | `nest start --debug --watch` |
| `start:prod` | `node dist/main` |
| `lint` | `oxlint src/ test/` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:cov` | `vitest run --coverage` |
| `test:debug` | `vitest --inspect-brk --no-file-parallelism` |
| `test:e2e` | `vitest run --config ./vitest.config.e2e.ts` |
| `test:mongo` | `vitest run --config ./vitest.config.mongo.ts` |
| `worker:orders` | `nest start --entryFile order-worker` |
| `worker:orders:prod` | `node dist/order-worker.js` |
| `wallet:check` | `node dist/wallet-check.js` |
| `mongo:bootstrap` | `tsx src/mongo-bootstrap.ts` |
| `mongo:migrate` | `tsx src/mongo-migrate.ts` |
| `mongo:seed` | `tsx src/mongo-seed.ts` |
| `price-refs:import` | `tsx src/price-refs-import.ts` |
| `eval:price` | `tsx eval/price-assist/run.ts` |
| `mongo:check` | `node dist/mongo-check.js` |
| `mongo:import-postgres` | `tsx src/mongo-import-postgres.ts` |

### @used-books/user-web

[apps/user-web/package.json](../../apps/user-web/package.json)

| Script | Nội dung source |
| --- | --- |
| `dev` | `vite --port 5174` |
| `build` | `tsc -b && vite build` |
| `lint` | `oxlint` |
| `typecheck` | `tsc -b --pretty false` |
| `preview` | `vite preview --port 4174` |
| `test` | `vitest run` |
| `test:browser` | `node tests/integration.mjs` |

### @used-books/admin-web

[apps/admin-web/package.json](../../apps/admin-web/package.json)

| Script | Nội dung source |
| --- | --- |
| `dev` | `vite` |
| `build` | `tsc -b && vite build` |
| `lint` | `oxlint` |
| `typecheck` | `tsc -b --pretty false` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:browser` | `node tests/browser.mjs` |

### @used-books/mobile-react-native

[apps/mobile-react-native/package.json](../../apps/mobile-react-native/package.json)

| Script | Nội dung source |
| --- | --- |
| `start` | `expo start` |
| `android` | `expo run:android` |
| `ios` | `expo run:ios` |
| `web` | `expo start --web` |
| `lint` | `expo lint` |
| `test` | `vitest run` |
| `export:web` | `expo export --platform web --clear` |
| `export:all` | `expo export --platform all --clear` |
| `typecheck` | `tsc --noEmit` |

### @used-books/api-contract

[packages/api-contract/package.json](../../packages/api-contract/package.json)

| Script | Nội dung source |
| --- | --- |
| `generate` | `node scripts/generate.mjs` |
| `check` | `node scripts/generate.mjs --check` |

### @used-books/session-client

[packages/session-client/package.json](../../packages/session-client/package.json)

| Script | Nội dung source |
| --- | --- |
| `test` | `vitest run` |

## 6. Test source và CI

Test file có sẵn không chứng minh kết quả thực chạy. CI remote tại source này chưa được xác minh trong phiên thu thập.

### apps/api/test/ — 11 file spec/test TypeScript

- [apps/api/test/image-processor.spec.ts](../../apps/api/test/image-processor.spec.ts)
- [apps/api/test/listing-contract.spec.ts](../../apps/api/test/listing-contract.spec.ts)
- [apps/api/test/media-storage.spec.ts](../../apps/api/test/media-storage.spec.ts)
- [apps/api/test/mongo/failover-probe.mongo-spec.ts](../../apps/api/test/mongo/failover-probe.mongo-spec.ts)
- [apps/api/test/mongo/keyset.mongo-spec.ts](../../apps/api/test/mongo/keyset.mongo-spec.ts)
- [apps/api/test/mongo/ledger-integrity.mongo-spec.ts](../../apps/api/test/mongo/ledger-integrity.mongo-spec.ts)
- [apps/api/test/mongo/postgres-import.mongo-spec.ts](../../apps/api/test/mongo/postgres-import.mongo-spec.ts)
- [apps/api/test/mongo/schema.mongo-spec.ts](../../apps/api/test/mongo/schema.mongo-spec.ts)
- [apps/api/test/mongo/transaction-probe.mongo-spec.ts](../../apps/api/test/mongo/transaction-probe.mongo-spec.ts)
- [apps/api/test/quote-money.spec.ts](../../apps/api/test/quote-money.spec.ts)
- [apps/api/test/wallet-config.spec.ts](../../apps/api/test/wallet-config.spec.ts)

### apps/api/src/ — 12 file spec/test TypeScript

- [apps/api/src/app.controller.spec.ts](../../apps/api/src/app.controller.spec.ts)
- [apps/api/src/config/environment.spec.ts](../../apps/api/src/config/environment.spec.ts)
- [apps/api/src/modules/auctions/auction-engine.spec.ts](../../apps/api/src/modules/auctions/auction-engine.spec.ts)
- [apps/api/src/modules/auctions/auction-live.spec.ts](../../apps/api/src/modules/auctions/auction-live.spec.ts)
- [apps/api/src/modules/auctions/auction-worker.spec.ts](../../apps/api/src/modules/auctions/auction-worker.spec.ts)
- [apps/api/src/modules/auctions/point-hours.spec.ts](../../apps/api/src/modules/auctions/point-hours.spec.ts)
- [apps/api/src/modules/auctions/system-key.spec.ts](../../apps/api/src/modules/auctions/system-key.spec.ts)
- [apps/api/src/modules/price-assist/evidence.spec.ts](../../apps/api/src/modules/price-assist/evidence.spec.ts)
- [apps/api/src/modules/price-assist/online/page-check.spec.ts](../../apps/api/src/modules/price-assist/online/page-check.spec.ts)
- [apps/api/src/modules/price-assist/online/price-finder.spec.ts](../../apps/api/src/modules/price-assist/online/price-finder.spec.ts)
- [apps/api/src/modules/price-assist/price-model.spec.ts](../../apps/api/src/modules/price-assist/price-model.spec.ts)
- [apps/api/src/modules/wishlist/wishlist.service.spec.ts](../../apps/api/src/modules/wishlist/wishlist.service.spec.ts)

### apps/user-web/ — 3 file spec/test TypeScript

- [apps/user-web/src/lib/utils.test.ts](../../apps/user-web/src/lib/utils.test.ts)
- [apps/user-web/src/services/auctions.test.ts](../../apps/user-web/src/services/auctions.test.ts)
- [apps/user-web/src/services/listing-submission.test.ts](../../apps/user-web/src/services/listing-submission.test.ts)

### apps/admin-web/ — 3 file spec/test TypeScript

- [apps/admin-web/src/core/session.test.ts](../../apps/admin-web/src/core/session.test.ts)
- [apps/admin-web/src/features/review/decision-command.test.ts](../../apps/admin-web/src/features/review/decision-command.test.ts)
- [apps/admin-web/src/features/review/price-assist-view.test.tsx](../../apps/admin-web/src/features/review/price-assist-view.test.tsx)

### apps/mobile-react-native/ — 16 file spec/test TypeScript

- [apps/mobile-react-native/src/core/api/api-base-url.test.ts](../../apps/mobile-react-native/src/core/api/api-base-url.test.ts)
- [apps/mobile-react-native/src/core/ui/error-presentation.test.ts](../../apps/mobile-react-native/src/core/ui/error-presentation.test.ts)
- [apps/mobile-react-native/src/core/ui/format.test.ts](../../apps/mobile-react-native/src/core/ui/format.test.ts)
- [apps/mobile-react-native/src/core/ui/motion-preference.test.ts](../../apps/mobile-react-native/src/core/ui/motion-preference.test.ts)
- [apps/mobile-react-native/src/core/ui/theme.test.ts](../../apps/mobile-react-native/src/core/ui/theme.test.ts)
- [apps/mobile-react-native/src/features/addresses/address-command.test.ts](../../apps/mobile-react-native/src/features/addresses/address-command.test.ts)
- [apps/mobile-react-native/src/features/design-preview/model.test.ts](../../apps/mobile-react-native/src/features/design-preview/model.test.ts)
- [apps/mobile-react-native/src/features/drafts/book-condition.test.ts](../../apps/mobile-react-native/src/features/drafts/book-condition.test.ts)
- [apps/mobile-react-native/src/features/drafts/lifecycle-command.test.ts](../../apps/mobile-react-native/src/features/drafts/lifecycle-command.test.ts)
- [apps/mobile-react-native/src/features/drafts/listing-command.test.ts](../../apps/mobile-react-native/src/features/drafts/listing-command.test.ts)
- [apps/mobile-react-native/src/features/drafts/listing-form.test.ts](../../apps/mobile-react-native/src/features/drafts/listing-form.test.ts)
- [apps/mobile-react-native/src/features/drafts/price-assist.test.ts](../../apps/mobile-react-native/src/features/drafts/price-assist.test.ts)
- [apps/mobile-react-native/src/features/drafts/upload.test.ts](../../apps/mobile-react-native/src/features/drafts/upload.test.ts)
- [apps/mobile-react-native/src/features/shelf/filters.test.ts](../../apps/mobile-react-native/src/features/shelf/filters.test.ts)
- [apps/mobile-react-native/src/features/wallet/wallet-model.test.ts](../../apps/mobile-react-native/src/features/wallet/wallet-model.test.ts)
- [apps/mobile-react-native/src/features/wishlist/wishlist-model.test.ts](../../apps/mobile-react-native/src/features/wishlist/wishlist-model.test.ts)

### packages/session-client/ — 2 file spec/test TypeScript

- [packages/session-client/src/public-request.test.ts](../../packages/session-client/src/public-request.test.ts)
- [packages/session-client/src/session-client.test.ts](../../packages/session-client/src/session-client.test.ts)

| Workflow source |
| --- |
| [.github/workflows/admin-web-ci.yml](../../.github/workflows/admin-web-ci.yml) |
| [.github/workflows/api-ci.yml](../../.github/workflows/api-ci.yml) |
| [.github/workflows/demo-ci.yml](../../.github/workflows/demo-ci.yml) |
| [.github/workflows/developer-ci.yml](../../.github/workflows/developer-ci.yml) |
| [.github/workflows/docs-ci.yml](../../.github/workflows/docs-ci.yml) |
| [.github/workflows/flutter-ci.yml](../../.github/workflows/flutter-ci.yml) |
| [.github/workflows/infrastructure-ci.yml](../../.github/workflows/infrastructure-ci.yml) |
| [.github/workflows/operations-ci.yml](../../.github/workflows/operations-ci.yml) |
| [.github/workflows/react-native-ci.yml](../../.github/workflows/react-native-ci.yml) |

Không có workflow riêng tham chiếu `apps/user-web`/`@used-books/user-web` ở snapshot này; xem ma trận CI trong context chính. Browser harness bổ sung: [apps/user-web/tests/integration.mjs](../../apps/user-web/tests/integration.mjs), [apps/admin-web/tests/browser.mjs](../../apps/admin-web/tests/browser.mjs), [scripts/test-public-shelf.mjs](../../scripts/test-public-shelf.mjs).

## 7. Biến cấu hình — chỉ tên

Chỉ trích tên biến từ `.env.example` tracked. Không chứa giá trị, password, token hoặc cấu hình đang dùng. Có tên biến không có nghĩa cấu hình đã đầy đủ/đã bật.

### .env.example

[.env.example](../../.env.example)

`NODE_ENV`, `PORT`, `MONGO_PORT`, `MONGO_ROOT_PASSWORD`, `POSTGRES_PORT`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `MAIL_HOST`, `MAIL_PORT`

### apps/admin-web/.env.example

[apps/admin-web/.env.example](../../apps/admin-web/.env.example)

`VITE_API_BASE_URL`

### apps/api/.env.example

[apps/api/.env.example](../../apps/api/.env.example)

`NODE_ENV`, `PORT`, `CORS_ORIGINS`, `MONGODB_URL`, `MONGODB_MIGRATOR_URL`, `MONGODB_ADMIN_URL`, `MONGODB_DATABASE`, `MONGODB_APP_PASSWORD`, `MONGODB_MIGRATOR_PASSWORD`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `DEV_SEED_PASSWORD`, `SUPABASE_URL`, `SUPABASE_STORAGE_KEY`, `SUPABASE_MEDIA_BUCKET`, `MEDIA_STORAGE_BUDGET_BYTES`, `PAYMENT_SIMULATOR_SECRET`, `PRICE_ASSIST_ENABLED`, `PRICE_ASSIST_API_KEY`, `PRICE_ASSIST_PROVIDER`, `PRICE_ASSIST_MODEL`, `PRICE_ASSIST_EFFORT`, `PRICE_ASSIST_TIMEOUT_MS`, `PRICE_ASSIST_USER_DAILY_LIMIT`, `PRICE_ASSIST_DAILY_BUDGET_USD`, `PRICE_LOOKUP_ENABLED`, `PRICE_LOOKUP_SHOPS`, `PRICE_LOOKUP_TTL_DAYS`, `PRICE_LOOKUP_DAILY_LIMIT`, `PRICE_LOOKUP_SEARCH_USD`

### apps/mobile-flutter/.env.example

[apps/mobile-flutter/.env.example](../../apps/mobile-flutter/.env.example)

`API_BASE_URL`

### apps/mobile-react-native/.env.example

[apps/mobile-react-native/.env.example](../../apps/mobile-react-native/.env.example)

`EXPO_PUBLIC_API_BASE_URL`

### apps/user-web/.env.example

[apps/user-web/.env.example](../../apps/user-web/.env.example)

`VITE_API_BASE_URL`

## 8. ADR index

Tên và mốc trong ADR có thể cũ hơn code; xem mục khác biệt trong PROJECT_CONTEXT trước suy trạng thái.

| ADR | Tiêu đề source |
| --- | --- |
| [docs/adr/0001-modular-monolith.md](../../docs/adr/0001-modular-monolith.md) | ADR 0001: Modular monolith |
| [docs/adr/0002-api-first-clients.md](../../docs/adr/0002-api-first-clients.md) | ADR 0002: API-first client development |
| [docs/adr/0003-react-native-auth-foundation.md](../../docs/adr/0003-react-native-auth-foundation.md) | ADR 0003: React Native first and shared authentication foundation |
| [docs/adr/0004-react-native-ui-foundation.md](../../docs/adr/0004-react-native-ui-foundation.md) | ADR 0004: React Native UI foundation |
| [docs/adr/0005-listing-contract-and-storage.md](../../docs/adr/0005-listing-contract-and-storage.md) | ADR 0005: Versioned listing contract and PostgreSQL invariants |
| [docs/adr/0006-catalog-draft-commands.md](../../docs/adr/0006-catalog-draft-commands.md) | ADR 0006: Transactional catalog and draft commands |
| [docs/adr/0007-hcm-handover-auction-scope.md](../../docs/adr/0007-hcm-handover-auction-scope.md) | ADR 0007: TP.HCM, managed handover points and bounded auctions |
| [docs/adr/0008-free-private-media-storage.md](../../docs/adr/0008-free-private-media-storage.md) | ADR 0008: Free private media storage and bounded API uploads |
| [docs/adr/0009-listing-submission-moderation.md](../../docs/adr/0009-listing-submission-moderation.md) | ADR 0009: Listing submission and independent moderation |
| [docs/adr/0010-operations-review-client.md](../../docs/adr/0010-operations-review-client.md) | ADR 0010: Operations review client and shared session transport |
| [docs/adr/0011-public-shelf.md](../../docs/adr/0011-public-shelf.md) | ADR 0011 — Public shelf and separate image authorization |
| [docs/adr/0012-listing-lifecycle.md](../../docs/adr/0012-listing-lifecycle.md) | ADR 0012 — Listing lifecycle after approval |
| [docs/adr/0013-exclusive-commitment-foundation.md](../../docs/adr/0013-exclusive-commitment-foundation.md) | ADR 0013: Shared exclusive commitments before transaction workflows |
| [docs/adr/0014-member-address-book.md](../../docs/adr/0014-member-address-book.md) | ADR 0014: Private address book and demo service areas |
| [docs/adr/0015-listing-delivery-origin.md](../../docs/adr/0015-listing-delivery-origin.md) | ADR 0015: Revision-bound delivery origins |
| [docs/adr/0016-direct-sale-quotes.md](../../docs/adr/0016-direct-sale-quotes.md) | ADR 0016: Immutable DirectDelivery sale estimates |
| [docs/adr/0017-unpaid-direct-orders.md](../../docs/adr/0017-unpaid-direct-orders.md) | ADR 0017: Unpaid direct Orders and exclusive commitments |
| [docs/adr/0018-simulated-wallet-ledger.md](../../docs/adr/0018-simulated-wallet-ledger.md) | ADR 0018: Finite simulated funding and an immutable VND ledger |
| [docs/adr/0019-locked-existing-obligations.md](../../docs/adr/0019-locked-existing-obligations.md) | ADR 0019: Explicit existing-obligation access for locked accounts |
| [docs/adr/0020-order-wallet-payment.md](../../docs/adr/0020-order-wallet-payment.md) | ADR 0020: Order wallet holds and pre-confirmation refunds |
| [docs/adr/0021-order-preparation.md](../../docs/adr/0021-order-preparation.md) | ADR 0021: Seller acceptance and pickup verification deadline |
| [docs/adr/0022-order-packaging-evidence.md](../../docs/adr/0022-order-packaging-evidence.md) | ADR 0022: Private packaging images belong to the accepted Order |
| [docs/adr/0023-direct-shipment-registration.md](../../docs/adr/0023-direct-shipment-registration.md) | ADR 0023: Register a DirectDelivery outbound label with pinned packaging evidence |
| [docs/adr/0024-carrier-pickup.md](../../docs/adr/0024-carrier-pickup.md) | ADR 0024: Independent simulated carrier pickup and durable exception evidence |
| [docs/adr/0025-delivery-overdue.md](../../docs/adr/0025-delivery-overdue.md) | ADR 0025: Durable delivery-overdue review and Buyer non-receipt intake |
| [docs/adr/0026-delivery-receipt-inspection.md](../../docs/adr/0026-delivery-receipt-inspection.md) | ADR 0026: Delivered, Buyer receipt and inspection window (DirectDelivery Order) |
| [docs/adr/0027-mongodb-persistence-protocol.md](../../docs/adr/0027-mongodb-persistence-protocol.md) | ADR 0027: MongoDB persistence library and transaction protocol |
| [docs/adr/0028-listing-price-assistant.md](../../docs/adr/0028-listing-price-assistant.md) | ADR 0028: Trợ lý gợi ý giá bán khi đăng sách |
| [docs/adr/0029-online-price-lookup.md](../../docs/adr/0029-online-price-lookup.md) | ADR 0029: Tra giá sách mới trên nhà sách trực tuyến cho trợ lý gợi ý giá |
| [docs/adr/0030-bounded-auction-backend.md](../../docs/adr/0030-bounded-auction-backend.md) | ADR 0030: Bounded auction backend |
| [docs/adr/0031-live-auction-updates.md](../../docs/adr/0031-live-auction-updates.md) | ADR 0031: Live auction updates over WebSocket |
| [docs/adr/0032-member-notification-inbox.md](../../docs/adr/0032-member-notification-inbox.md) | ADR 0032: Durable member notification inbox (auction events) |

## 9. Tài liệu bổ sung

Danh mục đầy đủ tài liệu/artefact: [CATALOG](../CATALOG.md), [docs README](../README.md), [artifact manifest](../artifact-manifest.json). Snapshot SRS 1.0 và các báo cáo HISTORY được giữ để truy vết; đọc SRS 1.1/phụ lục và source hiện hành trước triển khai.
