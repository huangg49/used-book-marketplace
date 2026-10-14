# Rèm2D toàn trang Đấu giá

Chủ dự án duyệt bộ lớp và bản chuyển động/điểm treo13/10/2026, art checkpoint
`8c0afdb`. 13PNG ở đây copy nguyên từ
[bộ lớp](../../../../../docs/design/auction-curtain-layers-v1/README.md), không
sinh lại/đổi màu/resize. Ảnh generated minh họa không là ảnh sách/phiên thật.
Nguồn PNG/prompt/alpha audit nằm ở bộ lớp. Giữ nguyên asset để đối chiếu.

Chỉ hai PNG thân đóng dùng làm texture liên tục; không ship hai pose mở hoặc
SVG lót (renderer lót cùng mesh). Manifest runtime trong src/lib/auction-curtain
giữ14instance pose both cùng socket/clip đã duyệt. Renderer copy nguyên từ motion preview8c0afdb; model dùng cùng rig, thêm
SIDE_WIDTH0,8 theo yêu cầu gom hai bên gọn hơn20%. Dáng đóng giữ coverage,
settled/pulled inner edges và outer mesh thu theo hệ số đó; dây/tua x/width
đồng bộ. PNG/diềm/họa tiết không sửa. .d.mts mô tả các export được dùng.
Không import docs từ bundle sản phẩm. Khi thay art/rig, cập nhật preview và runtime
cùng phạm vi rồi đối chiếu lại; không tự điều chỉnh bản đã duyệt ở một nơi.

PNG khoảng4MiB tổng; load/decode cache chỉ phát sinh khi mount trang đấu giá.
Nhịp mở giữ base1,5giây; fade230→115ms, tổng1,385giây. Diềm dùng scale0,8075
(giảm15% rồi thêm5%), điểm treo đi cùng. Thời gian chờ ảnh tối đa1200ms; lỗi/chậm bỏ entrance và mở nội dung,
không dựng lại khi ảnh về muộn. Hiệu năng mạng/điện thoại thật chưa nghiệm thu.
Màu lót wine và viền gold của renderer dùng palette đã duyệt.
