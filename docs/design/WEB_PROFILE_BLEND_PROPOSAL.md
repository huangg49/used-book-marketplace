# Tham khảo profile Tuấn Minh —12/10/2026

Trạng thái: nghiên cứu source, chưa duyệt triển khai. Yêu cầu: Tuấn Minh muốn
đưa code profile của mình trở lại; đối chiếu bản cũ với bản hiện hành trước khi sửa.

## Nguồn đối chiếu

- Bản Minh: commit `36cb0c03210725c585a7518551c2ac65de92a328`, tác giả
  `tumin1811`, subject `feat(ui): redesign SellBookPage and profile dashboard`.
- Bản hiện hành: `cc51e0b`, sau các gói owner shelf `8d9cdf0` và account menu
  `b304d13`. `git fetch origin --prune` thành công; origin/main `dec19b3` tại
  thời điểm kiểm tra. Chưa pull/merge/cherry-pick hoặc đổi runtime.
- Các component của Minh vẫn ở
  [profile/components](../../apps/user-web/src/pages/profile/components/).
  [ProfilePage](../../apps/user-web/src/pages/ProfilePage.tsx) hiện không import
  dashboard đó; [MyBooksPage](../../apps/user-web/src/pages/MyBooksPage.tsx) là kệ
  riêng. Không cần khôi phục toàn bộ commit có cả Sell/Header/router/Tailwind.
- Đối chiếu contract [OpenAPI](../../packages/api-contract/openapi.yaml),
  [SRS1.1](../SRS_V1_1.md), [READINESS](../handoff/READINESS.md),
  [DESIGN](../../DESIGN.md). Đây là phân tích code, chưa render lại dashboard cũ
  hoặc kiểm thử luồng authenticated; không kết luận visual/native PASS.

## Phần đáng giữ và phần phải nối lại

| Khối của Minh | Hiện trạng source | Đề xuất |
| --- | --- | --- |
| Greeting | Ảnh nền tạo điểm nhấn, có hành động nhanh; tên/hạng hội viên/điểm tín thư viết cứng | Giữ bố cục, dùng tên session thật và link Đăng sách; bỏ hạng/điểm chưa có dữ liệu |
| Sidebar | Phân nhóm tổng quan, ví, kệ, đơn, đấu giá, wishlist, hồ sơ; phần lớn link `#`, số Lật-Xu mẫu | Giữ ý tưởng điều hướng cá nhân; nối route có thật, không mở các mục chưa làm |
| Stats | Số dư, escrow, giá trị kệ, đơn hàng và tăng trưởng đều mẫu | Chỉ thêm chỉ số khi có nguồn đúng và định nghĩa rõ; không cộng giá niêm yết thành định giá tài sản |
| MyBooks | Đã gọi API owner listing/ảnh, có filter và loading/empty | Giữ ý tưởng kệ xem nhanh; tái sử dụng service/identity/state của kệ hiện tại, không dựng bộ query song song |
| LiveAuctions | Hai phiên, giá, outbid và live label viết cứng | Giữ cách làm nổi việc cần xử lý; dữ liệu riêng cần nối API trước khi hiển thị như thật |
| Orders | Timeline mua/bán dễ scan, nhưng dữ liệu/nút mẫu | Giữ cấu trúc timeline cho màn đơn; ánh xạ state thật, không chép lời hứa carrier/bảo hiểm/quyết toán |
| Cashflow | Biểu đồ SVG và tổng thu/chi sáu tháng mẫu | Hoãn khỏi bản đầu; cần định nghĩa ledger, kỳ thống kê và nguồn tổng hợp trước |

## Các điểm không thể bê nguyên

1. `DashboardMyBooks` dùng `trade !== Available || visibility === Hidden` cho
   “Đã bán”. Reserved, Exchanged và bài ẩn không đồng nghĩa Sold. Trạng thái duyệt,
   công khai và giao dịch phải tách biệt như kệ hiện tại.
2. `getMyListings()` mặc định limit20, có nextCursor; dashboard cũ không xử lý
   cursor mà hiển thị `allItems.length` như tổng kệ. Phải ghi “trên trang này” hoặc
   bổ sung nguồn tổng hợp chuẩn; không fetch toàn bộ kệ để tính số mỗi lần mở.
