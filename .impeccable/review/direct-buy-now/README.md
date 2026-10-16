# Mua ngay — Member web, 16/10/2026

Source: nhánh `codex/direct-buy-now`, base `4924fab`; commit chứa báo cáo này.
Thiết kế kế thừa Member web wine/cream/Anton/Be Vietnam Pro theo DESIGN.md.
Operate: chọn địa chỉ, xem giá niêm yết/tổng, giữ sách và thanh toán; Seller chuẩn bị gửi.

- [Checkout 390 px](checkout-mobile.png): tên/tình trạng sách, địa chỉ có sẵn,
  phí 30.000đ, tổng 155.000đ, giải thích giữ 15 phút, không chat/duyệt lại.
- [Seller 1440 px](seller-shipping-desktop.png): paid Preparing, hold, hạn 48 giờ,
  địa chỉ đúng bên, ảnh đóng gói và vận đơn đã đăng ký; chưa có custody từ label.
- `pnpm --filter @used-books/user-web test:buy-now:browser` PASS: hai phiên độc lập,
  listing125000+ship30000; quote không giữ sách; mất ACK create/pay retry đúng
  key/body; thiếu tiền không hold; một Order/payment và hai inbox; ảnh PNG qua
  Sharp/storage fake; đăng ký label giữ Preparing; TEST_OPERATOR độc lập pickup
  mới vào InTransit. Không tạo purchase conversation. Không tràn ngang390/1440.
- API/Mongo thật trên replica set QA riêng, database disposable `*_test`; tài khoản,
  ảnh, địa chỉ và tiền trong ảnh đều là fixture. Provider/carrier/storage mô phỏng.
  Không là Supabase/provider thật, native, human review hoặc release acceptance.
- Hai lượt kiểm hình: quan sát mobile/desktop, sửa token scoped/error-state và
  xác nhận lại; không thay brand/global navigation hoặc thêm animation.
- Scope dừng tại gate DirectDelivery hiện hành. Không mở thao tác Delivered,
  inspection, claim hoặc settlement trong UI mới. READINESS không đổi.

Browser thương lượng cũng PASS hai phiên390/1440 sau thay đổi. API hồi quy
6suite đạt229/231 trong lượt tổng, hai ca timeout chạy riêng đều PASS; không
ghi full-suite PASS. Schema24/24, API150/web135/RN142 unit cùng các kiểm tra
contract/typecheck/build phù hợp PASS.

Kết quả kiểm tra cuối và bước tiếp xem [SESSION_STATE](../../../docs/handoff/SESSION_STATE.md).

Impeccable context báo config chưa có buildPath và các surface brief cũ bị lệch
đường dẫn. Không sửa cấu hình/brief trong feature này; có thể rà ở gói riêng.
