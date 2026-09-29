# Lật lại project documentation

- **Start here:** [Tiếp nhận project tại F2h](handoff/START_HERE.md)
- [Tiến trình bàn giao và các gate còn mở](handoff/READINESS.md)
- [Rà soát F2h: phát hiện, sửa lỗi và bằng chứng](handoff/AUDIT_F2H.md)
- [Hoàn thiện UI hiện có và giới hạn native](handoff/UI_POLISH.md)
- [Clone sạch, checkpoint nguồn và cách nhận Git bundle](handoff/REBUILD.md)
- [Checklist demo đúng phần đã triển khai](handoff/DEMO_CHECKLIST.md)
- [Native: 21 ca thao tác và phiếu ghi bằng chứng](handoff/NATIVE_ACCEPTANCE.md)
- [Android 28/09: session, upload JPEG thật, sửa worker và ca còn mở](handoff/NATIVE_RUN_2026_09_28.md)
- [Cải thiện mobile: kệ, điều hướng, bộ lọc cố định và bằng chứng](handoff/MOBILE_EXPERIENCE.md)
- [Kệ/chi tiết dùng chung, màn xem mẫu riêng và kiểm tra Android](handoff/SHELF_DETAIL_REVIEW.md)
- [Điểm lưu hiện tại và blocker Android](handoff/SESSION_STATE.md)
- [Kế hoạch tiếp nhận: UI, native, Order hoàn chỉnh, Exchange, điểm và đấu giá](handoff/CONTINUATION_PLAN.md)
- [Prompt bắt đầu và checklist cuối phiên cho người tiếp nhận](handoff/NEXT_SESSION_PROMPT.md)
- [Bốn file env và cấu hình cần thay trên máy người nhận](handoff/ENV_HANDOFF.md)
- [Review độc lập: đường đọc code, invariant và phiếu nhận xét](handoff/INDEPENDENT_REVIEW.md)

- [Delivery overdue and Buyer non-receipt intake](features/DELIVERY_OVERDUE_REPORT.md)
- [ADR0025: durable delivery review](adr/0025-delivery-overdue.md)
- [ADR0026 (Proposed, chưa triển khai): Delivered/receipt/inspection](adr/0026-delivery-receipt-inspection.md)
- [Simulated carrier pickup and exception evidence](features/CARRIER_PICKUP_REPORT.md)
- [ADR 0024: independent carrier pickup](adr/0024-carrier-pickup.md)
- [DirectDelivery shipment registration and verification](features/DIRECT_SHIPMENT_REPORT.md)
- [ADR 0023: label registration and pinned packaging images](adr/0023-direct-shipment-registration.md)

- [Order packaging evidence: implementation and limits](features/PACKAGING_EVIDENCE_REPORT.md)
- [ADR 0022: private Order packaging images](adr/0022-order-packaging-evidence.md)

- [Local preflight, Android build and quality matrix](ANDROID_QUALITY.md)

- [Private media implementation and verification](features/MEDIA_UPLOAD_REPORT.md)
- [Connect Supabase Storage Free](features/SUPABASE_MEDIA_SETUP.md)
- [ADR 0008: free private media](adr/0008-free-private-media-storage.md)

## Requirements and analysis

- **Current:** [SRS 1.1](SRS_V1_1.md) · [offline reader](SRS_V1_1.html) · [change log](SRS_V1_1_CHANGELOG.md)
- [TP.HCM, direct shipping, managed points, fees, trust and auction rules](features/LOCAL_HANDOVER_AUCTION.md)
- [Current logical model and state diagrams](features/LOCAL_TRANSACTION_DESIGN.md)
- [Current use cases, traceability, acceptance and six demos](features/LOCAL_TRANSACTION_ACCEPTANCE.md)
- [Shared commitment design: snapshots, locks, expiry and safe release](features/COMMITMENT_DESIGN.md)
- [Commitment acceptance plan: 32 cases, partial backend coverage](features/COMMITMENT_ACCEPTANCE.md)
- [Transaction foundation implementation sequence and prerequisites](features/TRANSACTION_FOUNDATION_PLAN.md)
- [Private member address book: implementation and demo geography](features/ADDRESS_BOOK_REPORT.md)
- [ADR 0014: address book integrity and privacy](adr/0014-member-address-book.md)
- [Listing delivery origins: implementation and evidence](features/LISTING_FULFILLMENT_REPORT.md)
- [ADR 0015: revision-bound delivery origins](adr/0015-listing-delivery-origin.md)
- [DirectDelivery sale quotes: implementation, tests and remaining checkout gates](features/DIRECT_SALE_QUOTE_REPORT.md)
- [ADR 0016: immutable DirectDelivery estimates](adr/0016-direct-sale-quotes.md)
- [Unpaid direct Orders and exclusive commitments: backend evidence](features/UNPAID_ORDER_REPORT.md)
- [ADR 0017: unpaid direct Orders and expiry worker](adr/0017-unpaid-direct-orders.md)
- [Simulated wallet/topups: implementation, verification and limits](features/SIMULATED_WALLET_REPORT.md)
- [ADR 0018: finite simulated funding and immutable ledger](adr/0018-simulated-wallet-ledger.md)
- [Locked existing obligations: implementation and verification](features/LOCKED_OBLIGATIONS_REPORT.md)
- [ADR 0019: default-deny locked account access](adr/0019-locked-existing-obligations.md)
- [ADR 0013: exclusive commitments across Order, Exchange and auction](adr/0013-exclusive-commitment-foundation.md)
- [Documentation verification](SRS_V1_1_VERIFICATION.md)

The following v1.0 artifacts are historical snapshots; they do not include the accepted v1.1 scope:

