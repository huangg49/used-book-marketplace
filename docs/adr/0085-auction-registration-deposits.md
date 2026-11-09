# ADR0085: Đăng ký và tiền cọc đấu giá — giờ mở chỉ sớm hơn khi đủ người, rút cọc tới 72 giờ trước giờ mở, không mở phiên ban đêm

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("start phase C") cho nhóm C
của kế hoạch sửa lỗi thiết kế đấu giá (H4, N1, M3, M4, L5). Bổ sung
[ADR0077](0077-auction-registration-deposit.md), [ADR0079](0079-bounded-auction-lifecycle.md),
[ADR0081](0081-auction-scheduled-open-grace.md) và [ADR0082](0082-auction-open-month-two-changes.md). Không đổi READINESS.

Các con số dùng mặc định của kế hoạch vì chủ dự án chưa chọn khác: rút đăng ký khi đã đủ người
tới **72 giờ** trước giờ mở (quyết định 9, thay vì "chỉ mở đăng ký 7 ngày trước giờ mở"); phiên
đủ người sau giờ mở thì mở sau **10 phút**, khung đêm **23:00–07:00** giờ Việt Nam (quyết định 6).
Quyết định 10 (người bán có được chọn giờ mở ban đêm không) giữ như hiện tại: được chọn, vì người
đăng ký đã biết giờ đó từ trước. Chủ dự án có thể đổi; chỉ cần sửa hằng số và một migration mới.

## Quyết định

- **H4 — giờ mở chỉ sớm hơn khi đã đủ người.** Khi `registeredCount ≥ minBidders`, người bán đổi
  giờ mở (`rescheduleAuction`) chỉ được sang giờ sớm hơn giờ mở hiện tại (vẫn ít nhất 5 phút sau
  hiện tại, vẫn tính vào 2 lần đổi, vẫn khóa 30 phút cuối). Dời muộn hơn hoặc giữ nguyên giờ bị từ
  chối 422. Không mở lại quyền rút sau mỗi lần đổi giờ, vì người bán có thể dùng việc đó để làm
  trống một phiên đã đủ người.
- **N1 — rút đăng ký tới 72 giờ trước giờ mở.** Phiên `ScheduledGrace` đã đủ người vẫn cho người
  đăng ký chưa trả giá rút và nhận lại tiền cọc khi còn hơn 72 giờ tới `opensAt`
  (`fullWithdrawUntil` = `opensAt − 72 giờ`). Lượt rút làm phiên dưới mức tối thiểu đưa phiên về
  chờ người đăng ký: `startAt = opensAt + 24 giờ`, `biddingOpenedAt = null`, độ dài giữ nguyên;
  người bán và những người đăng ký còn lại nhận thông báo (loại `AuctionRescheduled`, lời riêng
  "Phiên đấu giá chưa đủ người đăng ký", không thêm loại thông báo mới). Đủ người lại thì phiên
  lại mở lúc `opensAt`. Dưới 72 giờ, hoặc phiên đã qua giờ mở, tiền cọc giữ tới khi phiên kết thúc
  như ADR0077. Phiên đời cũ (`WhenReady`, `Scheduled`, không có `opensAt`) giữ luật cũ.
- **M3 — không mở phiên ban đêm khi đủ người muộn.** Phiên đủ người sau giờ mở (trong 24 giờ chờ)
  mở 10 phút sau lúc đủ người, để người đăng ký nhận giờ mở trước; nếu lúc đó rơi vào 23:00–07:00
  giờ Việt Nam (UTC+7, không có giờ mùa hè) thì mở lúc 07:00. Độ dài phiên tính từ lúc mở thật.
  Áp dụng cả khi đủ người nhờ người bán giảm số tối thiểu. Đủ người trước giờ mở thì vẫn mở đúng
  giờ người bán hẹn. Thông báo `AuctionBiddingStarted` đổi tiêu đề thành "Phiên đấu giá đã đủ người
  đăng ký" và nêu giờ trả giá từ … đến …. Hạn chờ 24 giờ không đổi: phiên đã đủ người trước hạn thì
  không bị hủy dù giờ mở thật rơi sau hạn.
- **M4 — người dẫn giá không bị giữ tiền hai lần.** Đã đúng từ ADR0075/0077 (`holdTo` giữ mức lớn
  hơn giữa giá dẫn và tiền cọc, không cộng hai khoản); ADR này chỉ thêm kiểm thử đối soát ví.
