# ADR0088: Nhóm E — cập nhật trực tiếp nhanh trong khung Mua ngay, báo cáo cho Staff giữ nguyên

09/11/2026. Accepted theo yêu cầu của chủ dự án trong phiên làm việc ("go to phase E"), nhóm E
cuối của kế hoạch sửa lỗi thiết kế đấu giá. Bổ sung [ADR0031](0031-live-auction-updates.md) và
[ADR0083](0083-auction-phase-a-fixes.md). Không đổi READINESS.

Nhóm E của kế hoạch có ba mục: C1 (liên kết tài khoản người bán), L2 (Staff nhận báo cáo) và M6
(cập nhật trực tiếp từ tiến trình khác chậm tới 2 giây). C1 đã bị chủ dự án bỏ khỏi kế hoạch trước
đó; các ADR0086/0087 ghi các biện pháp thay thế (ngừng kín giá thứ hai, tiền cọc chỉ hoàn một phần
cho người bán). Theo quy tắc "tự chọn phương án khả thi nhất và ghi lại":

## Quyết định

1. **M6 — lượt kiểm 0,5 giây cho phiên đang trong khung Mua ngay.** Kênh trực tiếp phát hiện thay
   đổi theo `version` của phiên: lệnh trong cùng tiến trình đẩy ngay sau commit, còn thay đổi từ
   worker hoặc instance API khác chờ lượt kiểm 2 giây. Khung "Chờ thách đấu" chỉ 60 giây (hoặc
   5 phút), nên 2 giây là đáng kể. Nay:
   - lượt kiểm đầy đủ vẫn 2 giây (mọi phiên được xem và danh sách phiên);
   - phiên **đang có người xem chi tiết** và **đang trong khung Mua ngay** (`Active`, `buyNowAt`
     có giá trị, `endAt` còn ở tương lai; Mua ngay "Kết thúc ngay" không tính vì kết thúc tại
     `buyNowAt`) được đọc thêm mỗi 0,5 giây, chỉ các dòng đó;
   - lượt nhanh tự tắt khi khung kết thúc, phiên đổi trạng thái hoặc không còn ai xem; không chạy
     khi chỉ có người xem danh sách;
   - lượt nhanh không chồng lên lượt đang chạy (bỏ qua, lượt sau cách 0,5 giây).
   Thay đổi đầu tiên (chính lúc có người Mua ngay từ tiến trình khác) vẫn có thể chờ tới 2 giây; từ
   đó các lượt trả giá thách đấu tới trong khoảng 0,5 giây.
   **Bị loại:** Mongo change streams, cần quyền database mà ADR0031 đã quyết không cấp cho vai trò
   ứng dụng; giảm lượt kiểm đầy đủ xuống 0,5 giây, tăng gấp bốn số truy vấn cho mọi phiên.
2. **L2 — giữ nguyên: báo cáo về phiên đấu giá vẫn đi tới Admin, Staff không nhận.** Phương án
   cho Staff tại điểm xem (chỉ đọc) báo cáo về tình trạng sách của phiên tại điểm mình cần quyết
   định của chủ dự án về phạm vi vai trò Staff, thêm quyền đọc và giao diện vận hành; không có lỗi
   nghiệp vụ nào cần nó ngay. Staff vẫn kiểm sách ở bước nhận/kiểm định như hiện có. Có thể mở lại
   nếu chủ dự án muốn.
3. **C1 — không làm** (đã bỏ khỏi kế hoạch theo chủ dự án).

## Persistence và contract

Không migration, không đổi OpenAPI. Chỉ đổi `AuctionLiveService` (API).

## Kiểm chứng

- Unit `auction-live.spec.ts`: lượt nhanh chỉ đọc phiên đang trong khung (thay đổi của phiên khác
  chờ lượt 2 giây), tắt khi phiên rời khung hoặc không còn người xem, không bật cho Mua ngay kết
  thúc ngay, khung đã hết hay phiên chỉ có trong danh sách.
- E2E `auctions.e2e-spec.ts` "ADR 0088 (M6)": người xem qua WebSocket, Mua ngay bật lượt nhanh, một
  lượt trả giá thách đấu từ "tiến trình khác" (không nudge trong tiến trình này) tới người xem trong
  dưới 1,2 giây; bỏ xem thì lượt nhanh tắt.
- Kết quả: xem commit và SESSION_STATE.
- NOT RUN: đo trên nhiều instance API thật, trình duyệt và thiết bị native.
