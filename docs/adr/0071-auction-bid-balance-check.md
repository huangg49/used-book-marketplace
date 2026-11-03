# ADR0071: Kiểm tra số dư ví khi trả giá đấu giá

03/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc. Bổ sung đoạn
"Không giữ tiền mọi bidder" của [phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md) và
FR-AU03–06. Không giữ tiền, không thêm bút toán ledger. Không đổi READINESS.

## Vấn đề

Lượt trả giá, mức Đặt giá tự động và Mua ngay không xem ví. Người có 0đ vẫn trả 10 triệu
và thắng; thiếu tiền chỉ lộ ra khi thanh toán, phiên thành PaymentExpired và người bán mất
thời gian dù người trả giá thứ hai có thể trả được.

## Quyết định

1. Trước khi nhận lượt trả thủ công, mức Auto (đặt hoặc nâng) hoặc Mua ngay, server đọc số
   dư khả dụng của người thao tác trong cùng transaction và yêu cầu:

   `available ≥ mức cam kết mới + cam kết đang mở`

   - mức cam kết mới: số tiền lượt trả, mức Auto tối đa hoặc giá mua ngay;
   - cam kết đang mở: `currentPrice` của các phiên khác (Active/OnHold) mà người đó đang dẫn,
     cộng `buyerTotal` của các đơn đấu giá AwaitingPayment của người đó.

   Thiếu thì từ chối 409 `InvalidState` với thông báo nêu số cần có; không ghi lượt nào.
2. Đây là kiểm tra tại thời điểm thao tác, không phải giữ tiền: số dư vẫn tiêu được cho việc
   khác sau đó. Người thắng vẫn phải đủ `available` khi thanh toán; FR-AU08/PaymentExpired giữ
   nguyên làm lưới an toàn. Không tuyên bố tiền đã được bảo đảm.
3. Tắt Auto không cần kiểm tra. Phí vận chuyển outbound chưa tính vì chỉ chốt khi thanh toán.
4. Lý do không giữ tiền: ledger bất biến, giữ/nhả cho mọi lượt vượt giá cần bút toán cho mỗi
   lần đổi người dẫn; kiểm tra số dư chặn phần lớn lượt không có khả năng trả mà không đụng
   ledger.

## Persistence và contract

- Không có migration. Server chỉ đọc `wallet_accounts`/journal, `auctions`, `point_orders`.
- OpenAPI `placeAuctionBid`, `setAuctionAutoBid`, `buyAuctionNow` mô tả kiểm tra; request,
  response và mã lỗi không đổi.

## Hệ quả

- Web/RN hiện số dư khả dụng cạnh ô trả giá và cảnh báo trước khi gửi khi không đủ.
- Lượt trả hợp lệ trước ADR này không bị xét lại.
