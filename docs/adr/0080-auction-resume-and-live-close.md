# ADR0080: Admin tiếp tục phiên tạm giữ một lần; đóng phiên từ báo cáo đi qua kênh trực tiếp

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("add this" cho lệnh tiếp
tục phiên OnHold; "make it use live service" cho việc Admin đóng phiên từ báo cáo). Bổ sung
[ADR0079](0079-bounded-auction-lifecycle.md) (trần 48 giờ của OnHold) và
[ADR0031](0031-live-auction-updates.md) (kênh trực tiếp). Không đổi READINESS.

## Quyết định

- Lệnh mới `POST /operations/auctions/{auctionId}/resume` (`resumeAuction`), thân
  `{expectedVersion, reason}` với lý do 10–1.000 ký tự, ghi vào nhật ký quản trị.
- Điều kiện, kiểm trong transaction sau khi khóa người bán, người dẫn giá và phiên:
  - Admin ACTIVE, độc lập với người bán, người trả giá và người đăng ký (cùng luật với hủy phiên);
  - phiên đang `OnHold`, trước `heldAt + 48 giờ`; quá trần trả 409 và worker hủy (`HoldExpired`);
  - người bán và người dẫn giá đã đủ điều kiện lại (ACTIVE, đã xác minh email), nếu không 409;
  - **mỗi phiên chỉ tiếp tục một lần** (`resumedAt` đã có thì 409). Lần tạm giữ sau đó chỉ kết
    thúc bằng hủy của Admin hoặc trần 48 giờ.
- Tiếp tục **không dời mốc thời gian nào**: `startAt`, `endAt`, `plannedEndAt`, `buyNowAt`,
  `biddingOpenedAt` giữ nguyên, nên thời gian tạm giữ không được cộng lại và đồng hồ Dutch không
  lùi. Lượt trả giá, khoản giữ của người dẫn giá và tiền cọc giữ nguyên.
  - Còn trước `endAt`: phiên nhận giá tiếp như trước.
  - Đã qua `endAt` (ví dụ bị giữ lúc chốt): phiên không nhận giá; worker chốt ở lượt kế tiếp
    (bán cho người dẫn giá nếu đủ điều kiện, hạn thanh toán vẫn là `endAt + 24 giờ`).
  - Đang chờ đăng ký mà quá `startAt` khi thiếu người: hủy `RegistrationExpired` như ADR0079.
- Người bán, người trả giá và người đăng ký nhận thông báo `AuctionResumed`.
- Vòng đời dài nhất vì thế vẫn có trần: một lần tạm giữ ≤ 48 giờ, một lần tiếp tục, lần tạm giữ
  thứ hai ≤ 48 giờ rồi hủy; không lệnh nào kéo dài `endAt`.

## Khóa idempotency của worker

- `hold` và `close` trước đây dùng khóa là id phiên, nên sau khi tiếp tục, lần tạm giữ hoặc lần
  chốt thứ hai sẽ chỉ phát lại biên nhận cũ và phiên kẹt ở `Active` sau `endAt`.
- Nay cả hai dùng `stepKey(auctionId, version)` với phiên bản worker đọc khi quét, như
  `expireRegistration`/`expireHold`. Chạy lại cùng phiên bản vẫn phát lại; phiên đã tiếp tục có
  phiên bản mới nên được giữ hoặc chốt lại đúng một lần. Hai lượt quét đồng thời vẫn chỉ một lượt
  ghi (ca E2E AC-AU08/09/13 kiểm khóa mới).

## Kênh trực tiếp

- Kênh trực tiếp phát theo phiên bản tài liệu phiên: lệnh trong cùng tiến trình gọi `nudge()`
  ngay sau commit, còn lại do vòng quét 2 giây. Admin đóng phiên từ báo cáo
  (`closeReportedAuction`), hủy phiên (`cancelAuction`) và tiếp tục phiên (`resumeAuction`) trước
  đây chỉ được vòng quét thấy; nay controller gọi `nudge()` ngay sau commit, nên người đang xem
  phiên nhận `auction:update` (và danh sách nhận `auction:summary`) ngay.
- `AuctionLiveService` được export từ `AuctionsModule` cho `OperationsSupportController`.

## Persistence và contract

- Migration `0068-auction-resume`: `auctions.resumedAt` (null; backfill null), luật
  `resumedAt` chỉ có khi `heldAt` có; thông báo `AuctionResumed`. Không sửa migration cũ.
- OpenAPI: thao tác `resumeAuction`, schema `ResumeAuction`, `OperationsAuctionItem.resumedAt`
  (tùy chọn), loại thông báo `AuctionResumed`.

## Client

- Admin web, hàng đợi phiên: phiên tạm giữ có nút "Xử lý phiên" với một lựa chọn tiếp tục hoặc
  hủy, kèm lý do và xác nhận; tiếp tục bị khóa khi phiên đã tiếp tục một lần.
- Hộp thư thành viên trên web và React Native trước đây chỉ chấp nhận một danh sách loại thông
  báo cũ, thiếu `AuctionFundsHeld`, `AuctionFundsReleased`, `AuctionBiddingStarted`,
  `AuctionNotEnoughBidders`, `AuctionDepositForfeited`, `AuctionRescheduled`. Một dòng thuộc các
  loại đó làm hỏng cả trang hộp thư. Đã bổ sung đủ cùng `AuctionResumed`, và thêm kiểm tra kiểu
  bắt danh sách phải bằng đúng enum trong contract.

## Giới hạn

- Chưa kiểm chứng trên trình duyệt thật hay thiết bị native; hàng đợi Admin chỉ có kiểm thử
  contract, không có kiểm thử giao diện.
- Worker chạy ở tiến trình riêng vẫn dựa vào vòng quét 2 giây của API để phát trực tiếp.
- Con số 48 giờ vẫn là mặc định chưa được chủ dự án xác nhận riêng (ADR0079).
