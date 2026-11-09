# ADR0074: Người bán chọn chế độ Mua ngay; lượt trả chạm giá mua ngay không còn "chờ hết phiên"

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc. Bổ sung
[ADR0043](0043-buy-now-challenge-window.md), [ADR0047](0047-seller-scheduled-auctions.md)
và [ADR0070](0070-leader-buy-now-and-rival-window.md). Không đổi READINESS.

## Vấn đề

1. Người bán không chọn được Mua ngay kết thúc phiên ngay hay mở cửa sổ thách đấu.
2. "Chờ hết phiên": `buyNowOffered` rút Mua ngay khi giá hiện tại chạm giá mua ngay,
   nhưng chỉ đường Mua ngay mới rút ngắn `endAt`. Một lượt trả thủ công hoặc mức Auto đẩy
   giá lên bằng/vượt giá mua ngay thì Mua ngay biến mất, còn phiên vẫn chạy tới
   `plannedEndAt` (có thể nhiều giờ/ngày) dù đã có người cam kết ít nhất giá mua ngay.

## Quyết định

1. Intake có `buyNowMode`: `Challenge` (mặc định, giữ ADR0043/0070) hoặc `Instant`.
   Giá trị được chép sang phiên khi đăng. `Instant` cần giá mua ngay (422 nếu thiếu).
2. `Instant`: Mua ngay đặt `buyNowAt = now` và `endAt = now`; phiên không nhận thêm giá,
   worker đóng phiên (quét vài giây một lần) và tạo đơn chờ thanh toán 24 giờ như FR-AU07.
   Lượt trả và mức Auto vượt giá mua ngay bị từ chối 409 `InvalidState`, vì phiên kết
   thúc ngay ở mức đó. Mức Auto bằng giá mua ngay được phép và thắng theo thứ tự cam kết
   trước, như mọi lượt bằng giá.
3. Ở cả hai chế độ, giá quyết định sau một lượt trả/Auto/Mua ngay mà `≥ buyNowPrice` khi
   Mua ngay chưa dùng sẽ kết thúc theo quy tắc Mua ngay: `Instant` là ngay lập tức;
   `Challenge` là 60 giây nếu người thao tác đã dẫn, 5 phút nếu không (ADR0070), không
   vượt `endAt` hiện tại. Lượt trả vẫn ghi đúng loại (`Manual`/`AutoSet`), không bịa
   lượt `BuyNow`. Phiên đã lỡ ở trạng thái "chờ hết phiên" sẽ áp dụng quy tắc ở lượt trả
   kế tiếp; không có migration sửa lại phiên đang chạy ngoài command.

## Persistence và contract

- Migration `0063-auction-buy-now-mode` thêm `buyNowMode` cho `auction_intakes` và
  `auctions`, backfill `Challenge` trong transaction rồi bắt buộc trường. Validator
  `auctions` thay quy tắc cửa sổ của 0058 bằng: `Challenge` giữ 60 giây/5 phút;
  `Instant` yêu cầu `endAt = min(plannedEndAt, buyNowAt)`. Không sửa migration cũ.
- OpenAPI thêm `AuctionBuyNowMode`; `CreateAuctionIntake.buyNowMode` tùy chọn
  (mặc định Challenge); `AuctionIntake` và `PublicAuctionSummary` trả `buyNowMode`
  (tùy chọn cho server cũ). `buyAuctionNow` mô tả quy tắc mới.

## Hệ quả

- Member web và RN có lựa chọn "Chờ thách đấu" / "Kết thúc ngay" khi gửi đấu giá;
  trang phiên hiển thị lời giải thích theo chế độ. Flutter chưa có (scaffold).
- Chưa đổi mô hình tiền: kiểm tra số dư ADR0071 giữ nguyên. Giữ tiền người dẫn và các
  loại đấu giá khác (Dutch, kín giá thứ nhất/thứ hai) là các gói tiếp theo, cần ADR riêng.
