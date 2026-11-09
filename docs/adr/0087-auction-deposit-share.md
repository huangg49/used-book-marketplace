# ADR0087: Chia tiền cọc bị mất khi sách không bán được, người bán chọn mức tiền cọc

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc (chuyển từ phiên phụ "what is
the best solution for a forfeited deposit": làm theo đề xuất chia tiền cọc và "let the seller
customize the register price"). Thay quyết định 1 của [ADR0086](0086-auction-payment-failures.md)
và phần "tiền cọc về nền tảng" của [ADR0077](0077-auction-registration-deposit.md); bổ sung mức
tiền cọc cố định 10% của ADR0077. Không đổi READINESS. Thay đổi tiền mô phỏng: cần human review.

## Bối cảnh

ADR0077/0086 chuyển toàn bộ tiền cọc của người thắng không thanh toán cho nền tảng, vì không có
liên kết tài khoản (C1 đã bỏ) nên nếu trả hết cho người bán, người bán dùng tài khoản phụ thắng rồi
không thanh toán sẽ lấy lại tiền cọc, tức là đẩy giá không tốn gì. Cái giá là người bán trung thực
không được bù gì khi phiên thất bại. Tiền cọc lại cố định 10% giá khởi điểm, người bán không chọn
được.

## Quyết định

1. **Tiền cọc bị mất vẫn bị giữ ngay khi người thắng quá hạn** (như cũ: vi phạm, đăng ký
   `Forfeited`, bút toán `AuctionDepositForfeit` từ khoản giữ về tài khoản nền tảng).
2. **Sách được người trả giá cao thứ hai mua** (ADR0086, nhận lời mời và thanh toán): nền tảng giữ
   100%. Người bán đã bán được sách, không được trả hai lần.
3. **Sách không bán được** (không có người thứ hai; lời mời bị từ chối hoặc hết hạn; người được mời
   nhận rồi không thanh toán): người bán nhận **50%** số tiền cọc đã mất, nền tảng giữ 50%. Bút
   toán mới `AuctionDepositSellerShare` từ tài khoản nền tảng vào ví khả dụng của người bán, trong
   cùng giao dịch kết thúc phiên; một lần mỗi phiên (receipt id suy ra từ phiên, kiểm tra lúc
   commit đếm đúng một bút toán). Người bán nhận thông báo `AuctionDepositShareReceived` kèm số
   tiền.
4. **Báo cáo đóng phiên** (`Cancelled`, ADR0083/0086) không trả phần nào cho người bán: phiên bị
   đóng vì vi phạm thì không bù cho người bán.
5. **Tỷ lệ 50% là hằng số** (`AUCTION_SELLER_DEPOSIT_SHARE_PERCENT`), làm tròn xuống tới đồng.
   Người bán gian lận vẫn mất ít nhất một nửa tiền cọc mỗi lần, cộng vi phạm cho tài khoản phụ.
6. **Người bán chọn mức tiền cọc khi tạo hồ sơ gửi sách** (`CreateAuctionIntake.depositAmount`,
   tùy chọn): bỏ trống là mặc định cũ (10% giá khởi điểm làm tròn lên 1.000đ, ít nhất 10.000đ).
   Nếu nhập: **từ mức mặc định tới một nửa giá khởi điểm, bội số 1.000đ**; ngoài khoảng là 422 ở
   `depositAmount`. Chỉ tăng, không giảm dưới mặc định, vì tiền cọc thấp làm việc đẩy giá bằng tài
   khoản phụ rẻ hơn. Trần một nửa giá khởi điểm giữ tiền cọc luôn nằm trong giá thắng thấp nhất (giá
   khởi điểm, cũng là giá sàn kiểu Hà Lan), nên phần mất không bao giờ lớn hơn giá. Mức đã chọn cố
   định từ lúc tạo hồ sơ; phiên đăng lên dùng mức đó.
7. **Không tăng mặc định lên 15–20%** (phiên phụ gợi ý tùy chọn): người bán muốn răn đe mạnh hơn tự
   tăng được; mặc định giữ nguyên để không đổi hành vi phiên cũ.

## Persistence và contract

- Migration `0075-auction-deposit-share`, trên snapshot `auctions`/`member_notifications` của 0074,
  `auction_intakes` của 0067, `ledger_journals` của 0066:
  - `ledger_journals`: loại `AuctionDepositSellerShare` (có `auctionId`, `receiptId`; không Order,
    nạp tiền, phí, rút tiền);
  - `auction_intakes`: `depositAmount` (null hoặc 10.000đ tới giá khởi điểm, bội số 1.000đ;
    service kiểm khoảng hẹp hơn), backfill null;
  - `auctions`: tiền cọc không vượt giá khởi điểm (mọi dòng hiện có đều thỏa);
  - `member_notifications`: loại `AuctionDepositShareReceived`.
  Không sửa migration cũ.
- `checkJournal`: bút toán chia phải từ tài khoản nền tảng tới ví khả dụng của đúng người bán, phiên
  `PaymentExpired`, đúng một bút toán mỗi phiên, số tiền bằng 50% tổng tiền cọc mất của phiên.
- OpenAPI: `CreateAuctionIntake.depositAmount`, `AuctionIntake.depositAmount` (mức phiên sẽ dùng),
  loại thông báo mới, mô tả `registerForAuction`.
- **Sửa kèm (lỗi có sẵn):** lịch sử ví trả cả bút toán `AuctionBidHold`/`AuctionBidRelease` của
  người trả giá (từ ADR0075) nhưng enum `WalletHistoryItem.type` và bộ lọc không có hai loại này,
  nên client web/RN parse thất bại với ví từng tham gia đấu giá. Thêm hai loại đó và
  `AuctionDepositSellerShare` vào contract, nhãn web và RN.

## Client

- Member web và RN: khối "Tiền cọc đăng ký" trong form tạo phiên với gợi ý (mặc định, 20%, 30%, 50%
  giá khởi điểm, trong khoảng cho phép), web có thêm ô nhập; lời giải thích mặc định, trần, cọc cao
  có thể làm ít người đăng ký, và việc chia tiền cọc khi sách không bán được. Kiểm lỗi phía client
  giống server; server vẫn quyết định.
- Lịch sử ví: nhãn ba loại bút toán đấu giá.
- Chưa kiểm trên trình duyệt thật hay thiết bị native.

## Kiểm chứng

- Unit: `auction-deposit.spec.ts` (khoảng tiền cọc, làm tròn phần chia); web và RN kiểm khoảng và
  gợi ý.
- E2E `auctions.e2e-spec.ts`, ba ca "ADR 0087": không có người thứ hai thì người bán nhận đúng 50%,
  một lần (worker chạy lại không trả thêm), thông báo và lịch sử ví của người bán và người thắng
  khớp contract; từ chối, hết hạn và người được mời không thanh toán đều trả 50%, người được mời mua
  hoặc báo cáo đóng phiên thì không; người bán đặt tiền cọc 60.000đ trên giá khởi điểm 200.000đ,
  ngoài khoảng bị từ chối, người đăng ký phải trả đúng mức đó; sổ cái đối soát.
- Kết quả: xem commit và SESSION_STATE.
- NOT RUN: trình duyệt, thiết bị native, `pnpm db:migrate` 0071–0075 trên DB local chính (không
  chạy), human review thay đổi tiền.
