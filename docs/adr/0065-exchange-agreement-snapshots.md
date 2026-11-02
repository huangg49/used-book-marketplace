# ADR0065: Cố định thỏa thuận đổi sách và kiểm lại trước khi giữ sách

Ghi chú tích hợp02/11: đổi số ADR local chưa publish từ0063 sang0065 để giữ
nguyên ADR trên main. Nội dung quyết định và gate không đổi.

02/11/2026. Triển khai local theo gói 1 được owner duyệt sau
[khảo sát core Exchange](../features/CORE_EXCHANGE_AUDIT_2026_11_02.md).
Giữ quy tắc SRS FR-X02–X04/BR-22; không duyệt thương lượng tiền bù tùy ý.
Không mở READINESS hoặc resolution theo ADR0057.

## Vấn đề

Source `90b89ac1` kiểm sách lúc tạo đề xuất nhưng accept chỉ kiểm Available và
channel. Nội dung/giá/ẩn bài hoặc điều kiện chủ sách có thể đổi trước accept.
Exchange lưu cọc/bù nhưng client đọc sách từ public listing hiện tại, khiến
lịch sử hiển thị giá khác nghĩa vụ tiền đã lưu. Counter nhận tiền nhập tay,
khác yêu cầu thay sách đủ điều kiện của SRS.

## Quyết định

- Mỗi đề xuất mới lưu `agreement`: các sách của initiator và một sách của
  recipient, listing ID/version/revision, chủ/tên hiển thị tại thời điểm đó,
  catalog ID/revision/metadata, mô tả tình trạng và các media ID gốc. Sao chép
  từ revision đã duyệt dưới transaction; không lưu signed URL vào snapshot.
- Users/session được khóa trước resource. Nếu có conversation, khóa conversation
  trước listings; listings được khóa theo thứ tự ID. Chỉ tạo snapshot từ sách
  Marketplace Approved/Visible/Available, còn xuất bản, chưa xóa, Exchange/Both,
  catalog Confirmed và ảnh Ready. Cả hai Member phải ACTIVE, đã xác minh email
  và còn role MEMBER. Proposed chưa reserve và không di chuyển tiền.
- Accept đúng người phản hồi/revision, chưa hết hạn, kiểm lại cả hai chủ và toàn
  bộ sách. Listing version/revision phải khớp snapshot; không tự cập nhật đề
  xuất sang nội dung hoặc giá mới. Giữ đồng thời mọi sách hoặc không giữ sách nào.
- Nếu thỏa thuận đã lỗi thời/không đủ điều kiện hoặc thiếu snapshot gốc: lưu
  kết quả `Cancelled + ListingUnavailable` với lý do và receipt, không thu tiền
  hoặc reserve. Đây là cách biểu diễn ClosedUnavailable trong enum legacy hiện
  có; HTTP200 là ACK của kết quả đóng, không tự đồng nghĩa chấp nhận thành công.
  Wrong actor/revision/expired vẫn bị từ chối theo protocol, không biến thành
  một lệnh đóng không có quyền. Mất phản hồi replay đúng actor/key/body gốc.
- Counter chỉ do bên đang cần phản hồi thực hiện, thay sách **của chính mình**;
  recipient chọn một sách, initiator giữ hỗ trợ một đến năm listing đơn đã có.
  Không dùng bộ sách Sale như một Exchange bundle. Sách bên kia vẫn phải khớp
  thỏa thuận; nếu sách gốc đã đổi thì đóng đề xuất và tạo lại, không âm thầm đổi
  điều kiện khi counter. Counter không giữ sách; tăng revision và đổi bên chờ.
- Máy chủ tính cọc mỗi bên bằng tổng giá trị sách sẽ nhận; bù là trị tuyệt đối
  chênh lệch, bên giao sách giá trị thấp trả bù. Request không nhận số tiền/bên
  bù tùy ý. Mongo validator kiểm agreement IDs/owners và các nghĩa vụ tiền cùng
  record. Không đổi ledger, số dư hoặc công thức funding/settlement lịch sử.
- Web/RN detail/list trình bày facts từ agreement. Ảnh đọc qua route participant
  riêng, chỉ media thuộc agreement hiện tại, current auth/participant kiểm trước
  và sau ký URL; không mở public listing để lấy ảnh/thông tin lịch sử. Không
  biến tên hiển thị thành bằng chứng xác minh danh tính hoặc quyền giao dịch.
- Hồ sơ cũ thiếu agreement trả null, không backfill theo listing hiện tại hay
  suy snapshot từ cọc. UI ghi rõ giới hạn, giữ cọc/bù/timestamps đã lưu; giá từng
  cuốn trong multi-listing cũ chưa biết thì để chưa biết. Chưa accept thì không
  được giữ sách mới; nghĩa vụ đã phát sinh tiếp tục protocol cũ và gate hiện có.

## Nâng cấp và giới hạn

Migration mới `0053-exchange-agreement` chỉ mở rộng validator exchanges; không
sửa migration/checksum đã áp dụng, không backfill hoặc thêm collection/quyền.
Dừng API/worker cũ, migrate bằng quy trình vận hành rồi nâng API/client cùng gói.
Counter client cũ gửi diffAmount/diffPayer sẽ bị422, không được tự hạ chuẩn để
tương thích. Chưa chạy migration trên DB local chính hoặc môi trường dùng chung.

Không sửa GHN, trạng thái pickup/receive theo từng chiều, expiry shipping,
resolution/return/settlement gate hoặc toàn bộ pending-intent recovery. Các phần
đó vẫn còn phát hiện riêng trong báo cáo khảo sát. Native/human acceptance không
được suy từ Expo web hoặc E2E. Bằng chứng và phần cần tích hợp main mới xem
[bàn giao gói](../features/EXCHANGE_AGREEMENT_2026_11_02.md).
