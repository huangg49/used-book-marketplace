# Danh mục API listing đã thiết kế

Chỉ mục listing của OpenAPI0.14.0 hiện có. [SRS1.1](../SRS_V1_1.md) đã chốt point/auction nhưng
chưa có route tương ứng; không suy ra endpoint mới từ tài liệu nghiệp vụ.

0.10.0 mở rộng content/revision/public projection bằng nơi gửi DirectDelivery, giữ
nguyên các route dưới đây. Xem [báo cáo fulfillment](LISTING_FULFILLMENT_REPORT.md).
Sáu route sổ địa chỉ/directory0.9.0 được mô tả ở [báo cáo riêng](ADDRESS_BOOK_REPORT.md).
0.11.0 thêm hai operation báo giá bên dưới; [báo cáo quote](DIRECT_SALE_QUOTE_REPORT.md)
phân biệt estimate với quyền giữ sách. OpenAPI 0.12.0 thêm bốn operation Order
create/read/cancel/private media trong [báo cáo F1](UNPAID_ORDER_REPORT.md).
0.13.0 thêm sáu operation ví/nạp mô phỏng trong [báo cáo F2a](SIMULATED_WALLET_REPORT.md).
0.14.0 thêm `GET /me/orders` và giới hạn quyền LOCKED trong [báo cáo F2b](LOCKED_OBLIGATIONS_REPORT.md).
Giao diện checkout và thanh toán vẫn chưa triển khai.

Ngày 27/09/2026. **34 operation catalog/nháp/media/kiểm duyệt/public/lifecycle đã có handler thật**. Xem [bằng chứng API](CATALOG_DRAFT_API_REPORT.md), [media](MEDIA_UPLOAD_REPORT.md) và [kiểm duyệt](LISTING_REVIEW_API_REPORT.md). Bảng là chỉ mục của [OpenAPI](../../packages/api-contract/openapi.yaml), không phải contract thứ hai. Tiền tố runtime `/api/v1`. Khi đổi YAML phải cập nhật chỉ mục này.

| Method | Route | Operation | Request | Response | Truy cập | Trạng thái |
|---|---|---|---|---|---|---|
| GET | `/catalog/books` | `listBooks` | — | BookPage | Công khai, chỉ projection đủ điều kiện | implemented |
| GET | `/catalog/books/{bookId}` | `getBook` | — | PublicBook | Công khai, chỉ projection đủ điều kiện | implemented |
| POST | `/catalog/requests` | `createCatalogRequest` | CreateCatalogRequest | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/me/catalog-requests` | `listMyCatalogRequests` | — | CatalogRequestPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/me/catalog-requests/{bookId}` | `getMyCatalogRequest` | — | PrivateCatalogRequest | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/catalog/requests/{bookId}/resubmit` | `resubmitCatalogRequest` | ResubmitCatalogRequest | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/operations/catalog-requests` | `listCatalogReviewQueue` | — | CatalogRequestPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/operations/catalog-requests/{bookId}` | `getCatalogReview` | — | PrivateCatalogRequest | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/operations/catalog-requests/{bookId}/decision` | `decideCatalogRequest` | DecideCatalog | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/listings` | `listPublicListings` | — | PublicListingPage | Công khai, chỉ projection đủ điều kiện | implemented |
| POST | `/listings` | `createListingDraft` | CreateDraft | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/listings/{listingId}` | `getPublicListing` | — | PublicListing | Công khai, chỉ projection đủ điều kiện | implemented |
| GET | `/me/listings` | `listMyListings` | — | PrivateListingPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/me/listings/{listingId}` | `getMyListing` | — | PrivateListing | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/me/listings/{listingId}/revisions` | `listMyListingRevisions` | — | ListingRevisionPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| PUT | `/listings/{listingId}/draft` | `saveListingDraft` | SaveDraft | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/listings/{listingId}/submit` | `submitListing` | SubmitListing | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/listings/{listingId}/revision` | `reviseApprovedListing` | EditApproved | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| PUT | `/listings/{listingId}/visibility` | `setListingVisibility` | SetVisibility | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/listings/{listingId}/archive` | `archiveListing` | VersionCommand | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/operations/listings` | `listListingReviewQueue` | — | PrivateListingPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/operations/listings/{listingId}` | `getListingReview` | — | PrivateListing | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/operations/listings/{listingId}/revisions` | `listReviewRevisions` | — | ListingRevisionPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/operations/listings/{listingId}/decision` | `decideListing` | DecideListing | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/operations/listings/{listingId}/remove` | `removeListing` | RemoveListing | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/listings/{listingId}/media` | `createListingUpload` | CreateUpload | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/me/listings/{listingId}/media` | `listMyListingMedia` | — | ListingMediaPage | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/me/listings/{listingId}/media/{mediaId}` | `getMyListingMedia` | — | ListingMedia | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/listings/{listingId}/media/{mediaId}/upload-ticket` | `getUploadTicket` | — | UploadTicket | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| POST | `/listings/{listingId}/media/{mediaId}/finalize` | `finalizeListingUpload` | VersionCommand | MutationReceipt | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/listings/{listingId}/media/{mediaId}/read` | `getPublicListingMedia` | — | MediaRead | Công khai, chỉ projection đủ điều kiện | implemented |
| GET | `/me/listings/{listingId}/media/{mediaId}/read` | `getMyListingMediaRead` | — | MediaRead | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| GET | `/operations/listings/{listingId}/media/{mediaId}/read` | `getReviewMediaRead` | — | MediaRead | Phiên hợp lệ + quyền trong mô tả operation | implemented |
| PUT | `/listings/{listingId}/media/{mediaId}/content` | `uploadListingContent` | Binary image + Upload-Token | MutationReceipt | ACTIVE owner + session-bound ticket | implemented |

| Method | Route | Operation | Request | Response | Truy cập | Trạng thái |
|---|---|---|---|---|---|---|
| POST | `/listings/{listingId}/quotes` | `createSaleQuote` | CreateSaleQuote + Idempotency-Key | QuoteReceipt | ACTIVE MEMBER, current destination/listing/origin | implemented |
| GET | `/me/quotes/{quoteId}` | `getMySaleQuote` | — | SaleQuote | Buyer MEMBER, phiên hợp lệ | implemented |
