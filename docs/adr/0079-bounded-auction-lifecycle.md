# ADR0079: Vòng đời phiên đấu giá có giới hạn — chờ đăng ký, mở, đóng

08/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("phiên phải được
chặn hoàn toàn, không tiền hay thao tác nào giữ phiên vô hạn"). Bổ sung
[ADR0077](0077-auction-registration-deposit.md) và [ADR0078](0078-auction-flag.md); thêm trần
48 giờ cho OnHold của FR-AU09 ([phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md)).
Không đổi READINESS; không là bằng chứng đóng gate settlement.

## Quyết định

- Số người đăng ký tối thiểu: ít nhất **4**, mặc định 4, không có trần nghiệp vụ (1.000 là
  giới hạn kỹ thuật của validator). Hồ sơ gửi sách cũ có 2–3 người được đăng với 4.
- Khi đăng phiên có đăng ký, người bán chọn một trong hai chế độ (`openMode`):
  - **Mở khi đủ người** (`WhenReady`, `startAt: null` khi đăng): `startAt` = lúc đăng + 24 giờ
    và là hạn đăng ký. Đủ người thì phiên mở ngay lúc đó (`startAt` = lúc đủ, giữ nguyên thời
    lượng đã chọn).
  - **Hẹn giờ mở** (`Scheduled`): `startAt` từ 5 phút tới tối đa lúc đăng + 72 giờ. Đủ người
    trước giờ đó thì phiên mở đúng giờ; "Mở ngay" (`POST /auctions/{id}/open-now`) mở sớm.
- Pha chờ đăng ký là `state = Active` với `now < startAt` (như phiên hẹn giờ ADR0047), không
  thêm trạng thái mới. Không ai trả giá được trước `startAt`.
- Tới `startAt` mà chưa đủ người: phiên kết thúc ngay (`phase = Ended`). Mọi lệnh sau đó bị
  từ chối 409 (đăng ký, rút, trả giá, mở ngay, đổi giờ, đổi số người, đóng). Worker ghi
  `Cancelled` với `closeReason = RegistrationExpired`; cọc hoàn, sách về người bán.
- Đổi giờ mở (`POST /auctions/{id}/schedule`) khi đang chờ:
  - tối đa 5 lần;
  - không đổi trong 30 phút cuối trước giờ mở;
  - giờ mới tính từ lúc đăng cố định, luôn trong 72 giờ;
  - bắt buộc có giờ (mở sớm dùng "Mở ngay");
  - phiên `WhenReady` chuyển thành `Scheduled`;
  - người đăng ký nhận `AuctionRescheduled` mỗi lần đổi.
- Đổi số người tối thiểu (`POST /auctions/{id}/min-bidders`): chỉ người bán, chỉ khi đang chờ,
  chỉ **giảm**, không dưới 4, và **khóa khi đã đủ** (người đăng ký đã không rút được). Giảm
  xuống bằng số đã đăng ký thì áp dụng cổng như khi đủ người.
- Người bán đóng phiên (`POST /auctions/{id}/close`) bất kỳ lúc nào **trước giờ mở**:
  `Cancelled`/`SellerClosed`, hoàn mọi cọc, trả sách, báo người đăng ký. Sau giờ mở trả 409.
  Lệnh rút hồ sơ cũ (`/auction-intakes/{id}/cancel`) bị từ chối với phiên có đăng ký, vì nó
  không hoàn cọc (lỗi tiềm ẩn từ ADR0077 được chặn).
- OnHold lưu `heldAt`; quá 48 giờ không được xử lý thì worker hủy (`HoldExpired`), hoàn mọi
  khoản giữ và cọc, trả sách. Admin vẫn hủy được sớm hơn; không có lệnh gia hạn. Lệnh tiếp tục
  một lần, không dời mốc thời gian, được thêm ở [ADR0080](0080-auction-resume-and-live-close.md).
- Admin đóng phiên từ báo cáo (`POST /operations/support-cases/{caseId}/close-auction`):
  - chỉ Admin đang phụ trách hồ sơ, độc lập với người bán, người đăng ký và người trả giá;
  - kèm lời nhắn 10–1.000 ký tự;
  - trong một transaction: phiên `Cancelled`/`Reported` (`cancelReason` = lời nhắn), hoàn mọi
    khoản giữ và cọc, trả sách, báo người bán và mọi người tham gia kèm lời nhắn, hồ sơ chuyển
    `Answered`;
  - chỉ với phiên `OnHold` hoặc `Active` chưa tới `endAt` (phiên đang chốt kết quả có thể đã
    có người thắng).
- Báo cáo (ADR0078) không tạm dừng phiên.

## Các trần

| Trạng thái | Trần |
|---|---|
| Chờ, Mở khi đủ người | lúc đăng + 24 giờ |
| Chờ, Hẹn giờ mở | `startAt` ≤ lúc đăng + 72 giờ |
| Đang mở | `startAt` + thời lượng chọn khi đăng (≤ 7 ngày) |
| Cửa sổ Mua ngay | 60 giây / 5 phút, không kéo dài |
| Chờ thanh toán | hạn hiện có (24 giờ); quá hạn mất cọc, phần còn lại hoàn |
| OnHold | `heldAt` + 48 giờ |

## Thực thi

- Trần tính từ mốc lưu cố định (`publishedAt`, `startAt`, `heldAt`) và validator 0067 chặn
  `startAt` vượt trần theo chế độ.
- Mọi lệnh kiểm hạn trong transaction sau khi khóa phiên (`phaseOf` coi phiên quá giờ mở
  mà thiếu người là `Ended`). Worker chỉ là lưới an toàn: dùng system actor `AuctionClose`,
  khóa idempotency theo `stepKey(auctionId, version)`, chạy lại cùng phiên bản không có hiệu
  lực. `close` cũng hủy (không bán) nếu gặp phiên thiếu người chưa được quét.
- Mọi lối ra (`cancelNow`) hủy, trả sách, báo tin và giải phóng mọi khoản giữ/cọc trong
  cùng transaction. Kiểm tra lúc commit chặn phiên `Cancelled`/`Unsold` còn đăng ký
  `Registered`.

## Persistence và contract

- Migration `0067-auction-lifecycle`:
  - `auctions.openMode` (null cho phiên cũ: giữ luật ADR0077) và `heldAt` (backfill
    `updatedAt` cho phiên OnHold);
  - `closeReason` thêm `RegistrationExpired`, `SellerClosed`, `HoldExpired`, `Reported`
    (với `Cancelled`); `NotEnoughBidders` vẫn chỉ với `Unsold`;
  - `minBidders` intake/phiên 2–1000;
  - thông báo `AuctionRescheduled`;
  - index `{state, heldAt}`.
  Không sửa migration cũ.
- OpenAPI:
  - 4 thao tác mới: `openAuctionNow`, `setAuctionMinBidders`, `closeAuctionBeforeStart`,
    `closeReportedAuction`;
  - `PublicAuctionSummary` thêm `openMode`, `latestStartAt`, `holdExpiresAt`;
  - `OperationsAuctionItem` thêm `holdExpiresAt`;
  - đều tùy chọn cho server cũ.

## Giới hạn

- 24 giờ, 72 giờ và 48 giờ là mặc định do phiên đề xuất; chủ dự án đồng ý tóm tắt nhưng chưa
  xác nhận riêng hai con số 72 và 48.
- Admin đóng phiên từ báo cáo phát qua kênh trực tiếp ngay sau commit từ
  [ADR0080](0080-auction-resume-and-live-close.md).
- RN chưa có màn hình hồ sơ hỗ trợ (ADR0078); Flutter chưa có. Chưa kiểm chứng trình duyệt
  thật hay thiết bị native.
- Bộ kiểm thử ngẫu nhiên dùng seed cố định (4 phiên, 40 thao tác, nhảy đồng hồ), không phải
  fuzzing dài.
