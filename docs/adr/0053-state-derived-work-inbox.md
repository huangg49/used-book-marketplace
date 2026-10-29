# ADR 0053: Danh sách việc từ trạng thái hiện tại

28/10/2026. Owner duyệt gói nối hành trình sau khi Việc của tôi đã có hướng dẫn
và các lối vào. Gói bổ sung việc cụ thể cần xem, không thêm quy trình giao dịch.

## Quyết định

- Thêm `GET /me/work-items` và `GET /operations/work-items`, contract0.59.
  Đọc từ bản ghi nguồn trong transaction và protocol user/session hiện tại.
  Không có collection task, counter tổng, worker nhắc việc hoặc migration mới.
  Không biến thông báo lịch sử thành quyền thao tác hiện tại.
- Member có năm lane: DirectOrders, Exchanges, Listings, AuctionIntakes,
  AuctionOrders. Operations có ListingReview và CatalogReview. Những bàn điểm,
  sự cố, đánh giá giao dịch vẫn ở queue riêng; empty chỉ áp dụng lane đang xem.
  Không gọi đây là tổng nghĩa vụ của toàn sản phẩm.
- Một item có ID nguồn, target/targetId, version/state, tên sách nếu có, lý do,
  attention và dueAt. Không trả địa chỉ, liên hệ, nội dung hội thoại, bằng chứng,
  token, số dư hoặc dữ liệu review chưa công bố. Client ánh xạ target sang route
  của mình; API không gắn URL web vào contract dùng chung.
- Action là lời nhắc **mở hồ sơ để xem**, không là cờ cho phép command. Đến đúng
  deadline chuyển nhắc việc sang Waiting, không gia hạn hoặc tự chạy expiry.
  Dispute Exchange còn dấu hiệu thì đọc như ResolutionPending; hạn inspection
  mỗi phía dùng cùng fallback với service hiện tại.
- Query có phân trang theo lane, tối đa50; không lấy50 bản ghi đầu của từng
  API rồi suy ra đã đọc hết. Cursor ký, ràng buộc actor/lane, có ID tie-break.
  Việc có hạn chưa tới xếp trước, không hạn tiếp theo, đã tới hạn sau cùng;
  trong nhóm theo deadline hoặc thời điểm tạo/gửi duyệt và ID. Mongo transaction
  không dùng `$unionWith`; không tải toàn bộ các lane vào một mảng.
- Đây là danh sách sống. State, deadline hoặc thời gian trôi qua có thể làm
  bản ghi đổi vị trí giữa hai trang. Client loại ID lặp, giữ version mới hơn và
  có nút Cập nhật từ đầu; không cam kết snapshot cố định xuyên nhiều request.
  Không đưa số lượng đã tải thành tổng việc của người dùng.

## Quyền và nối UI

- Guard và service kiểm lại phiên/role hiện tại. Member chỉ thấy participant/
  owner của mình. `ExistingObligation` chỉ ở GET Member; LOCKED được đọc ba
  lane giao dịch, bị403 ở Listings/AuctionIntakes. Không cấp quyền thanh toán,
  chấp nhận đề nghị mới, gửi duyệt hay review nhờ có lời nhắc.
- Operations cần STAFF/ADMIN ACTIVE; CatalogReview cần ADMIN ACTIVE.
  Loại bài/yêu cầu của chính reviewer. Quyền tại điểm và tính độc lập vẫn do
  queue/command điểm kiểm tra; không dùng dashboard để cấp thêm quyền.
- Link mở hồ sơ bằng ID, kể cả ngoài trang đầu. Web/RN có focus riêng cho lần
  gửi sách. RN có chi tiết đơn trực tiếp độc lập với danh sách và danh sách
  tải tiếp được; bộ lọc/số hiển thị ghi rõ chỉ tính các đơn đã tải.
- Nối nút xác nhận/từ chối đơn bán đã trả tiền vào API có sẵn; không đổi state
  machine, ledger hoặc refund. Dùng `sellerAcceptanceEnabled`/`canReject` từ
  server, xác nhận trước gửi. Intent memory-only đi cùng SessionClient, giữ
  action/version/key khi mất ACK và chặn quyết định ngược tới khi biết kết quả.
  Đổi identity xóa intent; phản hồi phiên cũ không xóa intent của phiên mới.
- Lỗi API không là empty. Giữ thông tin cũ có nhãn khi lỗi kết nối; lỗi quyền/
  phiên thì ẩn items đã cache. Loading/retry/Back vẫn có lối đi rõ ràng.

## Giới hạn

Không thay SRS/ADR về giao nhận, không mở gate trong
[READINESS](../handoff/READINESS.md), không thay GHN/carrier/Driver hoặc Flutter.
RN chi tiết đơn mới hỗ trợ đọc, thanh toán qua modal cũ, hủy unpaid và trả lời
đơn bán; chưa bổ sung chuẩn bị ảnh/vận chuyển hoặc full parity với web.
Không thay human review bằng test/AI. Evidence và ma trận hành trình nằm ở
[báo cáo gói](../ui/WORK_INBOX_2026_10_28.md).
