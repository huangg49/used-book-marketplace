# ADR0084: Một mô hình tạm dừng phiên đấu giá — cộng lại thời gian, ngân sách tạm dừng, tạm dừng từ báo cáo

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("start phase B") cho nhóm B
của kế hoạch sửa lỗi thiết kế đấu giá (C3, H2, H3, M1, M2). Thay luật "tiếp tục một lần, không dời
mốc" của [ADR0080](0080-auction-resume-and-live-close.md) và trần 48 giờ cố định của
[ADR0079](0079-bounded-auction-lifecycle.md). Không đổi READINESS.

Ba con số dùng mặc định của kế hoạch vì chủ dự án chưa chọn khác: mỗi lần tạm dừng tối đa
**48 giờ**, tổng các lần tạm dừng của một phiên tối đa **72 giờ**, tiếp tục cho ít nhất **10 phút**
đấu giá. Chủ dự án có thể đổi; chỉ cần sửa hằng số và một migration mới.

## Quyết định

- **Hai lý do tạm dừng, một mô hình** (`holdReason`):
  - `Eligibility`: worker tạm giữ khi người bán hoặc người dẫn giá không còn đủ điều kiện (như cũ);
  - `Review` (H2): Admin đang phụ trách một báo cáo về phiên, độc lập với người bán, người đăng ký
    và người trả giá, tạm dừng phiên để xem xét (`POST /operations/support-cases/{caseId}/freeze-auction`,
    kèm lời nhắn 10–1.000 ký tự). Chỉ với phiên `Active` (đang chờ người đăng ký, đang diễn ra,
    hoặc đã qua giờ kết thúc nhưng worker chưa chốt) và còn ngân sách tạm dừng. Lượt trả giá, đăng
    ký và tiền cọc giữ nguyên; lời nhắn gửi người bán và mọi người tham gia, ghi vào hồ sơ; hồ sơ
    vẫn mở. Báo cáo không tự tạm dừng phiên (tránh để người tham gia dừng phiên của đối thủ).
- **Ngân sách tạm dừng** (M2, C3): mỗi lần tạm dừng tự hủy tại `holdUntil` = lúc tạm dừng + min(48
  giờ, ngân sách còn lại); tổng thời gian được cộng lại của một phiên (`pausedMs`) không quá 72 giờ.
  Bỏ giới hạn "tiếp tục một lần": Admin tiếp tục được nhiều lần trong ngân sách. Hết ngân sách thì
  lần tạm giữ sau tự hủy ngay ở lượt quét kế tiếp, và lệnh tạm dừng từ báo cáo bị từ chối 409. Hủy
  tự động hoàn mọi khoản giữ và tiền cọc, trả sách (`HoldExpired`), như trước.
- **Cộng lại thời gian khi tiếp tục** (H3, M1): mọi mốc lưu của phiên (`startAt`, `endAt`,
  `plannedEndAt`, `opensAt`, `buyNowAt`, `biddingOpenedAt`) cùng lùi một khoảng bằng thời gian tạm
  dừng, nên thời gian đấu giá còn lại, cửa sổ Mua ngay, đồng hồ Dutch (giá tiếp tục từ mức lúc tạm
  dừng) và giờ mở/hạn đăng ký của phiên đang chờ đều tiếp tục từ chỗ dừng.
  - Phiên đang diễn ra còn ít hơn 10 phút lúc tạm dừng được cộng thêm cho đủ 10 phút (trong ngân
    sách còn lại).
  - Phiên bị tạm giữ đúng lúc hoặc sau giờ kết thúc (worker gặp người không đủ điều kiện khi chốt)
    không được cộng thêm gì; tiếp tục thì worker chốt ngay như ADR0080.
- **C3**: chỉ Admin khóa tài khoản hoặc Admin trên báo cáo mới tạm dừng được phiên; người bán hay
  người dẫn giá không tự tạm dừng. Nếu sau này có chức năng tự khóa tài khoản, nó không được kích
  hoạt tạm giữ.

## Persistence và contract

