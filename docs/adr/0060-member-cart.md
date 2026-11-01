# ADR0060: Giỏ sách Member có giới hạn, không giữ chỗ

01/11/2026. Theo FR-O01–O02/AC-07 và gói owner duyệt web/RN. Không thêm checkout
nhiều listing hoặc mở quyền giao nhận/settlement.

- Một `member_carts` document cho owner UUID, tối đa50 IDs duy nhất, quantity1
  cố định. Lưu ID, thời điểm và giá công khai khi thêm; không lưu nội dung riêng
  hoặc snapshot địa chỉ. Không giữ chỗ, commitment, quote, Order hoặc tiền khi thêm.
- Current ACTIVE MEMBER thêm Marketplace Sale/Both công khai, Available, không
  của chính mình, với expected cart/listing version. Có thể lưu khi origin chưa
  sẵn sàng; `canBuy=false` cho tới khi đủ điều kiện. Exchange-only/Auction bị từ chối.
- User/seller locks trước listing lock, public predicate chung trong cùng Mongo
  transaction. Owner user lock bảo vệ cả absent-cart creation và ngưỡng50; Mongo
  validator giữ max50/unique. Không vòng read rồi write rời rạc.
- LOCKED/RESTRICTED được đọc/xóa giỏ của mình. Tài khoản bị khóa không replay add
  qua receipt cũ. Removing không nhả reservation hoặc hủy Order. No-op duplicate
  add/absent remove vẫn có receipt idempotent, không tăng version vô cớ.
- GET trả toàn bộ danh sách có giới hạn50 trong một snapshot. Listing dùng lại
  public eligibility/projection của marketplace; bị gỡ/ẩn/private cho `listing=null`,
  không phục dựng metadata cũ. Giá hiện tại khác `priceAtAdd` được thông báo rõ;
  `canBuy` chỉ là hướng dẫn hiện tại, checkout kiểm lại quyền/version/giá/địa chỉ.
- Web/RN dùng chung intent memory theo identity. Mất ACK giữ path/key/body/version
  qua Back/remount; chưa nhận receipt thì chặn quyết định ngược. Đổi tài khoản xóa
  pending và chặn callback/preparation cũ. Mỗi dòng có một nút mua, dùng checkout
  một listing hiện hữu; không có bulk selection, quantity hoặc cart total giả.
- Không tự xóa giỏ sau đặt mua: receipt/cart là hai aggregate riêng; người dùng
  thấy trạng thái mới và có link Đơn hàng của tôi. Không gộp side effect vào checkout
  chỉ để làm đẹp giỏ. Web checkout refetch khi mở để tránh lấy giá từ cache cũ;
  không thay body/version của intent đã gửi.

Migration0049 tạo collection mutable, không backfill hay sửa migration cũ. Phiên
này chỉ áp dụng QA `_test`; DB chính chưa chạy migration. Flutter không thuộc gói.
