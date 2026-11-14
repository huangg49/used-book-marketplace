# ADR 0057: Giữ tiền và sách khi chưa có quyết định Exchange đủ điều kiện

01/11/2026. Owner duyệt gói gia cố sau khảo sát toàn dự án. Đây là sửa an toàn
theo SRS FR-D05–D08, BR-08/34–36 và AC-27/33–37, không cấp quyền mở rộng
settlement hoặc đóng READINESS.

## Vấn đề

Lệnh phân xử cũ nhận `expectedVersion`, `RefundBoth`/`CompleteExchange` và lý do.
Nó có thể hoàn tiền/mở sách sau gửi, hoặc tất toán ngay trong hạn kháng nghị;
chưa có custody, allocations, effective decision, assignment và appeal protocol
đủ để thực hiện SRS. Role Staff/Admin không thay các điều kiện đó.

## Quyết định

- Contract0.64 giữ route/schema để client cũ không tự đổi intent. Mọi quyết
  định **mới** ở route này trả409 InvalidState, không ghi receipt thành công,
  audit, notification, message, thay trạng thái hoặc bút toán. Tiền/sách tiếp
  tục giữ trong ResolutionPending. Admin cũng không được bypass.
- Current session/role/ACTIVE và tính độc lập được kiểm trước receipt replay.
  Cả hai participant đều bị403 SelfReviewForbidden kể cả có STAFF/ADMIN hoặc
  receipt lịch sử. Hàng đợi loại giao dịch của chính caller.
- Receipt lịch sử hợp lệ vẫn replay bằng đúng actor/key/body; trả snapshot đã
  lưu, không chạy lại ledger. Sai body, mất role hoặc phiên bị thu hồi vẫn bị
  từ chối. Không đảo hoặc viết lại các quyết định/bút toán cũ.
- Admin/Staff giữ hàng đợi **chỉ đọc**, tình trạng gửi/nhận và cảnh báo phần
  đang chờ. Không đưa nút phán quyết trực tiếp hoặc hứa empty nghĩa mọi giao
  dịch đều thuận lợi. Quyền xem hàng đợi không là quyền giải ngân.
- Mutual cancellation trước gửi, inspection bình thường không claim và các
  worker hiện hành giữ protocol riêng; không mở lại hồ sơ đang giữ dispute.

## Mở lại thực thi

[ADR0089](0089-one-sided-exchange-return.md) bổ sung luồng riêng cho một chiều đã giao có xác nhận và chiều còn lại quá hạn gửi. Lệnh cũ vẫn chỉ phục vụ replay.

Cần gói riêng có quyết định hiệu lực, custody/return và điều kiện duyệt lại,
phân bổ từng nguồn tiền, thẩm quyền300.000đ/escalation, assignment/independence,
kháng nghị48h và review người thật theo TEAMWORK. Không bật lại bằng env flag,
một lý do văn bản hoặc diễn giải test xanh thành nghiệm thu.

Không migration mới, không sửa migration đã áp dụng, không GHN/carrier/Driver,
không tác động DB chính. Kết quả kiểm được ghi trong SESSION_STATE của gói.
