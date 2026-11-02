# Demo User 2 mua bài User 1 — 02/11/2026

Owner duyệt chốt gói giao diện thành commit local, rồi bổ sung một Buyer và đi
qua mua bài User1 trên ứng dụng local đang dùng, giữ dữ liệu cũ. Không push/CI/
merge hoặc tự mở thêm giao nhận/settlement.

## Source và phạm vi

- Commit giao diện `cc853aad` trên `codex/admin-listing-review-workspace` lưu
  Admin review, web motion, search recovery và Member detail/cart cùng tests/docs.
  Worktree sạch sau commit; không đưa công việc Antigravity từ checkout ứng dụng
  vào commit này. Fetch origin đã chạy, không pull/đè source checkout đang dùng.
- Gói demo tiếp trên nhánh `codex/demo-user2-buy-now`, base `cc853aad`.
  Runtime local vẫn dùng source checkout `f3291409` cộng các hunk UI tương thích
  đã kiểm, Nest API/Mongo hiện có. Không deploy API mới hoặc chạy migration.
- Không dùng test harness ghi/xóa trên DB chính. Đây là thao tác demo bổ sung
  được owner cho phép: tạo1Member, profile/địa chỉ, nạp tiền mô phỏng qua API và
  tạo/thanh toán1đơn. Những lượt regression trước đó vẫn dùng replica set test.

## Dữ liệu và hành trình đã thực hiện

User2 là Member ACTIVE, preverified phục vụ demo local; profile và một địa chỉ
default trong locality mô phỏng hiện có. Credential demo dễ nhớ giữ trong file
riêng ignored, không đưa password/email/PII hoặc cấu hình vào Git. Không thay
policy đăng ký, gửi email, reset mật khẩu người khác hoặc thêm role vận hành.

| Vai trò | Entry/thao tác | Kết quả quan sát |
| --- | --- | --- |
| Buyer User2 | Đăng nhập → Tìm sách → mở bài User1 | Bài Approved/Available thật,8ảnh đã có và giá120.000đ |
| Buyer | Mua ngay → chọn địa chỉ default → Xem tổng thanh toán | Quote thuộc Buyer, tiền sách120.000đ + phí30.000đ =150.000đ; chưa giữ sách |
| Buyer | Đặt mua và đến thanh toán | Một BuyNow Order AwaitingPayment, giữ sách theo deadline chuẩn |
| Buyer | Thanh toán từ ví mô phỏng | ACK Preparing; ví850.000đ khả dụng +150.000đ transactionHeld |
| Seller User1 | Đăng nhập → mở cùng đơn | Preparing, thông tin nhận/khâu chuẩn bị và deadline từ server; không phải accept/reject lại |
| Public | Đọc lại bài | InTransaction, không còn là sách đang rảnh để đặt mua lần nữa |

Nạp1.000.000đ mô phỏng qua TopupIntent và TEST_OPERATOR có sẵn, độc lập với Buyer;
không gán balance, không gọi VNPay/Brevo/GHN hoặc đưa tiền thật vào hệ thống.
Đơn dừng ở Preparing: chưa đăng ký shipment, upload bằng chứng đóng gói, pickup,
Delivered, receipt, inspection, claim hoặc settlement. Giữ nguyên READINESS/F2h.

## Bằng chứng

- PASS browser Chromium trên Member web thực và API/Mongo runtime local; hai
  phiên Buyer/Seller riêng, cùng OrderID,0pageErrors. API xác nhận BuyNow/Preparing,
  paymentEnabled=false, sellerAcceptanceEnabled=false, canReject=false.
- PASS đúng1direct_order của Buyer/quote,1OrderPayment journal,2thông báo bền vững
  OrderBuyNowPaid. Đơn tham chiếu quoteId; kiểm tra bằng listingId trực tiếp trên
  direct_orders là sai model, đã sửa phép đối chiếu sang đúng quote/item binding.
- PASS ledger reconcile trước/sau, tổng debit=credit. Nguồn simulator hữu hạn giảm
  đúng1.000.000đ; memberAvailable tăng850.000đ và transactionHeld tăng150.000đ.
  Topup và payment qua services/API, không có write ledger/balance thủ công.
- PASS fingerprint mọi bản ghi nghiệp vụ cũ đã chụp trước ở users/catalog/listing/
  revision/media/addresses và các direct_orders có trước. Chỉ bài User1 được phép
  đổi sang trạng thái giao dịch theo Order mới. Không xóa/seed/import đè DB.
- Exact command key/body và receipt được lưu riêng trước khi gửi. Một lượt script
  dừng ở lỗi API kiểm chứng sau quote; lượt tiếp dùng lại key/body cũ, không tạo
  quote thay thế. Sau khi Order/payment ACK, các lượt đối chiếu chỉ mở lại cùng
  Order, không tạo hoặc trả tiền lần nữa. Script phục vụ phiên nằm trong ignored,
  không được giao như công cụ reset/seed chung cho nhóm.

Evidence riêng ignored `.tmp/user2-local/`: `private.json`, `LOGIN.txt`,
`purchase-private.json`, `provision-result.json`, `purchase-result.json`,
`ledger-before.json`, `ledger-after-purchase.json`, `final-verification.json`,
fingerprints preservation và ảnh Buyer/Seller. Không commit các file này.

Không là test thanh toán production, GHN thật, native hoặc nghiệm thu người thật.
Remote CI NOT RUN. Bước tiếp: owner xem User2/đơn đang Preparing, rồi mới quyết
định thử khâu chuẩn bị gửi; không giả ảnh đóng gói như bằng chứng custody thật.
