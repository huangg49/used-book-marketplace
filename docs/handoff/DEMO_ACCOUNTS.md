# Chọn tài khoản khi demo sách — 20/10/2026

Các địa chỉ bên dưới là tài khoản demo local, không phải hộp thư thật. Dùng mật
khẩu local cũ; không ghi mật khẩu/token vào tài liệu. Người đăng trên Detail là
tên hiển thị thật từ API; email đăng nhập không được thêm vào public API.

| Tên người đăng | Tài khoản demo |
| --- | --- |
| Bạn đọc Lật lại | member@latlai.local |
| [DEMO] An - Người bán | seller@latlai.local |
| [DEMO] Linh - Người mua 2 | buyer2@latlai.local |
| [DEMO] Kệ sách 01 | bookshelf01@demo.latlai.local |
| [DEMO] Kệ sách 21 | bookshelf21@demo.latlai.local |
| [DEMO] Kệ sách 140 | bookshelf140@demo.latlai.local |

700 bài nền thuộc 140 tài khoản `bookshelf01` đến `bookshelf140`, mỗi tài khoản
5 sách. Số trong tên kệ khớp số trong email; giữ số 0 đầu cho 01–09. Ngày 20/10
đã sửa 120 tên kệ bị lặp do import nhiều đợt, giữ nguyên email/mật khẩu/quyền/
listing và giao dịch. Có bản sao dữ liệu trước sửa trong thư mục `.tmp` riêng máy.

## Demo mua hoặc chat bằng hai tài khoản chính

1. Đăng nhập `member@latlai.local` ở phía người mua.
2. Mở một trong ba sách của `[DEMO] An - Người bán`:
   - [Atomic Habits](http://localhost:5174/books/6c689fdd-0610-4c9f-a089-4c8fd97c409a).
   - [Charlotte's Web](http://localhost:5174/books/8d56999c-28b9-4c38-b6ea-5c1686a3b9fe).
   - [A Brief History of Time](http://localhost:5174/books/52a2758b-45fc-434f-97bc-306f2a8e56cf).
3. Phía người bán đăng nhập `seller@latlai.local`, mở Chat để phản hồi. Trạng thái
   sách có thể thay đổi sau thao tác demo; kiểm tra thông báo hiện tại trên Detail.

Danh sách đầy đủ tên sách/link bài đăng theo 146 tài khoản sở hữu sách hiện có
được tạo riêng trên máy tại `.tmp/demo-account-guide-20261020.md`. Đây là báo cáo
tra cứu local, không phải dữ liệu seed để chạy lại hoặc file cấu hình chia sẻ.
