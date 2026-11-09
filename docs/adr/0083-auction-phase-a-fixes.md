# ADR0083: Sửa nhóm A của kế hoạch lỗi thiết kế đấu giá

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("Start Phase A") cho kế hoạch
sửa lỗi thiết kế đấu giá ADR0074–0082 (bản đã bỏ phần liên kết tài khoản). Nhóm A gồm năm mục
không cần quyết định nghiệp vụ: H1, L3, L4, M5, L1. Bổ sung [ADR0079](0079-bounded-auction-lifecycle.md),
[ADR0080](0080-auction-resume-and-live-close.md) và [ADR0078](0078-auction-flag.md). Không đổi READINESS.

## Quyết định

- **H1. Đóng phiên từ báo cáo sau giờ kết thúc.** Admin phụ trách báo cáo đóng được phiên `Active`
  cả khi đã qua `endAt`, cho tới lúc worker chốt phiên (như lệnh hủy thường của Admin). Khóa phiên
  quyết định khi worker chốt cùng lúc: đúng một bên thành công, bên kia nhận 409. Sau khi worker
  đã chốt (`AwaitingWinnerPayment`, có Order chờ thanh toán) báo cáo vẫn không đóng được phiên.
  Hủy Order chờ thanh toán từ báo cáo cần trạng thái Order mới, thay đổi validator phiên/Order và
  luật hoàn tiền người thắng, nên chuyển sang nhóm D (thanh toán thất bại) thay vì làm ở đây.
- **L3. Lý do tiếp tục phiên tới người tham gia.** Lý do Admin nhập khi tiếp tục phiên OnHold được
  trích trong thông báo `AuctionResumed` gửi người bán, người trả giá và người đăng ký ("Lời nhắn
  của quản trị viên: “…”"), rút gọn để nội dung không quá 400 ký tự; nhật ký quản trị giữ bản đầy
  đủ. Không lưu thêm trường trên phiên (không cần migration). Form Admin báo trước rằng lý do được
  gửi cho thành viên.
- **L4. Khóa idempotency của worker theo bước.** `stepKey(id, version, step)` thêm tên bước cho ba
  bước cùng dùng system actor `AuctionClose`/thao tác `closeAuction`: `close`, `expireRegistration`,
  `expireHold`. Khóa các bước không thể trùng nhau theo cấu trúc. Biên nhận cũ (khóa không có tên
  bước) không bị phát lại sai: lệnh chạy lại trên phiên đã đổi phiên bản bị kiểm trạng thái từ chối.
  Các bước khác (`hold`, thu hồi tại điểm) giữ khóa cũ vì đã có system actor riêng.
- **M5. Giới hạn đăng ký (POL-41).** Đăng ký phiên bị từ chối 429 `RATE_LIMITED` khi:
  - người dùng đã có 5 phiên đang tham gia: đăng ký còn hiệu lực (đang giữ cọc), phiên đang dẫn
    giá, phiên thắng chờ thanh toán (đếm theo phiên, không trùng);
  - đã có 30 lượt đăng ký hoặc rút đăng ký trong 1 phút;
  - đăng ký lại cùng phiên trong vòng 1 phút sau khi rút.
  Rút đăng ký không bị giới hạn (để thành viên luôn lấy lại được cọc).
- **L1. Gom báo cáo cùng đối tượng cho Admin.** Mỗi hồ sơ trong hàng đợi và trang hồ sơ của Admin
  có `otherOpenOnTarget`: số hồ sơ khác chưa `Closed` về cùng đối tượng (loại hồ sơ có liên quan
  tới Admin đang xem, như hàng đợi). Hàng đợi Admin lọc được theo `targetType` + `targetId` để xem
  mọi báo cáo về một phiên cùng lúc. Thành viên không bao giờ nhận trường này, nên người báo cáo
  không biết người khác đã báo cáo hay chưa; không có nhãn "đang xem xét" công khai.

## Persistence và contract

- Migration `0071-support-target-index`: index `support_target_state_idx`
  (`target.type`, `target.id`, `state`) cho `support_cases`. Không đổi document hay validator.
- OpenAPI:
  - `listOperationsSupportCases` thêm tham số `targetType`, `targetId`;
  - `SupportCaseSummary.otherOpenOnTarget` (tùy chọn, chỉ trong đọc của Admin);
  - mô tả `closeReportedAuction`, `resumeAuction`/`ResumeAuction.reason`, `registerForAuction`
    (429) theo luật mới.

## Kiểm chứng

- Unit: `system-key.spec.ts` (khóa khác nhau theo bước), `auction-notifications.spec.ts` (trích lý
  do, rút gọn trong 400 ký tự).
- E2E `auctions.e2e-spec.ts` (replica `_test`): đóng từ báo cáo sau giờ kết thúc rồi worker không
  làm gì; worker và báo cáo cùng lúc chỉ một bên thắng; đăng ký thứ 6, đăng ký lại ngay sau khi rút
  và quá 30 lượt/phút bị từ chối; thông báo tiếp tục có lý do; Admin thấy số báo cáo cùng phiên,
  lọc theo phiên, thành viên không thấy. Ca cũ "rút đăng ký rồi đăng ký lại" nay chờ 1 phút.
- Kết quả: unit 7/7; E2E nhóm đăng ký/vòng đời 38/38; cả file auctions 132/134 (1 timeout 15 giây,
  1 lỗi 503 bận khi chạy song song với bộ khác trên cùng replica; chạy lại riêng 2/2 PASS);
  support 14/14; Mongo 61 (8 skip); API unit 365/366 (ca tắt máy Windows timeout khi máy bận, chạy
  riêng PASS, file không đổi); admin 250; web 477; typecheck API/admin/web và contract PASS.
- Chưa kiểm trên trình duyệt thật hay thiết bị native.
