# ADR0077: Đăng ký tham gia đấu giá có tiền cọc và luật tối thiểu hai người

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc (góp ý của giảng
viên: không có phiên đấu giá chỉ một người). Bổ sung FR-AU01–09 của
[phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md); dùng chung tài khoản giữ tiền của
[ADR0075](0075-auction-leader-wallet-hold.md) và các kiểu phiên của
[ADR0076](0076-auction-formats.md). Không đổi READINESS; không là bằng chứng đóng gate
settlement.

## Quyết định

- Người bán chọn `minBidders` (2–10, mặc định 2) khi gửi sách. Khi đăng, phiên chép
  `minBidders` và `depositAmount` = 10% giá khởi điểm (giá sàn với Dutch), làm tròn lên
  1.000đ, tối thiểu 10.000đ.
- Thành viên đăng ký bằng `POST /auctions/{id}/registration` với đúng `deposit` đã thấy.
  Tiền cọc vào tài khoản giữ của (phiên, thành viên) của ADR0075, nên mỗi người mỗi phiên
  chỉ có một khoản giữ = max(tiền cọc, mức cam kết). Bị vượt giá thì khoản giữ về lại mức
  cọc, không về 0.
- Đăng ký mở từ lúc đăng phiên (kể cả khi đang hẹn giờ) tới `endAt`. Trả giá, Auto, Mua
  ngay, chấp nhận giá Dutch và giá kín chỉ nhận từ người đã đăng ký, và chỉ khi
  `registeredCount >= minBidders` ("phiên mở trả giá"). Lúc đủ người, người bán và mọi
  người đăng ký nhận `AuctionBiddingStarted`.
- Rút đăng ký (`POST .../registration/withdraw`) hoàn cọc ngay, chỉ khi phiên chưa đủ người
  và người đó chưa trả giá. Sau khi đủ người, cọc giữ tới khi phiên kết thúc, nên số người
  đã mở phiên không thể giảm. Rút xong có thể đăng ký lại.
- Khi đóng phiên có đăng ký:
  - chưa đủ `minBidders`, hoặc không có Mua ngay/Dutch mà có đúng một người trả giá:
    `Unsold` với `closeReason = NotEnoughBidders`, sách về người bán, mọi khoản giữ và cọc
    hoàn lại, kèm `AuctionNotEnoughBidders`;
  - Mua ngay (kể cả lượt trả chạm giá mua ngay) và chấp nhận Dutch được coi là chấp nhận
    giá trực tiếp sau khi đã đủ người đăng ký, nên không cần người trả giá thứ hai khi
    đóng. Riêng Mua ngay "Kết thúc ngay" (Instant) bị từ chối 409 khi chưa có người khác
    trả giá (cả lượt trả chạm giá mua ngay), vì nó bán ngay cho một người; chế độ "Chờ
    thách đấu" vẫn để người khác trả cao hơn trong cửa sổ 60 giây/5 phút;
  - giá kín thứ hai vì thế không còn trường hợp một người trả giá khởi điểm.
- Người thua được hoàn cọc khi đóng (đăng ký `Refunded`). Cọc của người thắng nằm trong
  khoản giữ giá chốt (`Applied`) và được dùng khi thanh toán, không trả thêm.
- Người thắng không thanh toán đúng hạn (worker `expirePayment`): cọc chuyển cho tài khoản
  nền tảng bằng journal `AuctionDepositForfeit` (`Forfeited`), phần giữ còn lại hoàn về ví,
  kèm `AuctionDepositForfeited`; vi phạm FR-AU08 vẫn được ghi như trước.
  - Cọc **không** chuyển cho người bán: nếu chuyển, người bán có thể dùng tài khoản phụ thắng
    rồi bỏ để lấy lại tiền, biến cọc thành công cụ đẩy giá miễn phí. Người bán được bù bằng
    việc đăng lại phiên và vi phạm của người thắng.
  - Worker đóng phiên trễ hơn hạn thanh toán (không lỗi của người thắng) hoàn cọc, không
    phạt.
- Hủy phiên bởi Admin hoàn mọi cọc và báo cả người đăng ký chưa trả giá. Admin đã đăng ký
  (chưa rút) không được hủy và không thấy phiên trong hàng hủy, như người trả giá.
- Có người đăng ký thì người bán không đổi được thời gian phiên nữa (họ đặt cọc theo lịch
  đã công bố).
- Thông báo hoàn tiền cho người không thắng nói rõ "không thắng", không dùng câu
  "phần giữ vượt giá chốt" dành cho người thắng.

## Persistence và contract

- Migration `0066-auction-registration`:
  - `auction_intakes.minBidders` (backfill 2);
  - `auctions.minBidders`, `depositAmount`, `registeredCount`, `closeReason` (backfill
    null/null/0/null: phiên cũ giữ luật cũ, không cần đăng ký);
  - luật cũ "`Unsold` không có người trả giá" thêm ngoại lệ `closeReason = NotEnoughBidders`;
  - collection mới `auction_registrations` (`_id = auctionId:userId`, `deposit`, `state`
    Registered/Withdrawn/Refunded/Applied/Forfeited);
  - journal `AuctionDepositForfeit` (giữ → nền tảng) và ba loại thông báo mới.
  Không sửa migration cũ.
- Commit-time check: `registeredCount` khớp số đăng ký chưa rút; với phiên có đăng ký, mọi
  người trả giá đều có đăng ký. `checkJournal` kiểm journal phạt cọc: từ đúng khoản giữ của
  phiên, tới tài khoản nền tảng, không quá tiền cọc đã ghi, đăng ký ở trạng thái Forfeited.
- OpenAPI: `registerForAuction`, `withdrawAuctionRegistration`; `minBidders` trên intake;
  `minBidders`, `depositAmount`, `registeredCount`, `closeReason` trên `PublicAuctionSummary`;
  `registrationState`, `deposit` trên `AuctionParticipation`. Đều tùy chọn cho server cũ.
  Participation trả về cho người đã đăng ký dù chưa trả giá; "Phiên của tôi" liệt kê phiên
  đã đăng ký.

## Giới hạn

- `biddingOpenedAt` ghi lúc số đăng ký đạt `minBidders` (không sớm hơn `startAt`). Giá Dutch
  của phiên có đăng ký đứng ở giá mở đầu tới mốc này rồi mới giảm, nên người bán không mất
  giá trong lúc chờ người. `endAt` không đổi: đủ người muộn thì có thể chưa tới giá sàn khi
  hết giờ.
- Đăng ký không khóa ở `startAt`: phiên mở ngay khi đăng không có cửa sổ đăng ký riêng, nên
  luật dùng số người đăng ký thay cho mốc giờ.
- Migration 0066 được sửa thêm `biddingOpenedAt` trước khi push (chưa áp dụng ở DB dùng
  chung nào; chỉ DB `_test` cục bộ).
- Harness kiểm thử tắt đăng ký cho các bộ cũ (`AUCTION_REGISTRATION=Off`, chỉ khi
  `NODE_ENV=test`), như cờ kiểm số dư ADR0071; bộ ADR0077 bật cả hai.
- Member web và RN có giao diện đăng ký; Flutter chưa có (scaffold). Chưa kiểm chứng native
  hay trình duyệt thật.