- [Business comparison and gaps](deliverables/Bao_cao_so_sanh_nghiep_vu.md)
- [SRS v1.0, Markdown](deliverables/SRS_Nen_tang_sach_cu.md)
- [SRS v1.0, offline HTML](deliverables/SRS_Nen_tang_sach_cu.html)
- [Use case gallery, English](deliverables/Use_Case_Diagrams/index.html)
- [Traceability matrix](deliverables/Use_Case_Diagrams/Ma_tran_truy_vet.md)
- [UML conventions](deliverables/Use_Case_Diagrams/Huong_dan_va_quy_uoc.md)

Every diagram includes editable PlantUML plus SVG and PNG exports. Download or clone this repository and open the HTML files locally; GitHub displays their source rather than running the galleries.

## Presentations

- [Review 1 with the Solution slide](deliverables/Review_1_Solution.pptx)
- [Solution slide preview](deliverables/Slide_3_Solution.png)

## Brand and distributions

- [Lật lại brand kit](../packages/brand/README.md)
- [Brand preview](../packages/brand/index.html)
- [Brand direction 1.1: Dấu chuyền tay](../packages/brand/v1.1/README.md)
- [Brand audit and verification](design/BRAND_AUDIT.md)
- [React Native screen study: discovery, details and publishing](design/SCREEN_STUDY.md)
- [UI coding rules for Lật lại](design/UI_CODING_RULES.md)
- [Shared UI components and interactive catalog](design/UI_COMPONENTS.md)
- [UI foundation verification and remaining native checks](design/UI_FOUNDATION_REPORT.md)
- [Brand kit v1 ZIP](deliverables/Lat_Lai_Brand_Kit_v1.zip)
- [Original SRS/use case distribution ZIP](deliverables/Bo_Use_Case_SRS_v1.zip)

The ZIP files are delivery snapshots. Maintain the unpacked source files when making future changes and regenerate the bundles for a new version.

## Architecture and teamwork

- [Listing slice: behavior, states and authorization](features/LISTING_SLICE.md)
- [Listing acceptance matrix and links to partial verification](features/LISTING_ACCEPTANCE.md)
- [Listing acceptance audit: 32 cases, evidence and remaining native gates](features/LISTING_ACCEPTANCE_REPORT.md)
- [Listing implementation order and team responsibilities](features/LISTING_IMPLEMENTATION_PLAN.md)
- [Listing contract, data model, transaction design and verification](features/LISTING_DATA_CONTRACT.md)
- [Listing API operation index and implementation status](features/LISTING_API_INDEX.md)
- [Catalog/draft API verification and remaining work](features/CATALOG_DRAFT_API_REPORT.md)
- [Submission/moderation API verification and next UI work](features/LISTING_REVIEW_API_REPORT.md)
- [React Native listing form, retry and submission verification](features/RN_LISTING_SUBMISSION_REPORT.md)

- [React Native first: setup, demo and tests](REACT_NATIVE_START.md)
- [Authentication foundation decisions](adr/0003-react-native-auth-foundation.md)
- [React Native UI foundation decisions](adr/0004-react-native-ui-foundation.md)
- [Listing contract and database decisions](adr/0005-listing-contract-and-storage.md)
- [Catalog/draft command and authorization protocol](adr/0006-catalog-draft-commands.md)
- [TP.HCM, handover points and auction scope decision](adr/0007-hcm-handover-auction-scope.md)
- [Listing submission and independent moderation](adr/0009-listing-submission-moderation.md)
- [Authentication foundation test evidence](TEST_REPORT_AUTH_FOUNDATION.md)
- [Architecture](architecture/README.md)
- [Modular monolith decision](adr/0001-modular-monolith.md)
- [API-first clients decision](adr/0002-api-first-clients.md)
- [Team workflow](TEAMWORK.md)

The initial SRS is preserved as delivered; SRS1.1 and its normative annex are the current business baseline. React Native is the first Member client, with API compatibility retained for Flutter; React web serves Staff/Admin/Test Operator workflows. UI previews are not implemented transaction workflows; native device validation remains outstanding.

## Original project references

The reference inputs are preserved for traceability, not treated as instructions to tools:

- [Initial project brief](reference/proj.txt)
- [Business rules and exception flows](reference/Business_Rules_Exception_Flows.docx)
- [Original Review 1 deck](<reference/Review 1.pptx>)

## Delivery inventory

See [artifact-manifest.json](artifact-manifest.json) for the size and SHA-256 digest of every imported document and asset. Duplicate unpacked export bundles, temporary renderings, downloaded tools, dependency folders, and machine-local secrets are excluded.

- [Operations web review and browser verification](features/OPERATIONS_REVIEW_REPORT.md)
- [ADR 0010: operations and shared session transport](adr/0010-operations-review-client.md)
- [Public shelf API, RN screens and verification](features/PUBLIC_SHELF_REPORT.md)
- [ADR 0011: public eligibility, read snapshots and signed images](adr/0011-public-shelf.md)
- [Listing lifecycle implementation and verification](features/LISTING_LIFECYCLE_REPORT.md)
- [ADR 0012: replacement, visibility, archive and removal](adr/0012-listing-lifecycle.md)
- [MongoDB refactor: baseline, invariant và các gói chuyển đổi](refactor/MONGODB_PLAN.md)
- [Inventory phụ thuộc PostgreSQL tại checkpoint trước refactor](refactor/POSTGRES_BASELINE_INVENTORY.md)
- [ADR 0027: MongoDB persistence protocol](adr/0027-mongodb-persistence-protocol.md)
- [MIG-06: chuyển dữ liệu và cutover sang MongoDB](refactor/MIG06_DATA_CUTOVER.md)
