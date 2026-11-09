# ADR0086: Người thắng không thanh toán — mời người trả giá cao thứ hai, báo cáo đóng được phiên chưa thanh toán, ngừng đấu giá kín giá thứ hai

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("start Phase D") cho nhóm D
của kế hoạch sửa lỗi thiết kế đấu giá (H5, C2) và phần 2 của H1 (chuyển từ nhóm A). Bổ sung
[ADR0076](0076-auction-formats.md), [ADR0077](0077-auction-registration-deposit.md),
[ADR0079](0079-bounded-auction-lifecycle.md) và [ADR0083](0083-auction-phase-a-fixes.md). Không đổi
READINESS.

Chủ dự án chưa chọn ở ba quyết định của kế hoạch, nên phiên làm việc chọn theo quy tắc "tự chọn
phương án khả thi nhất và ghi lại":

1. **Tiền cọc bị mất (quyết định 1): vẫn về nền tảng, không về người bán.** Kế hoạch gốc đề xuất
   chuyển 100% cho người bán, nhưng đề xuất đó dựa trên kiểm tra liên kết tài khoản (C1), đã bị bỏ
   khỏi kế hoạch. Không có C1, người bán có thể dùng tài khoản phụ thắng rồi không thanh toán mà
   lấy lại tiền cọc, tức là đẩy giá không tốn gì. Giữ lý do của ADR0077. Có thể xem lại nếu C1
   được làm.
2. **Mời người trả giá cao thứ hai (quyết định 2): có, 24 giờ, một lần**, ở mức giá cao nhất của
   chính họ.
3. **Đấu giá kín giá thứ hai (quyết định 3): ngừng nhận phiên mới (phương án 2).** Không có liên
   kết tài khoản thì quy trình khiếu nại chỉ răn đe chứ không chặn được giá kín giả của người bán,
   và còn cần công khai giá kín, xét khiếu nại, đổi giá và chuyển tiền cọc. Phiên và hồ sơ gửi sách
   đã có giữ nguyên định dạng và kết thúc bình thường.

## Quyết định

- **H5 — mời người trả giá cao thứ hai.** Khi người thắng hết hạn thanh toán, hệ thống làm như cũ
  (ghi vi phạm, tiền cọc về nền tảng, hoàn khoản giữ còn lại, Order `PaymentExpired`). Sau đó, nếu
  có người trả giá cao thứ hai thì phiên chuyển `SecondChanceOffered` thay vì trả sách:
  - người trả giá cao thứ hai là thành viên khác có mức cao nhất (mức của họ ở kiểu Anh, giá kín ở
    kiểu kín); giá mời là mức đó. Không mời ở kiểu Hà Lan (chỉ một người chấp nhận), khi không có
    người thứ hai, hoặc khi người đó không còn giao dịch được (không `ACTIVE`, chưa xác minh email,
    đang bị hạn chế);
  - chỉ người được mời thấy giá mời (`AuctionParticipation.secondChance`); trang công khai chỉ thấy
    trạng thái và hạn (`secondChanceDeadline`);
  - **Nhận** (`acceptAuctionSecondChance`, trước hạn, đúng phiên bản): kiểm tra như người thắng
    (không bị hạn chế, người bán còn đủ điều kiện, giới hạn 5 phiên, ví đủ tiền), phiên về
    `AwaitingWinnerPayment` với họ là người thắng ở giá mời, một Order ViaPoint mới hình thành
    (thanh toán trong 24 giờ kể từ lúc nhận) và ví giữ số tiền đó. Thanh toán thì phiên `Sold` như
    thường. Không thanh toán thì phiên kết thúc `PaymentExpired`, ghi vi phạm cho họ (theo Order của
    họ) và trả sách; không mời người thứ ba. Họ không còn tiền cọc (đã hoàn khi phiên chốt);
  - **Từ chối** (`declineAuctionSecondChance`) hoặc **hết 24 giờ** (worker): phiên `PaymentExpired`,
    trả sách cho người bán, báo người bán và người được mời. Không có khoản nào bị trừ.
- **H1 phần 2 — báo cáo đóng được phiên chưa thanh toán.** Admin phụ trách báo cáo (ADR0079/0083)
  đóng được phiên `AwaitingWinnerPayment` trước khi người thắng trả tiền và phiên
  `SecondChanceOffered`. Order chờ thanh toán chuyển `Cancelled` mà không có khoản thanh toán hay
  hoàn tiền nào; khoản giữ của người thắng, kể cả tiền cọc, được hoàn (đăng ký `Refunded`, không
  `Forfeited`), sách trả lại người bán. Thành viên báo cáo được phiên ở hai trạng thái này.
- **C2.** Tạo hồ sơ gửi sách `SealedSecond` mới bị từ chối 422; form web và RN ẩn lựa chọn này (bản
  nháp đã chọn vẫn hiện nhãn).

## Persistence và contract