- Migration `0072-auction-pause-budget`:
  - thêm `holdReason` (`Eligibility` | `Review` | null), `holdUntil`, `pausedMs` (0–72 giờ);
  - backfill: phiên `OnHold` hiện có nhận `Eligibility`, `holdUntil` = `heldAt + 48 giờ`; phiên khác
    nhận null/0;
  - validator: `OnHold` ⇔ có `holdReason` ⇔ có `holdUntil`; `heldAt ≤ holdUntil ≤ heldAt + 48 giờ`;
    `pausedMs + (holdUntil − heldAt) ≤ 72 giờ`; ba trần tính từ `publishedAt` (giờ mở 30 ngày,
    `WhenReady` 24 giờ, `Scheduled` 72 giờ) cộng thêm `pausedMs`. Các luật tương đối (endAt so với
    plannedEndAt/buyNowAt, startAt so với opensAt, độ dài ≤ 7 ngày) vẫn đúng vì mọi mốc lùi cùng
    một khoảng. Không sửa migration cũ;
  - index `{state, holdUntil}` cho lượt quét hủy tạm dừng.
- Kiểm tra bất biến "không có lượt giá trước `startAt`" cho phép lượt giá sớm hơn `startAt` tối đa
  `pausedMs` (lượt giá trước khi tạm dừng).
- OpenAPI: thao tác mới `freezeReportedAuction` (body `FreezeReportedAuction`);
  `OperationsAuctionItem` thêm `holdReason`, `pauseBudgetLeftSeconds`; mô tả `resumeAuction` và
  `resumedAt` theo luật mới. `holdExpiresAt` nay là `holdUntil`.

## Client

- Admin web: trang hồ sơ báo cáo có "Tạm dừng phiên để xem xét" (khi phiên đang `Active`) cạnh
  "Đóng phiên đấu giá"; khối xử lý phiên tạm giữ hiện lý do tạm dừng, ngân sách còn lại, luôn cho
  chọn tiếp tục và nói rõ thời gian được cộng lại; hàng đợi phiên ghi "Tạm dừng vì báo cáo".
- Member web và RN: thông báo phiên tạm dừng nói thời gian được cộng lại khi tiếp tục; lý do
  `HoldExpired` nói "hết thời gian tạm dừng". Thông báo `AuctionOnHold`/`AuctionResumed` theo lý do
  và giờ kết thúc mới.
- Chưa kiểm trên trình duyệt thật hay thiết bị native.

## Kiểm chứng

- Unit `auction-pause.spec.ts`: hạn tạm dừng theo ngân sách, lùi mọi mốc, ít nhất 10 phút kể cả
  cửa sổ Mua ngay, không vượt ngân sách, không cộng khi tạm giữ sau giờ kết thúc, phiên đang chờ,
  giá Dutch giữ nguyên, trần 30 ngày tăng theo `pausedMs`.
- E2E `auctions.e2e-spec.ts`: tiếp tục sau 2 giờ lùi mọi mốc 2 giờ, tạm giữ lần hai rồi tiếp tục
  lần nữa và chốt bình thường; ngân sách gần hết rút ngắn lần tạm giữ, hết ngân sách từ chối tạm dừng
  từ báo cáo; Admin trên báo cáo tạm dừng (từ chối khi chưa nhận hồ sơ, có liên quan, sai phiên bản,
  lời nhắn ngắn; replay), người tham gia nhận lời nhắn, rồi tiếp tục với thời gian được cộng lại. Hai
  ca cũ của ADR0080 ("tiếp tục một lần, không dời mốc", lỗi "48 giờ") được sửa theo luật mới.
- Kết quả (09/11/2026, replica set `rs-test`, database `*_test`): unit đấu giá 81/81; E2E nhóm
  "ADR 0077" 40/40; toàn bộ `auctions.e2e-spec.ts` 136/136; `support.e2e-spec.ts` 14/14; Mongo specs
  61 đạt, 8 bỏ qua; admin-web 250, user-web 477, RN 231; type check API, admin, user-web, RN và
  `contract:check` đạt.
- NOT RUN: kiểm trên trình duyệt (Admin tạm dừng/tiếp tục), thiết bị native, `pnpm db:migrate` cho
  0071/0072 trên DB local chính (DB local chính không chạy).
