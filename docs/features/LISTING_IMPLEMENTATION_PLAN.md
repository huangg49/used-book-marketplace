# Kế hoạch triển khai listing theo lát cắt

Đầu vào: [hành vi và trạng thái](LISTING_SLICE.md),
[32 ca nghiệm thu](LISTING_ACCEPTANCE.md). API catalog và nháp đã chạy với PostgreSQL;
Luồng đăng/gửi/duyệt/tìm trên kệ và lifecycle sau duyệt đã có API/UI. Native workflow QA còn thiếu.
Không đặt deadline; mỗi PR giữ một mục đích, bảo toàn thay đổi nền móng hiện có.

**Baseline mới:** [SRS1.1](../SRS_V1_1.md) và [ADR0007](../adr/0007-hcm-handover-auction-scope.md).
Upload/moderation listing đã có API, form RN và [web kiểm duyệt](OPERATIONS_REVIEW_REPORT.md). Đọc
[mô hình đích](LOCAL_TRANSACTION_DESIGN.md) để không khóa schema vào giả định
chỉ direct shipping. Chưa gộp point/auction vào PR upload hoặc tự nâng contract version.

Cập nhật 27/09: **mốc 1 đã có contract/schema/migration và kiểm thử nền dữ liệu**.
Xem [thiết kế và bằng chứng](LISTING_DATA_CONTRACT.md). **Mốc 2 đã có catalog/nháp,
media/Sharp, submit/review và public listing**: 34 API implemented, gồm cả 4 lifecycle operation.
Xem [catalog](CATALOG_DRAFT_API_REPORT.md), [media](MEDIA_UPLOAD_REPORT.md) và
[kiểm duyệt](LISTING_REVIEW_API_REPORT.md). [RN đã có form và gửi duyệt](RN_LISTING_SUBMISSION_REPORT.md);
web vận hành đã có kiểm duyệt; [kệ RN](PUBLIC_SHELF_REPORT.md) đã có tìm/lọc/detail/ảnh.
Sửa sau duyệt, ẩn/mở/xóa mềm/gỡ đã có API/UI: [bằng chứng](LISTING_LIFECYCLE_REPORT.md). Tiếp đến native workflow QA và đối chiếu nghiệm thu. Các mốc dưới đây
giữ làm checklist tổng thể, không coi hoàn thành chỉ vì API đã có.

## Mốc 1 — Contract và dữ liệu

Đã thực hiện ở mốc contract/schema. Trình tự duy trì: sửa OpenAPI trước, generate types và thiết kế
Prisma migration theo đặc tả. Chốt enum/field, operation, lỗi field typed, cursor
và receipt. Không dùng kiểu `Book` của design-preview làm schema production.

Thiết kế CatalogBook/CatalogRequest, Listing, ListingRevision, ListingMedia,
ReviewDecision, MutationReceipt, AuditEvent và OutboxEvent. Có foreign key,
version, unique revision/decision/key, giá integer, soft delete; không cascade
xóa lịch sử. Chốt thứ tự khóa account/role/catalog/listing cho mọi writer liên
quan. Review migration bằng diff và chạy DB test, không `db push`/reset DB chung.

Đầu ra: YAML + types đồng bộ, migration + quan hệ dữ liệu, bảng endpoint/quyền/
lỗi và transaction design. `pnpm contract:check` đạt. Chưa coi là demo nghiệp vụ.

## Mốc 2 — Nháp đến được duyệt

Khởi đầu catalog Confirmed bằng dữ liệu demo có nguồn; bổ sung catalog request
và Admin review. Xây service catalog/media/listings, upload Supabase có kiểm tra
file. Qua module bằng explicit service, không viết chéo bảng để bỏ kiểm tra quyền.

API có lưu nháp, submit, queue, review, public reads; audit/receipt/outbox cùng
transaction. Hoàn thành negative/race tests trước nối UI thật. Không làm checkout
hoặc tạo reservation giả trong PR listing.

## Mốc 3 — Member và người duyệt cùng dùng được

RN: feature listing/catalog qua transport/session hiện có, query keys và
invalidation; Sách của tôi, đăng/sửa, ảnh, lý do từ chối, kệ/detail. Guest đọc
public; ghi cần phiên. `/design` vẫn là môi trường mẫu có nhãn rõ ràng.

Web vận hành: đăng nhập đúng role, queue/checklist/ảnh/revision/lý do, quyết định,
xử lý conflict; Admin có catalog queue. Thiếu màn này thì Member → Staff chưa
hoàn chỉnh, dù Swagger gọi API thành công.

