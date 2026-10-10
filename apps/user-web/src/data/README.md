# Catalog cho xem trước Home

`preview-catalog.json` là cache48 ấn bản lấy từ Open Library Search API theo yêu
cầu chủ dự án10/10/2026, phục vụ UX/UI. Có25 manga,16 light novel và7 văn học;
không dùng lại đầu sách trên hero. Tên/tác giả/ISBN/bìa đi cùng edition nguồn,
giữ nguyên ngôn ngữ; các edition được chọn có language=eng. Thể loại là nhóm
biên tập, light novel phải có bằng chứng trong title/subject của work.

Nguồn, thời điểm và query được lưu trong JSON; mỗi sách có link edition và
cover ID. Không chép mô tả dài. Bìa tải trực tiếp từ Covers API, không lưu ảnh
vào repo. Quyền ảnh vẫn thuộc chủ sở hữu; đây là nguồn minh họa cho prototype,
không là ảnh bản sách người bán. Tham khảo
[Search API](https://openlibrary.org/dev/docs/api/search),
[Covers API](https://openlibrary.org/dev/docs/api/covers) và
[usage/cache/rate limits](https://openlibrary.org/developers/api).

## Bật/tắt

- Chỉ trong Vite dev: `VITE_CATALOG_PREVIEW=true` trong `.env.local`, hoặc mở
  `/?data=preview`. `/?data=live` buộc Home dùng API thật kể cả khi env bật.
- `.env.example` mặc định false. Production build luôn bỏ chế độ preview.
- Giá/tình trạng/mua-đổi là mẫu cố định trong `home-shelves.ts`, có nhãn trên
  trang và từng card. Preview type không có seller, media ID, version, receipt
  hay quyền giao dịch. Card mở nguồn Open Library, không mở listing giả.
- Home search/quick links/budget/filter hoạt động trên bộ mẫu trong Home;
  Header/Search/Detail và các màn còn lại vẫn dùng API thật. Không là demo E2E.
- Chế độ thật giữ querylimit24/category cục bộ/ảnh listing/session như trước;
  API lỗi hiện lỗi, tuyệt đối không tự fallback sang mẫu.

## Làm mới và chuyển sang DB

`pnpm --filter @used-books/user-web catalog:refresh` lấy một nhóm nhỏ theo13
series, tuần tự dưới1request/s, chỉ ghi snapshot khi đủ dữ liệu hợp lệ. Khi muốn
đổi danh sách, sửa selections và review edition/bìa sau khi chạy. Chạy thủ công;
không fetch lại catalog ở mỗi lần mở trang. Đây không là bulk importer.

Sau này chuẩn bị DB demo theo schema/migration hiện có và tạo bài đăng/ảnh qua
luồng hợp lệ. Tắt `VITE_CATALOG_PREVIEW` rồi mở Home không có `data=preview`:
các kệ gọi lại `/listings`, ảnh lấy qua media read. Không cần redesign hoặc
chuyển48 sách mẫu thành giao dịch thật. Import metadata và chuẩn bị bản sách/
người bán/ảnh là công việc dữ liệu riêng, chưa được triển khai trong gói này.
