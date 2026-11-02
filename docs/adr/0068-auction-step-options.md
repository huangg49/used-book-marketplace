# ADR0068: Bước giá đấu giá có sẵn và tự nhập

02/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc. Sửa bước giá
của POL-39 trong [phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md); bổ sung
[ADR0067](0067-uncapped-auction-amounts.md). Không đổi READINESS.

## Vấn đề

Sau ADR0067 giá đấu giá không còn trần, nhưng Seller chỉ chọn được bước 10.000đ hoặc
50.000đ. Sách giá trị cao cần bước lớn hơn để phiên không kéo dài qua quá nhiều lượt;
sách giá thấp cần bước trung gian giữa hai mức cũ. Danh sách bước nằm ở contract OpenAPI
(enum), validator Mongo của 0008/0009 (`$in`) và client web/RN.

## Quyết định

1. Seller chọn một bước có sẵn `AUCTION_STEPS = 10.000đ, 20.000đ, 50.000đ, 100.000đ` hoặc
   tự nhập bước là bội số của 1.000đ trong khoảng 1.000đ–10.000.000đ, trước khi mở phiên. Sàn 10.000đ và lưới `start + n × step` cho start, bid, max và buy-now giữ
   nguyên. Bước nhỏ hơn sàn giá vẫn hợp lệ vì lưới tính từ giá khởi điểm.
2. Contract mô tả `step` ở cả bốn schema đấu giá bằng `minimum: 1000`,
   `maximum: 10000000`, `multipleOf: 1000`; request ngoài khoảng bị từ chối 422 khi kiểm
   contract.
3. Migration `0056-auction-step-options` thay danh sách `$in` của `step` trong `$expr`
   của `auction_intakes`, `auctions`, `point_orders` bằng bốn bước có sẵn. Migration
   `0057-custom-auction-step` (sau khi 0056 đã áp dụng ở DB local) thay danh sách đó bằng
   khoảng 1.000đ–10.000.000đ và `$mod` 1.000. Migration 0008/0009/0054/0056 không bị sửa.
4. Phiên và đơn đã có bước 10.000đ/50.000đ vẫn hợp lệ; không backfill dữ liệu.

## Hệ quả

- Client web và RN hiện bốn bước có sẵn và lựa chọn “Tự nhập”, cùng thông báo lỗi khi bước
  ngoài khoảng hoặc không là bội số của 1.000đ; server vẫn là nguồn kiểm tra cuối.
- Đổi khoảng hoặc đơn vị bước về sau cần migration mới và cập nhật contract cùng lúc.