- Migration `0074-auction-second-chance`:
  - `auctions`: trạng thái `SecondChanceOffered`; trường `runnerUpId`, `runnerUpPrice`,
    `runnerUpOfferedAt`, `runnerUpDeadline` (= `runnerUpOfferedAt + 24 giờ`), `runnerUpOutcome`
    (`Offered`, `Accepted`, `Declined`, `Expired`, `Cancelled`), `defaultedOrderId` (Order đã hết
    hạn của người thắng đầu); các trường người thắng được giữ khi đang mời và khi `Cancelled`;
    `AwaitingWinnerPayment` chấp nhận người được mời đã nhận (người thắng = `runnerUpId`, giá =
    `runnerUpPrice`, hạn thanh toán ≤ `runnerUpDeadline + 24 giờ`); index `{state, runnerUpDeadline}`;
    backfill null;
  - `point_orders`: khóa duy nhất `{auctionId, buyerId}` thay `{auctionId}` (mỗi phiên tối đa hai
    Order, mỗi người mua một); thêm dạng `Cancelled` chưa thanh toán;
  - `member_notifications`: loại `AuctionSecondChanceOffered`.
  Không sửa migration cũ.
- Khóa idempotency của bước hết hạn thanh toán theo Order (`stepKey(orderId, 0, 'expirePayment')`),
  để lần hết hạn của người được mời không trùng lần đầu. Vi phạm không thanh toán của người được mời
  ghi theo Order của họ, vì index `member_violations` cho một vi phạm mỗi (loại, nguồn).
- Kiểm tra bất biến: Order đã hết hạn của người thắng đầu chỉ còn khớp với phiên ở các trường của
  chính nó sau khi người được mời nhận; hồ sơ gửi sách vẫn `Auctioning` khi đang mời; Order
  `Cancelled` chưa thanh toán không có khoản hoàn.
- OpenAPI: thao tác `acceptAuctionSecondChance`, `declineAuctionSecondChance`; schema
  `AuctionSecondChance`; `AuctionParticipation.secondChance`; `PublicAuctionSummary.secondChanceDeadline`;
  trạng thái `SecondChanceOffered` ở các enum; mô tả `closeReportedAuction` và `AuctionType`.

## Client

- Member web và RN: khối "Bạn được mời mua sách này" cho người được mời (giá, hạn, ví thiếu tiền,
  xác nhận nhận hoặc từ chối); nhãn trạng thái và lời cho người bán; ẩn kín giá thứ hai khi tạo phiên.
- Admin web: khối đóng phiên trên hồ sơ báo cáo hiện cả khi phiên chờ người thắng thanh toán hoặc
  đang mời, kèm lời giải thích.
- Chưa kiểm trên trình duyệt thật hay thiết bị native.

## Kiểm chứng

- E2E `auctions.e2e-spec.ts`, sáu ca "ADR 0086": mời đúng người và giá, hạn 24 giờ, sách còn ở
  phiên, người bán được báo, chỉ người được mời trả lời (404 với người khác, 409 sai phiên bản),
  nhận có replay, giữ tiền, Order thứ hai, thanh toán thì `Sold` và sổ cái đối soát; từ chối, hết
  hạn và người được mời không thanh toán đều kết thúc `PaymentExpired`, trả sách, không mời tiếp;
  không mời khi người thứ hai bị khóa; báo cáo đóng phiên chưa thanh toán (Order `Cancelled` không
  có bút toán, tiền cọc hoàn, sách trả lại) và đóng phiên đang mời; tạo `SealedSecond` mới bị từ
  chối. Ca cũ "người thắng không thanh toán mất tiền cọc" nay kiểm thêm trạng thái mời; các ca kín
  giá thứ hai cũ dùng hồ sơ tạo kiểu kín giá thứ nhất rồi ghi fixture `SealedSecond`, đại diện hồ sơ
  có trước quyết định này.
- Quan hệ với FR-AU08 ([phụ lục TP.HCM](../features/LOCAL_HANDOVER_AUCTION.md)): "không tự bán cho
  người thứ hai" vẫn đúng vì chỉ bán khi người được mời tự nhận; đây là phần mở rộng của FR-AU08,
  phụ lục không được sửa trong ADR này. Ca cũ AC-AU08 nay kiểm lời mời rồi hết hạn trước khi trả sách.
- Kết quả (09/11/2026, replica set `rs-test`, database `*_test`): unit đấu giá 91/91; toàn bộ
  `auctions.e2e-spec.ts` 148/148 (lần chạy đầu lỗi do hai dòng kỳ vọng bị sửa nhầm và một ca mới
  quá 15 giây khi chạy cả file; đã sửa, ca đó nay có giới hạn 60 giây như các ca nặng khác);
  `support-cases.e2e-spec.ts` 14/14; Mongo specs 61 đạt, 8 bỏ qua; admin-web 250, user-web 480,
  RN 236; type check API, admin, user-web, RN; `contract:check`, `contract:routes` (269 thao tác)
  và oxlint API đạt.
- NOT RUN: kiểm trên trình duyệt (khối lời mời, đóng phiên từ báo cáo), thiết bị native,
  `pnpm db:migrate` cho 0071–0074 trên DB local chính (DB local chính không chạy).