3. Query cũ `['my-listings']` không chứa user/filter/cursor, lỗi tải bị rơi vào
   trạng thái trống. Bản hiện tại có owner key, retry và pagination. Tiếp tục dùng
   một SessionClient và kiểm cleanup/cache theo phiên.
4. Identity sách cũ dựa vào `(currentRevision as any).book`; kệ mới dùng
   `getMyBookIdentity` theo catalogStatus. Cần giữ đường đọc public/private này,
   ảnh owner riêng và lý do từ chối/gỡ bài.
5. Sidebar fixed288px với content `pl-72` không có điều chỉnh mobile trong layout
   cũ. Giữ desktop dashboard rộng nhưng dùng menu thu gọn trên điện thoại, nhãn
   focus/active và returnUrl của layout hiện tại.
6. Bản cũ dùng Tailwind xanh/Outfit/Material Symbols, khác đỏ rượu/kem/Be Vietnam
   Pro/Lucide hiện hành. Chuyển style trong phạm vi dashboard, không đổi token
   toàn app hoặc navbar/Home/Auth để khớp dashboard cũ.

## Khả năng nối dữ liệu

- Session/profile và `/me/listings` đã có consumer web thật, phù hợp bản đầu.
- `/me/wallet`, `/me/wallet/history`, `/me/orders`, `/me/wishlist` đã có trong
  contract. Đây là khả năng backend, không chứng minh web đã có đủ màn/chức năng.
  Ví là mô phỏng theo contract, không tự thêm điểm Lật-Xu hoặc rút tiền thật.
- Auction web có public list và `/me/auctions/{id}/participation`. Chưa thấy
  endpoint liệt kê tất cả phiên riêng đã tham gia hoặc dashboard tổng hợp trong
  contract hiện tại; không gọi participation cho mọi phiên public để giả bộ list.
- Thống kê thu/chi, tổng kệ và số việc cần xử lý cần contract/định nghĩa riêng nếu
  vượt dữ liệu API hiện có. Không suy hoàn tất/settlement từ timeline UI; gate
  READINESS giữ nguyên.

## Hướng tích hợp đề xuất

Tạo trang **Tổng quan cá nhân** (đề xuất `/account`, chưa tạo route). Menu bấm
Tài khoản có Tổng quan, Hồ sơ của tôi, Kệ sách của tôi; không thêm mục cấp đầu
trên navbar. `/profile` giữ thông tin tài khoản/bảo mật; `/my-books` giữ quản lý
bài đăng và legacy query redirect. Đây là đề xuất mở rộng quyết định menu cũ,
chưa được xem là chấp thuận mới.

Bản đầu của tổng quan giữ khung Minh: greeting có ảnh, hành động nhanh, vùng
công việc gần đây và kệ xem nhanh. Dùng session/owner listing thật trước; link
đến kệ chờ duyệt/bản nháp qua query, không bịa số tổng. Tái sử dụng logic dữ liệu
và thành phần trạng thái của bản hiện tại; greeting dùng tên thật, lời ngắn dễ hiểu.
Nếu chưa có việc hoặc sách, hiển thị empty state có link Đăng sách. Lỗi tải là lỗi
từng khối có Thử lại, không báo chưa có sách hoặc giấu cả trang.

Sau khi duyệt khung, triển khai ví/đơn/wishlist theo từng gói có route/API/loading/
empty/error riêng. Live auctions và cashflow triển khai sau khi rõ nguồn riêng và
gates. Nếu cần trình bày dashboard đầy đủ trước khi nối dữ liệu, dùng một preview
được ghi rõ dữ liệu mẫu, tách khỏi hồ sơ thật.

Khi code: nhánh riêng, giữ WIP teammate; kiểm desktop/laptop/mobile, keyboard,
guest returnUrl, account switching, lỗi/rỗng,20+listing/cursor, điều kiện ảnh riêng
và ba trục state. Giữ motion có ý nghĩa theo chính sách chủ dự án; không replay
animation dàn hàng cho mọi section mỗi lần đổi tab.