Hoàn thiện sửa sau duyệt, ẩn/mở/xóa mềm/gỡ và refetch qua các phiên. Dùng UI chung;
chỉ mở rộng `/ui` khi cần. Lỗi ở field/nội dung, modal cho quyết định có hậu quả.

## Mốc 4 — Bằng chứng bàn giao

Chạy contract check, lint/typecheck/tests/build API/RN/operations theo thay đổi,
E2E DB/storage test riêng và native Android. Chạy 32 ca theo mức; lưu báo cáo
thực chạy và giới hạn iOS nếu chưa có môi trường.

Demo: M1 đăng ảnh thật → S1 từ chối → M1 sửa/gửi lại → S1 duyệt → Guest tìm/detail
→ M1 đổi giá → ngừng lên kệ → S2 duyệt revision mới. Mở app lại chứng minh lưu
server; approve cạnh tranh chứng minh một quyết định. Không dùng seed/SQL thay
thao tác review.

## Phân việc cho team 5 người

Sau mốc listing, thứ tự tích hợp: shared reservation + ledger/simulator → Order và
Exchange direct → ViaPoint receipt/inspection/handover/incident → auction dùng lại
Order → demo xuyên RN/operations. Các screens fixture có thể chuẩn bị sớm với nhãn;
không coi auction đã xong khi chưa có thanh toán và nhận sách. Sáu demo và 38 nhóm
ca mới ở [ma trận1.1](LOCAL_TRANSACTION_ACCEPTANCE.md) bổ sung các mốc trên.

Thiết kế bước tiếp theo đã cụ thể hóa tại [ADR0013](../adr/0013-exclusive-commitment-foundation.md)
và [kế hoạch nền giao dịch](TRANSACTION_FOUNDATION_PLAN.md). Bắt đầu bằng address/vùng/
fulfillment, rồi giữ/hủy/hết hạn Order chưa trả tiền; không bỏ prerequisite để tạo
reservation không gắn thỏa thuận thật. [Listing native gate](LISTING_ACCEPTANCE_REPORT.md)
vẫn chưa đóng.

Đây là vai phụ trách, không phân công tên người hay yêu cầu cùng coding trước
khi thống nhất contract. Có thể đổi người mà không đổi ranh giới.

| Phụ trách | Phần sở hữu | Điểm phối hợp |
|---|---|---|
| 1. Domain/API | Contract, migration, listing/revision, quyền/concurrency | Chủ trì mốc 1, thống nhất interface catalog/media, cung cấp API có test |
| 2. Catalog/media | Catalog requests/review, upload/processing/quyền ảnh/cleanup | Cùng chốt contract; Ready phải là kết quả thật; không tự đổi policy listing |
| 3. RN đăng sách | Nháp, ảnh, submit, Sách của tôi, sửa/lỗi | Dùng DTO sinh ra và UI chung, không tạo token/session store khác |
| 4. RN khám phá | Kệ/detail, tìm/lọc/phân trang, invalidation | Predicate ở API; không giả rating hoặc thêm giao dịch ngoài phạm vi |
| 5. Operations/tích hợp | Review web, Admin catalog queue, demo xuyên suốt | Dùng contract thật; phối hợp cả nhóm chạy acceptance/native |

Mỗi người viết test cho phần mình; người 5 không gánh toàn bộ QA. Quyền, migration
và race cần người khác review. Fixture theo contract được dùng để làm UI trong
lúc chờ API nhưng phải giữ nhãn, không tính là mốc nghiệm thu.

## Việc cụ thể hóa ở mốc 1

- Giới hạn metadata còn thiếu, fieldErrors typed và tên operation theo style repo.
- Upload/finalize/URL ký trên Android; byte limit chính xác, request timeout,
  giới hạn upload đồng thời/rate/quota và cấu hình storage test.
- Index, cursor, tìm tiếng Việt/ISBN và kiểm tra query.
- Thứ tự khóa/transaction isolation bảo vệ listing cùng role/status/catalog.
- Lifecycle outbox/worker và failpoint; không bật push/matching ngoài phạm vi.

Đây là thiết kế kỹ thuật tiếp nối, không phải chỗ trống để mỗi coder chọn hành
vi nghiệp vụ khác nhau. Thay LS-D/phạm vi SRS thì sửa đặc tả và ca nghiệm thu cùng PR.
