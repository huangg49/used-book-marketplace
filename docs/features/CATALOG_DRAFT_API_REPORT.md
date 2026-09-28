# Catalog và nháp listing: API thật

Ngày 26/09/2026. Phần đầu mốc 2 của [kế hoạch listing](LISTING_IMPLEMENTATION_PLAN.md).

Báo cáo giữ kết quả của mốc catalog/nháp. Cập nhật 27/09: upload/Sharp/RN nháp đã
có ở [media report](MEDIA_UPLOAD_REPORT.md); submit/review/reviewer media đã có ở
[review report](LISTING_REVIEW_API_REPORT.md). Contract hiện hành là 0.6.0.

## Phạm vi hoàn thành

OpenAPI **0.4.0** đánh dấu **14 operation implemented**, **19 operation planned**.
Đây là API với PostgreSQL thật, chưa phải trải nghiệm đăng sách trên React Native.

| Nhóm | Hành vi đã chạy qua HTTP |
|---|---|
| Catalog công khai (2) | Tìm tên/tác giả tiếng Việt hoặc ISBN; đọc đầu sách Confirmed |
| Yêu cầu catalog của Member (4) | Tạo, danh sách riêng, chi tiết, sửa và gửi lại sau từ chối |
| Admin catalog (3) | Hàng chờ, chi tiết, xác nhận/từ chối có lý do; cấm tự duyệt |
| Nháp listing của Member (5) | Tạo, lưu, danh sách riêng, chi tiết, lịch sử revision |

Chi tiết method/route/request/response ở [chỉ mục API](LISTING_API_INDEX.md).
Tiền tố `/api/v1`. Routes dùng guard hiện có; service kiểm tra lại quyền, trạng thái
tài khoản, phiên và chủ sở hữu bên trong transaction. Chủ ACTIVE/RESTRICTED được
đọc dữ liệu riêng; ghi mới cần ACTIVE. Thông tin catalog chưa duyệt không công khai.

Nháp cho phép nội dung chưa đầy đủ. Lưu nháp thay toàn bộ content, tăng version;
không tạo revision lịch sử cho mỗi lần gõ/lưu. Revision đã gửi duyệt là bất biến;
đường lưu từ Rejected tạo working revision mới, nhưng API submit/review listing
chưa triển khai nên chưa có luồng HTTP tạo trạng thái đó trong mốc này.

## Tính nhất quán và dữ liệu

- `CommandService`: advisory lock cho key, khóa user/session, fingerprint canonical,
  kiểm tra quyền replay, version/state rồi ghi dữ liệu/receipt/audit cùng transaction.
- Catalog tạo outbox cùng transaction. Chưa có consumer; event không bị đánh dấu
  delivered giả. Draft không phát thông báo.
- Sáu request tạo cùng key chỉ sinh một listing. Hai phiên lưu cùng version chỉ
  có một bên thành công; phía còn lại nhận 409. Retry receipt không tăng version.
- Cùng key khác target/nội dung trả 409. Replay đã commit vẫn đúng sau khi catalog
  liên quan bị từ chối; quyền hoặc phiên bị thu hồi vẫn chặn replay.
- ISBN kiểm tra checksum, chuẩn hóa 10 sang 13, prefix 978/979, uniqueness chỉ khi
  Confirmed. Kiểm tra này không xác minh sách thật sự được cấp ISBN đó.
