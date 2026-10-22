# Tối ưu tải listing — bước 1, ngày 20/10/2026

Chủ dự án duyệt làm bước 1 trước: cache phía client và ưu tiên ảnh trong vùng xem.
Nhánh `codex/listing-navigation-cache`, base `fe7d0d0`. Không đổi API, validator,
bucket, TTL được server cấp hoặc dữ liệu demo. Bước 2 tối ưu backend/ký ảnh theo
nhóm và bước 3 thumbnail/truy vấn chưa triển khai trong gói này.

## Hành vi

- Web dùng chung query ảnh giữa card, Detail, thumbnail và ảnh phóng lớn; khóa
  gồm listing/revision/media. Tái sử dụng signed URL tới 5 giây trước expiresAt,
  cache query trong bộ nhớ 2 phút sau khi không còn observer. Không persist URL
  vào localStorage. Timestamp thiếu/sai/hết hạn không được coi là dùng được.
- Trước thời điểm hết hạn an toàn, ẩn ảnh cũ và xin lại khi đang xem. Nhiều
  observer cùng refetch không hủy/nhân đôi request đang chạy. Nếu server từ chối,
  không tiếp tục hiện ảnh cũ; người dùng có nút thử lại. Không tự tăng hạn ảnh.
- Web hoãn xin link ảnh ngoài vùng viewport + 200 px, dừng timer khi ảnh ra
  ngoài vùng đó hoặc tab bị ẩn; khi trở lại dùng lại URL chỉ nếu còn hạn. Ảnh
  chính Detail tải ngay với priority cao, giải mã async. Không thay motion.
- Web Search và RN shelf giữ cùng trang/lọc trong cache 5 phút, fresh 30 giây.
  Không dùng dữ liệu trang/lọc trước làm kết quả cho bộ lọc mới. RN vẫn polling
  30 giây khi foreground. Web Detail giữ đọc lại server khi mount; giao dịch vẫn
  qua các kiểm tra version/quyền/trạng thái server hiện tại.
- RN PublicPhoto tái sử dụng URL theo cùng helper hạn dùng, giữ query 2 phút và
  đổi ảnh từ cache none sang memory, không disk. Giữ điều kiện foreground và
  cleanup timer. Logic xóa QueryClient khi đổi tài khoản/logout vẫn giữ nguyên.

## Đo thực tế

Một lượt browser local cùng viewport 1440 × 900, Vite development và API/data
local đang chạy; ảnh thật qua Supabase. Baseline dùng source từ `fe7d0d0` thông
qua Vite load override, không checkout/reset file hoặc ghi vào DB. Dev transform,
CPU và mạng ảnh ảnh hưởng số đo, đây không là benchmark production/SLA.

| Quan sát | Trước | Sau |
| --- | --- | --- |
| Lượt xin URL ảnh khi mở trang kệ đầu tiên | 20 | 10 |
| Lượt xin URL ảnh khi Detail → quay lại kệ | 18 | 0 |
| Bìa hiện lại sau quay về kệ | 265 ms | 177 ms |
| Bìa đầu tiên khi mở lạnh | 8.143 ms | 8.193 ms |

Lần mở lạnh chưa cải thiện trong lượt này. Phần ký URL/kiểm tra bucket/tải ảnh
qua mạng và truy vấn backend vẫn là việc bước 2; không kết luận đã giải quyết
toàn bộ cảm giác chậm. Số request quay lại giảm là kết quả rõ nhất của bước 1.

## Kiểm chứng

- Web typecheck/build PASS; lint PASS với 6 cảnh báo có sẵn; 157 unit PASS.
- Session-client 27 unit PASS, gồm helper expiry margin và timestamp không hợp
  lệ. Web unit mới kiểm tái dùng/deduplicate request, expiry refresh, revision
  đổi và QueryClient clear.
- Browser frontend-only fixture PASS tại 1440 và 390 px: chỉ xin ảnh gần vùng
  xem, card → Detail → Back không ký lại khi còn hạn, Back không đọc lại cùng
  trang trong 30 giây. Detail vẫn đọc server và chặn Mua ngay khi trả InTransaction.
  Desktop còn kiểm ẩn ảnh hết hạn khi refresh đang pending, 404 không hiện ảnh
  cache, retry khôi phục và cuộn xuống kích hoạt bìa chưa tải. Không pageerror/
  tràn ngang. Fixture không chứng minh storage thật hoặc native.
- Browser đọc live API/Supabase: chụp và xem desktop/mobile, bìa có kích thước
  đúng, không tràn ngang. Thư mục evidence riêng máy `.tmp/listing-cache-qa/`.
- RN lint PASS (2 cảnh báo cũ), 156 unit PASS, Expo web export PASS (CLI exit 0,
  có cảnh báo tự force exit sau khi export xong). RN typecheck vẫn FAIL tại
  auctions/wallet contracts như trước gói: authors/photos kiểu {}, topup thiếu
  Cancelled/expiresAt/serverTime. Native Android/iOS và tương tác RN NOT RUN.
- Detector: 2 advisory màu CSS có sẵn, không đổi trong gói; không có finding
  trên hook/logic mới. Web build vẫn có cảnh báo chunk lớn có sẵn.

Chạy lại regression: `pnpm --filter @used-books/user-web test:listing-cache:browser`.
Đo read-only với API local đang chạy:
`pnpm --filter @used-books/user-web exec node tests/listing-cache.mjs --baseline fe7d0d0`.
Script tự mở/đóng Vite QA5196 và browser; không chạy trên port demo5174.

Chưa push/PR/merge. Gate READINESS không đổi. Bước tiếp theo sau chủ dự án review
là giảm lượt ký URL và chi phí storage/backend; giữ private bucket và các kiểm
tra eligibility hiện tại thay vì biến ảnh hoặc bài đăng riêng thành công khai.
