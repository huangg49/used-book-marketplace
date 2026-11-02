# ADR0067: Bỏ trần giá đấu giá, giá trị khai báo và nâng giới hạn ví mô phỏng

02/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc. Sửa trần
1.000.000đ của POL-39 trong [phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md) và
bổ sung [ADR0049](0049-auction-intake-from-shelf.md). Không đổi READINESS.

## Vấn đề

Người bán không đưa được sách giá trị cao lên đấu giá: giá khởi điểm, mua ngay, lượt trả,
mức tự động và giá trị khai báo đều bị chặn ở 1.000.000đ. Trần nằm ở nhiều lớp: hằng
`AUCTION_MAX_PRICE`, validator Mongo của 0008/0009, contract OpenAPI (kiểm request khi
chạy), client web/RN. Các trường tiền lưu `bsonType: 'int'` (int32), nên chỉ bỏ số trần
thì giá trên 2.147.483.647đ vẫn bị validator từ chối khi driver ghi thành double. Bút toán
sổ cái còn trần riêng 100.000.000đ mỗi dòng.

## Quyết định

1. Không còn trần nghiệp vụ cho giá khởi điểm, mua ngay, lượt trả, mức tự động và giá trị
   khai báo của phiên đấu giá. Sàn 10.000đ, bước 10.000đ/50.000đ và lưới
   `start + n × step` giữ nguyên.
2. Giới hạn kỹ thuật duy nhất là `MONEY_MAX = Number.MAX_SAFE_INTEGER`: số nguyên lớn nhất
   JavaScript biểu diễn chính xác. Client nhập tối đa 15 chữ số nên luôn dưới giới hạn này.
3. Migration `0054-uncapped-auction-amounts` đổi các trường tiền của `auction_intakes`,
   `auctions`, `auction_bidders`, `auction_bids`, `point_orders`, `point_incidents` và
   `ledger_entries` sang `int|long|double` + `multipleOf: 1`, giữ minimum cũ, nâng maximum
   lên `MONEY_MAX` và thay `$lte: [giá, 1000000]` trong `$expr`. Migration 0008/0009 không
   bị sửa; `AUCTION_MAX_PRICE = 1_000_000` giữ lại chỉ để checksum của chúng không đổi.
   `0052-free-shipping` (main) và 0054/0056/0057 cùng collMod `point_orders` từ snapshot
   riêng nên migration chạy sau ghi đè thay đổi của bên kia; `0059-auction-free-shipping-reconcile`
   áp lại validator gộp, không sửa checksum đã áp dụng.
4. Contract nâng maximum của các trường tiền đấu giá, sự cố tại điểm và ví (số dư, đang
   giữ, lịch sử) lên `MONEY_MAX`.
5. Vốn mô phỏng tăng từ 100.000.000đ lên `SIMULATED_CAPITAL = 1.000.000.000.000đ` để người
   thắng phiên lớn có tiền mô phỏng thanh toán. Journal mở đầu vẫn bất biến; migration
   `0055-simulator-capital-increase` ghi **một** journal `CapitalIncrease` cố định
   (`...000000000004`, sequence kế tiếp) chuyển 999.900.000.000đ từ `SimulatorCapital`
   sang `SimulatorClearing`. `checkJournal` chỉ nhận đúng id/số tiền đó; đối soát yêu cầu
   journal này tồn tại và bảo toàn theo tổng mới. Import PostgreSQL xóa nó cùng journal
   mở đầu rồi ghi lại sau chuỗi sequence đã import. Vốn vẫn hữu hạn, không tự nạp thêm.
6. Nạp ví mô phỏng tối đa `TOPUP_MAX = 1.000.000.000.000đ` mỗi lần; VNPay sandbox tối đa
   9.999.999.999đ vì `vnp_Amount` (VNĐ × 100) có tối đa 12 chữ số. Validator `topup_intents`
   và `simulated_payment_events` nhận số lớn hơn int32.

## Không đổi

- Giá bán/giá trị đổi trên kệ (`listing_revisions`, quote, đơn DirectDelivery) vẫn
  10.000–1.000.000đ. Giá trị khai báo mặc định lấy từ giá trên kệ nên vẫn ≤ 1.000.000đ
  cho tới khi người bán sửa.
- Phiên vượt 1.000.000.000.000đ (toàn bộ vốn mô phỏng) vẫn đóng được nhưng không ai đủ tiền
  thanh toán; đơn hết hạn như đơn không trả. Tổng phát sinh sổ cái phải dưới `MONEY_MAX`
  (khoảng 9.000 vòng quay toàn bộ vốn) để tổng hợp đối soát còn chính xác.
- Quỹ sự cố tại điểm vẫn 2.000.000đ; bồi thường lớn hơn quỹ thành `Underfunded` theo POL-42.

## Kiểm tra

Typecheck API/web/admin/RN, unit test engine và client. E2E đấu giá/ví, áp migration
0054/0055 và import PostgreSQL lên replica set `*_test` là NOT RUN tại thời điểm ghi ADR
(không có `MONGO_TEST_URL`).