- Cursor có chữ ký HMAC, gắn với filter/caller/operation và giữ microsecond của DB.
  Query `%`, `_`, `\` được tìm như ký tự, không cho tự biến thành wildcard SQL.
- Runtime validation dùng OpenAPI; field errors có cấu trúc, 5xx không lộ raw DB
  exception. Log/audit không lưu token hoặc toàn bộ form.

Hai migration mới giữ nguyên lịch sử cũ: khóa user khi ghi role; ràng buộc prefix
ISBN. Migration prefix sẽ dừng nếu dữ liệu hiện có sai, không tự sửa metadata.
Prisma schema không thể tái tạo toàn bộ trigger/CHECK: luôn dùng migrate deploy.
Chi tiết giao thức: [ADR 0006](../adr/0006-catalog-draft-commands.md).

## Bằng chứng kiểm thử

Windows, PostgreSQL 17.10 tại loopback; database riêng tên kết thúc `_test`.
HTTP test tạo schema `draft_http_test_<uuid>`, chạy đủ lịch sử migration và chỉ
xóa schema của chính run. Không migrate DB dev/chung, không seed hay đổi mật khẩu.

| Kiểm tra | Kết quả |
|---|---|
| `pnpm contract:check` | YAML hợp lệ, generated types đồng bộ |
| API unit | 9/9 |
| API E2E với PostgreSQL | 42/42: 20 catalog/nháp HTTP, 13 schema, 9 auth/health |
| React Native unit | 22/22 |
| Workspace lint/typecheck | Đạt API, RN, operations web |
| Workspace build | Đạt API và operations web |
| `pnpm db:migrate` trên DB test | Đủ bốn migration |
| Prisma migrate diff DB test → schema | Không khác biệt; CHECK/trigger được kiểm tra riêng |

20 ca HTTP mới nằm ở `apps/api/test/catalog-drafts.e2e-spec.ts`. Chúng kiểm tra
schema response, ownership, role, tự duyệt, tài khoản hạn chế/khóa, key/version,
ISBN cạnh tranh, catalog riêng, input lạ, cursor sai scope/chữ ký và thứ tự timestamp
cách nhau một microsecond. Hai phiên và hai Admin được thử qua request đồng thời.

Kiểm thử race giữ khóa DB cho đến khi request đã qua guard và đang chờ transaction,
rồi thu hồi role/phiên hoặc hạn chế tài khoản: command bị chặn, không ghi receipt.
Failure injection tại audit chứng minh toàn bộ transaction rollback. SQLSTATE 40001
được thử cả hồi phục ở lần ba và hết ba lần trả 503; cùng key có thể thử lại sau đó.
Các log 500/503 trong hai ca này là lỗi được cố ý gây ra để kiểm tra rollback.

Kiểm thử lưu nháp đóng Nest app, khởi tạo API lại trên cùng DB, đăng nhập qua HTTP
và đọc đúng dữ liệu đã lưu. Đây **không phải** bằng chứng đóng/mở app native.

Cảnh báo còn thấy khi kiểm tra: pg 8.23 báo deprecation từ query nội bộ Prisma
adapter trong transaction; trace được ghi nhận, chưa nâng driver lên pg 9.
Operations web build cảnh báo chunk lớn hơn 500 kB. Các kiểm tra vẫn hoàn tất;
chưa có benchmark tải, SRS p95 hoặc thử nghiệm thiết bị Android/iOS trong mốc này.

## Chạy lại và bước tiếp theo

Theo [hướng dẫn setup/test](../REACT_NATIVE_START.md): generate client, migrate DB
riêng, đặt `TEST_DATABASE_URL` rồi chạy `pnpm test:api:e2e`. Test role cần quyền
tạo schema/function/trigger. Chạy riêng phần mới:

```sh
pnpm --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/catalog-drafts.e2e-spec.ts
```

Mốc upload/processing và submit/review kế tiếp báo cáo này đã được triển khai,
theo các báo cáo dẫn ở đầu trang. Việc tiếp theo hiện tại là form RN đầy đủ,
web kiểm duyệt và public listing; không dùng giới hạn lịch sử của mốc catalog/nháp
để suy ra trạng thái API hiện hành.

Chưa nghiệm thu toàn bộ [32 ca listing](LISTING_ACCEPTANCE.md), chưa có API lên kệ,
giao dịch, reservation, wallet hoặc consumer thông báo. Không đồng nhất 42 E2E đạt
với việc hoàn thành toàn bộ tính năng listing.