- **L5 — tăng số người tối thiểu khi chưa ai đăng ký.** Người bán tăng `minBidders` (tối đa 1.000)
  chỉ khi `registeredCount = 0`; đã có người đăng ký thì chỉ giảm (không dưới 4) như ADR0079, để
  điều kiện của người đã tham gia không đổi. Đặt lại đúng giá trị hiện tại bị từ chối 422.

## Persistence và contract

- Migration `0073-auction-reached-notice`: luật 0069 `startAt ≤ opensAt + 24 giờ` thành "hoặc
  vậy, hoặc phiên đã đủ người (`biddingOpenedAt` có giá trị) và `startAt ≤ opensAt + 24 giờ + 8 giờ
  10 phút`" (độ trễ lớn nhất của luật M3: đủ người lúc 22:50, mở 07:00). Phiên đang chờ vẫn đúng
  hạn 24 giờ. Chỉ thay validator, không có trường mới hay backfill. Không sửa migration cũ.
- OpenAPI: `PublicAuctionSummary.fullWithdrawUntil` (mới); mô tả `rescheduleAuction`,
  `setAuctionMinBidders`, `SetAuctionMinBidders.minBidders`, `withdrawAuctionRegistration` theo
  luật mới.
- Hằng số ở `auction-constants.ts`: `AUCTION_FULL_WITHDRAW_MS`, `AUCTION_REACHED_NOTICE_MS`,
  `AUCTION_NIGHT_START_HOUR`, `AUCTION_NIGHT_END_HOUR`, `AUCTION_LOCAL_OFFSET_MS`,
  `AUCTION_NIGHT_ALLOWANCE_MS`.

## Client

- Member web và RN: khối đăng ký hiện nút rút khi còn được rút (kể cả phiên đã đủ người tới
  `fullWithdrawUntil`) và nói rõ hạn đó, ẩn nút khi tiền cọc đã bị giữ tới cuối phiên; câu luật
  mở phiên nói "mở 10 phút sau khi đủ (khung 23:00–07:00 thì lúc 07:00)"; khối người bán chỉ cho
  chọn giờ sớm hơn khi đã đủ người, cho tăng số người tối thiểu khi chưa ai đăng ký.
- Admin web không đổi.
- Chưa kiểm trên trình duyệt thật hay thiết bị native.

## Kiểm chứng

- Unit `auction-registration-rules.spec.ts`: khung đêm, độ trễ lớn nhất bằng phần nới của
  validator, mở đúng giờ hẹn hoặc sau 10 phút hoặc 07:00, `WhenReady` cũ mở ngay, hạn rút khi đủ
  người, đưa phiên về chờ, đổi giờ chỉ sớm hơn khi đủ người. Ca cũ của `auction-schedule.spec.ts`
  ("đủ người trong 24 giờ chờ thì mở ngay") sửa theo luật mới.
- E2E `auctions.e2e-spec.ts`, sáu ca "ADR 0085": đủ người ban ngày mở sau 10 phút (không trả giá
  và không rút được trong 10 phút đó, thông báo nêu giờ); đủ người lúc 02:00 với hạn 03:00 thì mở
  07:00, worker không hủy ở hạn; rút từ phiên đủ người trước 72 giờ hoàn cọc, đưa phiên về chờ,
  báo người bán và người còn lại, đủ người lại thì mở lúc `opensAt`, dưới 72 giờ bị từ chối; đổi
  giờ chỉ sớm hơn khi đủ người; tăng tối thiểu chỉ khi chưa ai đăng ký; người dẫn giá giữ mức lớn
  hơn giữa giá và cọc, bị vượt thì về mức cọc. Ba ca cũ ("mở ngay khi đủ" sau giờ mở, đồng hồ Dutch,
  tối thiểu "chỉ giảm") sửa theo luật mới; helper `fill` dời giờ mở thật về lúc đủ người bằng một
  lần ghi fixture (như `liveOf`) để các ca khác trả giá ngay.
- Kết quả (09/11/2026, replica set `rs-test`, database `*_test`): unit đấu giá 91/91 (10 file); E2E
  nhóm "ADR 0077" 46/46; toàn bộ `auctions.e2e-spec.ts` 142/142; `support-cases.e2e-spec.ts` 14/14;
  Mongo specs 61 đạt, 8 bỏ qua; user-web 480, RN 234; type check API, user-web, RN, `contract:check`
  và oxlint API đạt (user-web chỉ thêm cảnh báo `Date.now` khi render, cùng mẫu với khối người bán
  sẵn có).
- NOT RUN: kiểm trên trình duyệt (khối đăng ký, đổi giờ, tăng tối thiểu), thiết bị native, admin-web
  (không đổi), `pnpm db:migrate` cho 0071–0073 trên DB local chính (DB local chính không chạy).
