# API gửi duyệt và kiểm duyệt listing

Ngày 27/09/2026. Contract **OpenAPI 0.6.0**: **27 operation catalog/listing/media
implemented, 7 planned**. Đây là bằng chứng backend; chưa phải nghiệm thu toàn bộ
luồng đăng sách trên React Native và web vận hành.

## Phạm vi đã triển khai

| Operation mới | Hành vi |
|---|---|
| `submitListing` | Kiểm tra nội dung đã lưu, khai báo sở hữu, catalog và ảnh Ready; đóng băng revision, chuyển PendingReview |
| `listListingReviewQueue` | Hàng chờ mặc định PendingReview; lọc Approved/Rejected; cursor theo thời điểm gửi và ID |
| `getListingReview` | Đọc đúng nội dung đã gửi, version, revision và trạng thái catalog |
| `listReviewRevisions` | Lịch sử nội dung đã gửi và quyết định; không đọc bản nháp đang sửa |
| `decideListing` | STAFF/ADMIN độc lập; duyệt đủ sáu tiêu chí hoặc từ chối có lý do |
| `getReviewMediaRead` | Ảnh Ready thuộc revision đã gửi; audit trước khi ký URL, kiểm tra lại quyền sau khi ký |

Gửi lại Rejected luôn tạo revision mới, kể cả không sửa nội dung. Revision và lý
do từ chối cũ được giữ. PendingReview không thể sửa trực tiếp. Catalog Pending
của chính chủ cho phép gửi; duyệt phải đợi catalog Confirmed. Không dùng kiểm duyệt
listing thay cho quy trình xác nhận đầu sách của ADMIN.

Quyết định kiểm tra cả version và revisionId. Mỗi thành công có đúng một receipt,
audit và outbox event trong cùng transaction. Retry cùng key/nội dung trả receipt
cũ; key khác nội dung trả 409. Quyền/phiên bị thu hồi vẫn chặn replay. Outbox chưa
có consumer thông báo, không đánh dấu delivered giả.

## Bằng chứng kiểm thử

Toàn bộ regression: **75 API E2E + 14 API unit + 29 RN tests = 118 tests đạt**.
Contract check, lint và typecheck toàn workspace đạt; `pnpm build` build API và
admin web thành công. Admin bundle có cảnh báo kích thước >500 kB; chưa tối ưu ở
increment backend này. Không chạy lại native build vì không thay code RN.
Kiểm thử cũ giả định submit
trả 404 được cập nhật sang 422 khi bản nháp thiếu dữ liệu; public route vẫn 404.

`apps/api/test/listing-review.e2e-spec.ts`: **20 kiểm thử HTTP/PostgreSQL** qua ứng
dụng Nest và các guard thật, schema cô lập trong database tên kết thúc `_test`,
áp dụng toàn bộ migration SQL. Storage signing được thay bằng test adapter;
ảnh Ready trong bộ này là fixture, **không phải bằng chứng Supabase live**.
Bằng chứng provider/Sharp riêng ở [media report](MEDIA_UPLOAD_REPORT.md).

- Gửi, duyệt, từ chối, gửi lại; schema response và header no-store đúng contract.
- Thiếu nội dung/khai báo, ảnh Pending, checklist thiếu tiêu chí, lý do quá ngắn,
  sai revision/version, sai owner/role, tự duyệt dù có ADMIN, Removed/deleted/Sold.
- Hàng chờ phân trang đúng scope; bản nháp đang sửa và ảnh chưa gửi không lộ cho
  operations; lịch sử đã gửi vẫn đọc được. Audit đọc ảnh và thu hồi quyền trong
  lúc remote signing không phát URL mới.
- Hai reviewer cùng version: chờ khóa DB có quan sát `pg_blocking_pids`, chỉ
  giải phóng barrier khi **cả hai** request đang chờ; một 200, một 409, đúng một
  decision/receipt/audit/event.
- Hai submit cùng key: barrier thật, một hiệu ứng và receipt dùng lại; đổi payload
  hoặc thu hồi session có kết quả đúng.
- Hạn chế chủ/mất MEMBER/bỏ xác minh trước approval làm approval thất bại; reviewer
  mất role/session/ACTIVE trong lúc chờ cũng bị chặn. Submit kiểm tra lại chủ.
- Chiều ngược lại: approval giữ khóa chủ đến commit; lệnh hạn chế chủ phải chờ.
  Approval có thể tồn tại khi chủ bị hạn chế sau đó; public API tương lai phải lọc
  eligibility hiện hành, không chỉ dựa vào trạng thái Approved.
- Failpoint chỉ trong schema test gây lỗi INSERT outbox: rollback cả freeze,
  decision, state, receipt, audit; bỏ failpoint rồi retry thành công.

Đối chiếu các phần API của LS-AC09, 12–15, 17, 23, 25–27, 28. Không tuyên bố các
ca UI/native/public/transaction hoặc toàn bộ 32 ca listing đã được nghiệm thu.

## Chạy lại và cấu hình

Dùng Node **>=24.15.0** theo `.nvmrc`, pnpm theo `packageManager`. Lượt xác minh này
dùng Node 24.19.0, PostgreSQL 17.10 cục bộ. Đặt `TEST_DATABASE_URL` trong terminal
tới DB riêng có tên kết thúc `_test`; không dùng DB sản phẩm và không in URL/khóa.

```powershell
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:api:e2e
pnpm build
```

Không thay `.env`, mật khẩu seed hoặc lịch sử migration. Runtime API/worker bình
thường vẫn dùng `DATABASE_URL` của `apps/api/.env`; database test không phải database
demo. `pnpm doctor:local` kiểm tra cấu hình bình thường trước khi mở API/RN; xem
[hướng dẫn môi trường](../REACT_NATIVE_START.md) và [Android QA](../ANDROID_QUALITY.md).

## Phần tiếp theo

1. RN: [form và gửi duyệt đã triển khai](RN_LISTING_SUBMISSION_REPORT.md), gồm
   chọn/yêu cầu đầu sách, ảnh, tình trạng/giá, khai báo và sửa/gửi lại. Native QA còn pending.
2. [Web vận hành đã triển khai](OPERATIONS_REVIEW_REPORT.md): hàng chờ,
   ảnh/revision/checklist, từ chối, conflict và retry/refetch qua API thật.
3. Public shelf/detail/media và các lệnh sửa sau duyệt, ẩn/mở/xóa/gỡ còn 7 operation
   planned; cần kiểm thử quyền/eligibility và race riêng trước khi nối giao dịch.

Kiểm duyệt ảnh không xác nhận ảnh gốc hoặc sách thật. Point/auction/shipping/ledger
vẫn là yêu cầu đã chốt, chưa phải workflow đã triển khai. Native picker/upload và
luồng đăng nhập trên thiết bị vẫn cần kiểm chứng; bản Android debug và UI emulator
đã có bằng chứng riêng, không dùng web export thay native build.
