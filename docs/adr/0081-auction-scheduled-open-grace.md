# ADR0081: Phiên có đăng ký luôn hẹn giờ mở; thiếu người thì chờ thêm 24 giờ rồi hủy

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("Remove the option to
open the auction now from the user they can only schedule their auction to open if they have
enough people registered in and if not after 24 hours of that scheduled time the auction will
get cancelled"). Thay phần chế độ mở của [ADR0079](0079-bounded-auction-lifecycle.md) cho phiên
đăng mới; các trần khác của ADR0079 và lệnh tiếp tục của [ADR0080](0080-auction-resume-and-live-close.md)
giữ nguyên. Không đổi READINESS.

## Quyết định

- Người bán **không còn "Mở ngay"**. Lệnh `POST /auctions/{auctionId}/open-now`
  (`openAuctionNow`) bị gỡ khỏi contract và API (404). Lựa chọn "Mở khi đủ người" khi đăng
  phiên cũng bị gỡ.
- Đăng phiên có đăng ký **bắt buộc chọn giờ mở** (`startAt` khi publish), từ 5 phút tới tối
  đa lúc đăng + 72 giờ; thiếu giờ trả 422. Phiên lưu chế độ mới `openMode = ScheduledGrace` và
  giờ đã hẹn ở `opensAt`.
- Phiên chỉ mở khi đủ số người đăng ký tối thiểu (`minBidders`, ít nhất 4 như ADR0079):
  - đủ người **trước** giờ hẹn: phiên mở đúng `opensAt`;
  - tới giờ hẹn mà **chưa đủ**: phiên tiếp tục nhận đăng ký thêm tối đa **24 giờ**
    (`opensAt + 24 giờ`) và mở **ngay lúc đủ người**, giữ thời lượng đã chọn;
  - hết 24 giờ vẫn chưa đủ: phiên bị hủy `Cancelled`/`RegistrationExpired`, hoàn mọi cọc, trả
    sách, báo người bán và người đăng ký ("trong 24 giờ sau giờ mở").
- Mở phiên do hệ thống làm khi lượt đăng ký (hoặc lệnh giảm số người tối thiểu) đưa số người
  tới mức tối thiểu, trong cùng transaction; người bán không có lệnh mở.
- Đổi giờ mở (`POST /auctions/{id}/schedule`): như ADR0079 (tối đa 5 lần, không trong 30 phút
  cuối, trong 72 giờ kể từ lúc đăng) và **chỉ trước giờ hẹn**. Đã qua giờ hẹn thì phiên chỉ chờ
  người, trả 409. Đổi giờ khi đã đủ người thì phiên mở ở giờ mới.
- Staff mở phiên (lệnh `openAuction` cũ, không chọn giờ) dùng `opensAt` = lúc mở: phiên nhận
  đăng ký tối đa 24 giờ và mở ngay khi đủ người.
- Phiên đã có `openMode = WhenReady` hoặc `Scheduled` giữ luật ADR0079. Lần đổi giờ kế tiếp
  chuyển phiên đó sang `ScheduledGrace`.

## Lưu trữ

- Trong lúc chưa đủ người, `startAt` là **hạn đăng ký** (`opensAt + 24 giờ`), nên `phaseOf`,
  `registrationExpired`, lượt quét của worker và mọi lệnh kiểm hạn giữ nguyên như ADR0079.
- Khi đủ người, `startAt`, `endAt`, `plannedEndAt` và `biddingOpenedAt` được đặt thành giờ mở
  thật: `opensAt` nếu chưa tới giờ hẹn, ngược lại là lúc đủ người.
- Migration `0069-auction-scheduled-open`:
  - thêm `auctions.opensAt` (backfill `null`) và giá trị `ScheduledGrace` cho `openMode`;
  - validator: `opensAt` có giá trị đúng khi `openMode = ScheduledGrace`,
    `opensAt ≤ publishedAt + 72 giờ` và `opensAt ≤ startAt ≤ opensAt + 24 giờ`.
  Không sửa migration cũ.
- OpenAPI: bỏ `openAuctionNow`; `PublicAuctionSummary.openMode` thêm `ScheduledGrace`; thêm
  `opensAt` (tùy chọn cho server cũ); mô tả `PublishAuction.startAt` và
  `RescheduleAuction.startAt` theo luật mới.

## Các trần

| Trạng thái | Trần |
|---|---|
| Giờ mở hẹn | ≤ lúc đăng + 72 giờ |
| Chờ đủ người sau giờ hẹn | `opensAt` + 24 giờ |
| Đang mở | giờ mở thật + thời lượng chọn (≤ 7 ngày) |
| Chờ thanh toán, OnHold | như ADR0079/ADR0080 |

Vòng đời dài nhất của phiên mới: 72 giờ + 24 giờ + thời lượng + 24 giờ thanh toán (cộng tạm
giữ có trần của ADR0079/ADR0080).

## Client

- Member web và RN: hộp đăng/đổi giờ chỉ còn chọn giờ, hiển thị "nếu đủ người" và hạn chờ
  thêm 24 giờ; khối người bán bỏ nút "Mở ngay" và báo khi đã qua giờ hẹn. Thẻ và trang phiên
  hiện "Mở lúc" (giờ hẹn) hoặc "Hạn đăng ký" (sau giờ hẹn khi còn thiếu người); thời điểm kết
  thúc chỉ hiện khi đã đủ người.
- Flutter chưa có màn hình đấu giá. Chưa kiểm trên thiết bị native.

## Kiểm chứng

- Unit `auction-schedule.spec.ts`: bắt buộc giờ, hạn = giờ hẹn + 24 giờ, mở đúng giờ hoặc ngay
  khi đủ trong 24 giờ, hết hạn, đổi giờ bị chặn trong 30 phút cuối và sau giờ hẹn.
- E2E `auctions.e2e-spec.ts` (nhóm ADR0077/0079/0080/0078, replica `_test`): publish thiếu giờ
  422, `open-now` 404, đủ người trước giờ mở đúng giờ, thiếu người lúc giờ hẹn vẫn chờ, đủ sau
  5 giờ thì mở ngay, hết 24 giờ hủy và hoàn cọc, bộ thao tác ngẫu nhiên với trần mới.
- Test có fixture dời `opensAt` về lúc đăng để mô phỏng "đã qua giờ hẹn" thay vì chờ thật;
  seed demo dùng cùng fixture cho các phiên cần mở ngay.
