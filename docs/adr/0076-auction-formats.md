# ADR0076: Thêm kiểu đấu giá Hà Lan và đấu giá kín (giá thứ nhất, giá thứ hai)

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc. Bổ sung
FR-AU01–07 của [phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md); dùng chung giữ
tiền của [ADR0075](0075-auction-leader-wallet-hold.md) và kết thúc tức thì của
[ADR0074](0074-auction-buy-now-mode.md). Không đổi READINESS.

## Quyết định

Intake chọn `auctionType`, chép sang phiên khi đăng:

| Kiểu | Cách chạy | Giá phải trả | Mua ngay / Auto |
| --- | --- | --- | --- |
| `English` (mặc định) | Như trước: proxy bidding FR-AU03–05 | Giá hiện tại khi đóng | Có |
| `Dutch` | Giá bắt đầu ở `dutchTopPrice`, giảm một bước mỗi `dutchIntervalSeconds` (10–3.600 giây) tới giá sàn `startPrice`. Người đầu tiên chấp nhận thắng, phiên kết thúc ngay | Giá tại thời điểm máy chủ quyết định | Không |
| `SealedFirst` | Mỗi người một giá kín, chỉ được nâng; không ai thấy giá người khác tới khi đóng | Giá cao nhất của chính người thắng | Không |
| `SealedSecond` | Như trên | Giá cao thứ hai, hoặc giá khởi điểm khi chỉ một người | Không |

- Hòa giá: người đạt mức đó trước thắng (sequence máy chủ), như FR-AU04.
- Dutch: `POST /auctions/{id}/dutch-accept` gửi `price` người dùng thấy; giá máy chủ không
  được cao hơn (giá chỉ giảm, nên có thể trả thấp hơn). Lưu như Instant Buy Now:
  `buyNowAt = endAt = now`, `buyNowMode = Instant`, worker đóng phiên và tạo đơn 24 giờ.
  Không ai chấp nhận tới hết giờ thì Unsold.
- Kín: `POST /auctions/{id}/sealed-bid`. Phiên lưu `currentPrice` = giá người dẫn sẽ trả
  (giá thứ nhất: giá của họ; giá thứ hai: max(giá khởi điểm, giá thứ hai)) để đóng phiên dùng
  chung luồng FR-AU07. Khi phiên chưa kết thúc, mọi đầu đọc (danh sách, chi tiết, kênh live,
  participation, receipt) ẩn giá hiện tại, người dẫn, lịch sử và trạng thái dẫn; không gửi
  thông báo bị vượt giá. Sau khi đóng, công bố như phiên thường.
- Lệnh trả giá, Auto và Mua ngay kiểu Anh bị từ chối 409 cho Dutch/kín, và ngược lại.

## Giữ tiền (ADR0075)

- Dutch: giữ đúng giá chấp nhận cho người thắng.
- Kín: giữ toàn bộ giá kín của **mọi** người (chỉ giữ người dẫn sẽ làm lộ ai đang dẫn qua
  ví). Khi đóng: người thắng giữ đúng giá phải trả (giá thứ hai được hoàn phần chênh),
  người khác được hoàn toàn bộ, kèm thông báo riêng.

## Persistence và contract

- Migration `0065-auction-types` thêm `auctionType`, `dutchTopPrice`, `dutchIntervalSeconds`
  cho `auction_intakes`/`auctions`, backfill `English/null/null`. Validator: English không có
  trường Dutch; Dutch không có giá mua ngay, `buyNowMode = Instant`, giá mở đầu > giá sàn và
  nằm trên lưới `startPrice + n × step` (nên mọi giá giảm dần vẫn hợp lệ với validator cũ),
  nhịp 10–3.600 giây; kín không có giá mua ngay. Không sửa migration cũ.
- OpenAPI: `AuctionType`, hai lệnh mới `acceptDutchAuction`, `placeSealedBid`; `dutchPrice`
  và `dutchNextDropAt` trên `PublicAuctionSummary` khi đang mở. Đều tùy chọn cho server cũ.

## Giới hạn

- Giá Dutch hiển thị tính theo đồng hồ server ở mỗi lần đọc; client đọc lại khi tới mốc giảm.
  Không có worker cập nhật giá; quyết định luôn dùng đồng hồ quyết định dưới khóa phiên.
- Hạn mức POL-41 (tối đa 5 phiên đang dẫn) vẫn tính phiên kín mà người dùng đang dẫn; thông
  báo hạn mức không nêu phiên nào.
- Member web và RN có giao diện; Flutter chưa có (scaffold). Chưa có kiểm chứng native.
