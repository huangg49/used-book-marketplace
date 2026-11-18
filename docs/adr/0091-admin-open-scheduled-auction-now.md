# ADR0091: Admin mở phiên đang chờ ngay cả khi chưa đủ người đăng ký

18/11/2026. Accepted theo yêu cầu của chủ dự án ("i want the admin to be able to open the
auction instantly ignore the 4 registers part"). Bổ sung cho [ADR0081](0081-auction-scheduled-open-grace.md):
đường tự động của hệ thống và đường mở của người bán giữ nguyên; chỉ lệnh mở của Admin
(`POST /operations/auctions/{auctionId}/start`, `startAuction`) được bỏ điều kiện tối thiểu.
Không đổi READINESS.

## Quyết định

- Admin độc lập mở phiên `Scheduled` ngay được **kể cả khi** `registeredCount < minBidders`.
  Lý do (10–1.000 ký tự) vẫn bắt buộc và vẫn được ghi audit/gửi kèm thông báo.
- Khi mở dưới mức tối thiểu, lệnh này là một **override bỏ cổng đăng ký**, trong cùng một
  transaction:
  - hoàn toàn bộ tiền cọc đăng ký đang giữ (`setAuctionHold` về 0) và đánh dấu các bản ghi
    `auction_registrations` sang `Withdrawn` (không xóa: role `latlai_app` không có quyền
    `remove` trên collection `mutable`, và invariant của phiên chỉ bỏ qua `Withdrawn`);
  - `openMode`, `minBidders`, `depositAmount`, `biddingOpenedAt`, `opensAt` về `null`,
    `registeredCount` về 0, nên phiên trả giá như phiên không có đăng ký;
  - `startAt = now`, `plannedEndAt = endAt = now + thời lượng đã hẹn`.
- Khi đã đủ người, lệnh giữ hành vi cũ: giữ nguyên đăng ký và tiền cọc, `biddingOpenedAt = now`,
  `opensAt = now`.
- Thông báo `AuctionBiddingStarted` dùng lời riêng cho trường hợp mở dưới mức tối thiểu: nói
  rõ yêu cầu đủ người không còn áp dụng và tiền cọc đã về ví; không dùng câu "đã đủ người
  đăng ký" (sai sự thật).
- Lệnh demo `advanceDemoAuction` dùng chung `startNowFields` nên cùng một luật.

## Lý do

Chủ dự án cần mở phiên ngay trong vận hành/demo mà không phải chờ đủ 4 người đăng ký. Giữ
nguyên cổng đăng ký cho đường tự động và cho người bán để không đổi ADR0081.

## Hệ quả

- Mở dưới mức tối thiểu là thao tác **có ảnh hưởng tiền**: tiền cọc đăng ký được trả lại trong
  cùng transaction; người đăng ký nhận thông báo kèm lý do.
- Sau override, phiên không còn cổng đăng ký: mọi thành viên đủ điều kiện trả giá, không cần
  đăng ký hay đặt cọc; worker không còn hủy phiên vì thiếu người.
- Validator hiện có vẫn thỏa: nhánh "không đăng ký" đòi `minBidders/depositAmount` null,
  `registeredCount = 0`, `biddingOpenedAt` null và `openMode` null (0066/0067). Không cần
  migration mới.
- Không xóa bản ghi đăng ký ở bất kỳ đâu: `deleteMany` bị Mongo từ chối (thiếu quyền
  `remove`) và invariant `auction registration count mismatch` đếm mọi bản ghi khác
  `Withdrawn`. Người đã đăng ký thấy trạng thái đăng ký kết thúc kèm tiền cọc về ví.
- Admin web: hộp "Mở ngay hoặc hủy phiên đang chờ mở" luôn bật lựa chọn mở; khi thiếu người,
  copy nêu rõ việc bỏ yêu cầu tối thiểu và hoàn cọc, và bước xác nhận nhắc lại.
- OpenAPI: chỉ đổi mô tả `startAuction`; không đổi schema/lệnh.

## Kiểm chứng

- Unit `auction-schedule.spec.ts` / `auction-pause.spec.ts`: dưới mức tối thiểu trả về bộ
  trường override; đủ người giữ nguyên đăng ký và giờ mở.
- Đã chạy thật trên DB local ngày 18/11: phiên `[DEMO] Nhà giả kim` (1/4 đăng ký, version 2)
  mở bằng `POST /operations/auctions/{id}/start`; receipt `Active` version 3; chi tiết phiên
  trả về `phase Live`, `minBidders/depositAmount/opensAt` null, `registeredCount 0`,
  `endAt = startAt + 24 giờ`; queue chuyển dòng sang "Kết thúc …".
- Chưa chạy E2E tự động (cần replica set `_test`); chưa đối chiếu số dư ví người đăng ký sau
  hoàn cọc bằng script riêng — transaction chỉ commit khi invariant của phiên và sổ cái đều
  qua.
