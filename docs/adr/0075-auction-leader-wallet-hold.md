# ADR0075: Giữ tiền trong ví cho người đang dẫn giá đấu giá

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc. Thay điểm 4
("không giữ tiền") của [ADR0071](0071-auction-bid-balance-check.md); bổ sung FR-AU03–09.
Đây là thay đổi tiền mô phỏng; không mở gate settlement/Delivered của READINESS và
cần human review theo TEAMWORK trước khi coi là hoàn tất.

## Vấn đề

ADR0071 chỉ kiểm số dư lúc trả giá. Sau đó số dư vẫn tiêu được cho việc khác, nên người
thắng có thể không còn tiền khi thanh toán; người dùng cũng không thấy ví giảm khi đang
dẫn giá, dễ trả giá vượt khả năng ở nhiều phiên.

## Quyết định

1. Chỉ người đang dẫn bị giữ tiền, đúng bằng mức cam kết của họ: số tiền lượt trả thủ
   công, mức Auto tối đa, hoặc giá mua ngay. Người không dẫn không bị giữ.
2. Vị trí dẫn chỉ đổi sang người thao tác (động cơ proxy FR-AU03–05), nên trong cùng
   transaction của lượt trả: người dẫn cũ được trả lại toàn bộ khoản giữ, người thao tác
   bị giữ mức mới (chỉ phần tăng thêm so với đã giữ). Lượt trả của đối thủ không bao giờ
   phụ thuộc ví của người dẫn. Tắt Auto khi đang dẫn hạ khoản giữ xuống giá hiện tại.
3. Thiếu số dư cho phần cần giữ thêm thì từ chối 409 `InvalidState`, không ghi lượt nào.
   Kiểm tra ADR0071 vẫn chạy cho cam kết chưa có khoản giữ (phiên trước thay đổi này),
   và cộng lại khoản đã giữ cho chính phiên đang trả.
4. Chốt phiên có người thắng: giữ đúng giá chốt, trả lại phần vượt (mức Auto cao hơn giá).
   Thanh toán: khoản giữ về số dư khả dụng rồi được trả cho đơn trong cùng transaction,
   không trừ hai lần. Hết hạn thanh toán, chốt muộn quá hạn, hoặc Admin hủy: trả lại toàn bộ.
   OnHold giữ nguyên khoản giữ đến khi Admin quyết định.
5. Mỗi lần giữ/trả cho người dẫn tạo một thông báo riêng (`AuctionFundsHeld`,
   `AuctionFundsReleased`) chỉ cho chính người đó, có số tiền của họ; người khác không
   thấy số tiền hay mức Auto.

## Ledger và persistence

- Không sửa số dư trực tiếp. Mỗi (phiên, người giữ) có một tài khoản `AuctionBidHold`
  (`ownerId = null`, `auctionId`, `holderId`). Journal hai bút toán cân bằng:
  `AuctionBidHold` (khả dụng → giữ) và `AuctionBidRelease` (giữ → khả dụng), có `auctionId`.
- Index baseline cho mỗi `receiptId` một journal. Vì một lệnh có thể vừa trả người cũ
  vừa giữ người mới (và thanh toán còn có journal đơn), receiptId của journal giữ tiền
  là UUID dẫn xuất từ `sha256(receipt lệnh + holderId)`: duy nhất và tính lại được để
  truy về lệnh gốc.
- Commit-time check: đúng tài khoản giữ của phiên, đúng tài khoản khả dụng của holder,
  đúng chiều, số tiền dương, khoản giữ không âm. Reconcile cộng `auctionHeld` vào bảo
  toàn vốn mô phỏng.
- Migration `0064-auction-bid-holds` mở rộng `wallet_accounts`, `ledger_journals` và loại
  thông báo trên snapshot của 0060. Không backfill: phiên đang chạy chưa có khoản giữ
  cho đến lượt trả kế tiếp; không sửa migration/checksum cũ.

## Contract và client

- `WalletSummary.auctionHeld` (tính trong `total`), `AuctionParticipation.heldAmount`,
  hai loại thông báo mới; mô tả lệnh trả giá/Auto/Mua ngay cập nhật. Đều tùy chọn
  cho server cũ.
- Member web và RN hiện khoản giữ ở ví và trong bảng trả giá; khoản đã giữ cho phiên
  được cộng vào khi tính số còn thiếu để nâng giá.

## Giới hạn

Harness test cũ chạy với `AUCTION_BID_FUNDS_CHECK=Off` (chỉ NODE_ENV=test) vẫn tắt cả
kiểm tra lẫn giữ tiền; khối test ADR0071/0075 bật lại. Phí giao hàng outbound vẫn trả
lúc thanh toán từ số dư khả dụng. Không có kiểm chứng native hay human review trong gói này.
