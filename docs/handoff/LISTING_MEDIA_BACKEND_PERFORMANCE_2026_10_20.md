# Tối ưu tải listing — bước 2 backend, 20/10/2026

Chủ dự án duyệt bước 2 sau [cache phía client](LISTING_LOAD_PERFORMANCE_2026_10_20.md).
Nhánh `codex/listing-media-backend-performance`, base `8042f5b`. Giữ nguyên 176
operation OpenAPI 0.49.0, request/response, private bucket, Mongo schema/migration
và dữ liệu demo. Không thêm Redis, dependency hoặc cấu hình riêng mới.

## Thay đổi

- `MediaStorage.signedRead` gom các yêu cầu đang tới trong cửa sổ 10 ms, tối đa
  50 key/lượt, gọi Supabase `createSignedUrls` thay vì ký riêng từng ảnh. Các
  caller/endpoint cũ giữ nguyên. Kết quả ghép theo path, không theo thứ tự mảng;
  object bị lỗi/thiếu không nhận URL của object khác. URL/key/token không ghi log.
- Gộp request trùng key đang ký; giữ URL trong RAM theo key bất biến. Cache tối đa
  1.000 entry, tối đa 1.000 key đang chờ, trả 503 khi quá tải. Ngừng tái dùng khi
  còn không quá 10 giây; `expiresAt` giữ thời điểm cấp ban đầu, tính bảo thủ từ
  trước lời gọi provider, không tăng thêm 120 giây cho mỗi cache hit. Không cache
  lỗi. Xóa object thành công làm rỗng cache; request ký khởi chạy trước lần xóa
  không làm cache được điền lại. Đóng module dọn timer/queue/cache.
- `MediaStorage.check` chỉ chia sẻ promise của kiểm tra bucket **đang chạy**.
  Không TTL-cache cấu hình bucket: một lượt mới vẫn kiểm bucket private/bounded;
  lỗi provider hoặc bucket chuyển public vẫn bị từ chối. Backend warm request
  vẫn có chi phí kiểm tra này.
- Cache chỉ giữ capability của storage; không giữ kết quả quyền/eligibility.
  Public, private/reviewer, auction và packaging read vẫn đi qua kiểm tra trước/
  sau khi lấy URL như hiện tại. Không bỏ audit, ownership, status hay revision.
- Public shelf lọc ID sớm ở lần đọc projection, gom metadata và version địa chỉ
  thành 2 query thay vì 2 query mỗi listing. Địa chỉ chỉ đọc `_id/version`, không
  trả hoặc cache PII. Page selection/projection/metadata/origin vẫn ở cùng snapshot
  transaction và cùng thứ tự cursor; không chạy song song query trong session.
  Page rỗng không đọc thêm metadata/origin. Không cache danh sách hoặc trạng thái
  giao dịch phía server.

## Đo read-only với API và Supabase thật

Hai process API tạm trên port 3009, cùng DB demo local và 20 listing. Baseline là
compiled API trước thay đổi, lưu riêng trong `apps/api/.tmp`; không checkout/reset
source hoặc ghi DB. Counter chỉ phân loại lượt GET bucket/POST ký ảnh, không lưu
URL ký, body hay credential. Browser/Vite QA5196 dùng cùng source client bước 1.
Report/ảnh riêng máy tại `.tmp/listing-media-step2/`.

| Quan sát trong lượt đo | Trước | Sau |
| --- | --- | --- |
| API trả trang 20 listing (trung vị 3 lần) | 550 ms | 447 ms |
| Cấp đủ 20 URL ảnh đồng thời, cold | 1.406 ms | 985 ms |
| Lượt gọi Supabase cho burst cold | 40 (20 check + 20 ký riêng) | 2 (1 check + 1 ký nhóm) |
| Cấp đủ 20 URL ảnh, warm | 777 ms | 352 ms |
| Lượt gọi Supabase cho burst warm | 40 | 1 check, không ký lại |
| Link/hạn cấp ban đầu được tái dùng ở warm | 0/20 | 20/20 |
| Bìa đầu tiên trên browser development | 7.384 ms | 7.000 ms |

Một lượt local không là SLA hoặc benchmark production. Số lượt gọi provider giảm
là kết quả rõ nhất; cold browser còn chịu dev transform/bundle và tải pixel từ
CDN, mức cải thiện đầu trang nhỏ hơn mức giảm request ký ảnh. Chưa triển khai
thumbnail mới hoặc tối ưu bundle trong gói này. Cache RAM theo từng process;
request đến process khác vẫn cần ký lần đầu. CDN/network vẫn có thể dao động.

## Kiểm chứng và runtime

- API full unit: **176 PASS**, typecheck/build/lint PASS (11 cảnh báo cũ).
  Unit mới kiểm bound batch/cache, expiry, retry lỗi, invalidation race, shutdown,
  gộp check bucket đang chạy nhưng không tái dùng kết quả check cũ, lỗi từng path,
  thứ tự kết quả bulk khác input và query-count/order của projection.
- E2E trên replica set QA57017/database `latlai_listing_media_step2_test`:
  `listing-review`, `media`, `packaging-evidence`, `auctions`: **179 PASS**.
  Storage E2E được fake, không thay bằng chứng Supabase thật. Thêm cache-hit rồi
  ẩn bài phải 404; cold/cache-hit đều bị chặn nếu thu hồi MEMBER trong lúc cấp
  URL. Snapshot thay eligibility giữa chọn trang và projection vẫn nhất quán.
  Các 500 trong log của ca failpoint là lỗi chủ động dùng để kiểm rollback.
- Contract check/routes PASS: OpenAPI 0.49.0, 176 operation/26 controller khớp.
  Không cần generate type mới vì contract không đổi. Không sửa validator/index
  hoặc transaction writer nên không mở lại Mongo schema/failover gate.
- Đã build và khởi động lại API3000 + media/order workers trên DB demo cũ. API
  readiness 200. Browser live qua FE5174: kệ đọc schema/ảnh thành công, mở Detail
  và Back không cần xin thêm URL khi còn hạn, không pageerror. Đã xem ảnh web.
- Không đổi source RN/web trong bước 2. Native Android/iOS và remote CI NOT RUN;
  không coi E2E/browser là nghiệm thu native hoặc review người thật.

Chưa push/PR/merge; READINESS giữ nguyên. Có thể review bước 2 trên web local.
Bước 3 (thumbnail/truy vấn sâu hơn hoặc bundle nếu được giao) vẫn cần phạm vi mới.
