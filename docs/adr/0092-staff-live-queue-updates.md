# ADR0092: Cập nhật realtime cho hàng đợi Staff/Admin

25/11/2026. Proposed theo yêu cầu chuyển polling sang WebSocket trên Web và React Native
("continue through all the phases"). Bổ sung cho [ADR0031](0031-live-auction-updates.md)
(kênh `/transactions` của Member). Chưa có human review; không đổi READINESS.

## Bối cảnh

Admin web đọc hàng đợi bằng polling 5–8 s cho mỗi màn hình đang mở: hộp việc, hỗ trợ,
duyệt bài/đầu sách, kiểm tra tự động, khiếu nại trao đổi/đấu giá, rút tiền và các hàng
đợi vận hành điểm. Kênh `/transactions` chỉ nhận phiên `MEMBER`.

## Quyết định

- Namespace mới `/staff`. Handshake cần access token của phiên hiện tại có `STAFF` hoặc
  `ADMIN`; không nhận `MEMBER`, `TEST_OPERATOR` hoặc token hết hạn.
- Client gửi `staff:watch` với một topic cố định và nhận ack `{ ok }`; `staff:unwatch`
  rời topic. Topic và quyền:

  | Topic | Quyền | Entity của lệnh đã commit |
  | --- | --- | --- |
  | `work-items` | STAFF, ADMIN | SupportCase, Listing, Catalog, Withdrawal, Exchange, ExchangeEvidence, Auction, AuctionIntake, PointOrder, PointIncident, Order, Shipment, TransactionReview, UserAccount |
  | `support` | ADMIN | SupportCase |
  | `listings` | STAFF, ADMIN | Listing, Media |
  | `catalog` | ADMIN | Catalog |
  | `withdrawals` | ADMIN | Withdrawal, WithdrawalProof |
  | `operations` | STAFF, ADMIN | Exchange, ExchangeEvidence, Auction, AuctionIntake, PointOrder, PointIncident, HandoverPoint, PointAssignment, Order, Shipment, CarrierEvent, OrderPackagingEvidence, TransactionReview, UserAccount |

- Command executor đăng ký `Tx.afterCommit` cho entity của mỗi lệnh; sự kiện chỉ chạy
  sau commit, không chạy khi abort hoặc ở attempt bị retry. Gateway gộp sự kiện của một
  topic trong 250 ms rồi gửi `staff:changed { topic }`. Không có dữ liệu hàng đợi qua socket.
- Trước mỗi lần gửi, server xác thực lại token và quyền topic. Phiên bị thu hồi bị ngắt;
  người mất quyền topic bị rời topic. REST vẫn quyết định dữ liệu được xem.
- Admin web dùng chung một socket qua `createLiveWatcher` của `packages/session-client`.
  Khi watch được ack, màn hình chỉ poll dự phòng 30 s; khi không ack hoặc mất kết nối,
  quay về chu kỳ cũ. Hàng đợi có panel đang mở không tải lại khi có push (giữ dòng đang
  xác nhận lệnh), như quy tắc `refetchWhileClosed` trước đó.
- Không dùng push cho: việc quá hạn (`/operations/escalations`, tính theo thời gian lúc
  đọc), simulator của TEST_OPERATOR, số liệu dashboard tổng hợp và `/auth/me`.

## Hệ quả

- Tín hiệu chỉ trong một process. Lệnh từ worker hoặc API instance khác chỉ hiện sau
  backstop 30 s. Nhiều instance cần adapter dùng chung (Redis) hoặc change stream; chưa làm.
- Một người có quyền topic nhưng thiếu quyền một endpoint con (ví dụ hàng đợi thu sách
  chỉ cho STAFF) chỉ biết "topic đã đổi"; REST vẫn từ chối đọc.
- Hỗ trợ phía Member dùng watch `inbox` có sẵn: thao tác của Admin ghi thông báo
  `SupportUpdated`, thông báo này đánh thức inbox của người báo cáo.
