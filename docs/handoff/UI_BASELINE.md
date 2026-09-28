# Quan sát giao diện trước đợt polish

28/09/2026. Đây là ghi nhận baseline để tiếp tục Gate 3, chưa phải thiết kế đã sửa.
Đọc [UI rules](../design/UI_CODING_RULES.md), [component](../design/UI_COMPONENTS.md)
và [brand v1.1](../../packages/brand/v1.1/README.md) trước khi thay bố cục.

## Những gì đã trực tiếp xem

Ảnh được tạo lại bởi browser regression vòng audit, dùng fixture có nhãn kiểm thử.
Khối xanh trơn trong ảnh là **ảnh fixture**, không là thiết kế bìa cho app hoặc lỗi
Supabase. Screenshot ở thư mục ignored có thể tạo lại bằng lệnh trong START_HERE.

| Bề mặt | Quan sát | Hướng xử lý ở đợt polish |
|---|---|---|
| RN chi tiết, 390×844 (`book-390.png`) | Tên sách dài xuống dòng đúng, màu/font nhận diện nhất quán. Viewport đầu chứa tên + ảnh, chưa thấy giá; back CTA chiếm cả hàng | Đặt thông tin quyết định (giá bán/đổi) gần tiêu đề/tác giả; cân chiều cao ảnh và điều hướng. Giữ ảnh contain, không cắt để tiết kiệm chỗ |
| RN địa chỉ, 320px chữ lớn (`addresses-320.png`) | Tên dài xuống dòng, không tràn ngang. Intro + hai notice chiếm nhiều chiều cao trước địa chỉ | Nhóm header/tác vụ rõ hơn; giảm lặp nội dung, giữ nhãn địa bàn mô phỏng và thông báo kết quả dễ đọc |
| Operations detail, 1440px (`listing-1440.png`) | Hai cột nội dung/quyết định rõ, giá và tình trạng có nhãn; form lý do hiển thị lỗi tại trường | Giữ cấu trúc nghiệp vụ; rà nhịp khoảng cách và thứ tự thông tin để reviewer ít cuộn hơn, không bỏ checklist/nguồn tình trạng |
| RN ảnh lớn (ảnh failure lượt đầu) | Tên dài làm header Sheet cao nhưng vẫn có nút đóng nhìn thấy | Rà giới hạn layout, focus/keyboard và nội dung dài trên native. Lỗi Escape trong test đã sửa cách đợi dialog active, không thay component |

## Chưa được coi là đã rà visual đầy đủ

- Kệ với ảnh sách có nguồn hợp lệ ở nhiều tỉ lệ, tên ngắn/dài, nhiều giá, trạng thái rỗng/lỗi.
- Login/profile, danh sách sách của tôi, đủ từng bước editor/catalog picker, rejected/resubmit.
- `/ui`, focus bàn phím, Sheet với bàn phím mở, chiều ngang nhỏ và font-scale hệ điều hành.
- Operations queue, detail trên mobile và toàn bộ trạng thái retry/conflict trong vòng polish.
- Native Android picker/upload/Back/TalkBack và khôi phục phiên; chưa có bằng chứng mới.

Browser journey đã kiểm hành vi responsive/chữ lớn ở một số bước, nhưng không thay
vòng xem/thử trực tiếp từng màn. Không sao chép dữ liệu giả vào UI library để chụp đẹp.
Không thêm CTA mua/đổi/ví khi luồng chưa được triển khai. Khi sửa control chung, cập
nhật `/ui` và chạy lại những hành trình tiêu thụ control đó.
