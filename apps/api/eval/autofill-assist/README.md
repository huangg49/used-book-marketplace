# Kiểm chất lượng đọc ảnh sách

Ngưỡng [ADR0048](../../../../docs/adr/0048-listing-photo-autofill.md): ít nhất20
cuốn khác nhau chụp bằng điện thoại, tên đúng có dấu≥80%, không trả ISBN sai.
Ngày29/10/2026 nhóm chưa có ảnh/đáp án; chưa có evidence nghiệm thu này.

1. Giữ ảnh trong thư mục riêng ngoài Git; bỏ người, địa chỉ, lời đề tặng và giấy
   tờ khỏi khung hình. Mỗi cuốn có1–3 ảnh bìa/gáy/trang bản quyền. Có cả sách cũ,
   phản sáng, ánh sáng yếu, nhiều tác giả, ấn bản gần nhau và không có ISBN.
2. Từ `apps/api`, chạy `pnpm eval:autofill --dir <thu-muc> --init`.
   Script không ghi đè cases.json. Gộp các ảnh cùng cuốn thành một case.
3. Theo [mẫu](cases.example.json): đặt `source=real-camera` chỉ cho ảnh chụp thật;
   `bookKey` duy nhất theo cuốn/ấn bản; người kiểm đọc sách rồi điền expected và
   `reviewed=true`. Không lấy đáp án từ chính model. ISBN=null nghĩa đã kiểm và
   sách/ảnh không có ISBN, bỏ thuộc tính nghĩa chưa biết — không đủ nghiệm thu.
   Điền NXB/năm/ngôn ngữ/ấn bản khi có để chấm riêng từng trường.
4. Cấu hình AI qua ENV_HANDOFF, không ghi key vào case/lệnh/chat. Chạy
   `pnpm eval:autofill --dir <thu-muc> --max-usd 0.5` chỉ khi có quyền gọi provider.
   Ngân sách là dự toán token, không phải trần hóa đơn cứng; kiểm phí provider.
5. Xem summary và từng case trong results/. Ảnh scan/ảnh tổng hợp, thiếu đáp án,
   chạy một phần, lặp cùng cuốn hoặc bỏ vì hết budget đều không thành PASS.
   Tên bỏ dấu chỉ là chỉ số phụ. AuthorsFound đo tìm đủ tác giả, chưa đo precision
   tác giả thừa. ISBN có checksum đúng vẫn có thể sai cuốn; đối chiếu đáp án.

Ảnh và kết quả thô có thể chứa thông tin riêng; chỉ đưa bản đã rà soát vào Git.
Script tạo câu trả lời/metric, không tự đóng READINESS hoặc thay người nghiệm thu.
