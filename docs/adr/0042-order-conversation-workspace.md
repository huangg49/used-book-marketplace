# ADR0042: Xem đơn trong cùng workspace hội thoại

Chấp nhận theo yêu cầu chủ dự án ngày22/10/2026. Bổ sung
[ADR0041](0041-unified-conversation-workspace.md), giữ hành vi Mua ngay của
[ADR0038](0038-direct-buy-now-orders.md) và các gate trong
[READINESS](../handoff/READINESS.md).

## Quyết định

- **Xem đơn** mở workspace với thông tin/thao tác Order ở phiếu bên trái và
  hội thoại đúng Buyer/Seller của đơn bên phải. Dữ liệu sách, địa chỉ, giá, tiền
  giữ và khả năng thao tác vẫn lấy từ projection Order hiện hành. Tin nhắn
  không thay thế lệnh thanh toán, xác nhận, hủy hoặc bằng chứng giao nhận.
- `PrivateUnpaidOrder.conversationId` trả khóa hội thoại của chính Order hoặc
  `null`; không dò danh sách100 hội thoại hoặc ghép theo listing/đối tác.
- `POST /orders/{orderId}/conversation` cho participant MEMBER verified ACTIVE.
  Tái sử dụng nguyên hội thoại Negotiated đã liên kết, giữ phiên bản, terms và
  lịch sử. Mua ngay hoặc Order lịch sử chưa có link tạo hội thoại riêng có
  `status: OrderCreated`, dùng participant và listing trong snapshot Order.
  Không nhận participant, listing, giá hoặc version từ client; không nhận một
  hội thoại khác chỉ vì cùng sách/người mua.
- Lệnh có body rỗng và `Idempotency-Key`, dùng command executor. Quyền/account/
  session/participant hiện tại được kiểm trước replay; khóa user/session rồi
  Order, sau đó hội thoại nếu có. Khóa Order và unique index `orderId` hiện có
  bảo đảm hai participant mở đồng thời vẫn chỉ có một hội thoại. Không cần
  `expectedVersion` tài chính vì lệnh không chuyển trạng thái Order.
- Hội thoại mới không có terms hoặc quote; không sao chép địa chỉ vào chat và
  không chia sẻ destination của quote cũ ngoài quyền giao nhận hiện hành.
  Không sửa listing, quote, commitment, ledger hoặc snapshot. Đơn hủy/hết hạn
  vẫn có thể trao đổi với đúng đối tác; mở chat không mở lại giao dịch.
- Chat tiếp tục dùng `/purchase-chat`, cùng transport/session và kiểm participant
  hiện hành. `LOCKED` vẫn được xem Order theo ExistingObligation, nhưng không
  được mở phòng/đọc/gửi chat bằng quyền nghĩa vụ cũ. Không đổi quyền tài khoản.

## Tương thích và kiểm chứng

Không có migration mới: validator0028 nhận đúng shape `OrderCreated` và đã có
unique index riêng theo `orderId`. Không sửa snapshot, message hoặc migration
đã áp dụng. API dùng chung cho các client; gói giao diện này chỉ đổi Member web.

Kiểm thử trên replica set QA/database `_test`: tái sử dụng Negotiated và giữ
lịch sử, Mua ngay có negotiation khác, Order lịch sử đã hủy, giả mạo linkage,
ngoại lai, role/account/session trước replay, cùng key khác Order và hai
participant cạnh tranh dưới barrier thật. Evidence thực chạy ghi tại
[SESSION_STATE](../handoff/SESSION_STATE.md); không đóng gate native/human/release.
