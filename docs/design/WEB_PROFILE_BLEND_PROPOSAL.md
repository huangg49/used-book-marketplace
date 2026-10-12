# Kế hoạch pha trộn profile Tuấn Minh —12/10/2026

Trạng thái: nghiên cứu và kế hoạch, chưa triển khai UI/route/API. Chủ dự án đã
chọn **giữ cấu trúc chính, cải tiến cho đồng bộ**. Lựa chọn chốt mức độ kế thừa;
phạm vi triển khai dưới đây vẫn là đề xuất để duyệt.

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

## Mục tiêu và điều hướng

Member vào không gian cá nhân để biết sách của mình đang ra sao, xem hoạt động
liên quan và đi đến đúng màn xử lý. Đây là giao diện thao tác (Operate): dùng
bìa sách, chất giấy và chữ để có cá tính; ưu tiên scan và hành động rõ ràng.
Thành công là tìm được Kệ, Hồ sơ, Đăng sách hoặc thông báo liên quan mà không
phải giải mã thuật ngữ hoặc dò qua số liệu mẫu.

Đề xuất **Tổng quan cá nhân tại `/account`**. `/profile` giữ thông tin/bảo mật,
`/my-books` giữ quản lý bài đăng và legacy query redirect. Menu Tài khoản và
sidebar thêm Tổng quan ở đầu, tiếp tục dùng một nguồn cấu hình điều hướng.
Giữ các mục thật hiện hành, không thêm nút cấp đầu trên navbar hoặc đổi menu
bấm sang hover. Đăng nhập tiếp tục dùng `returnUrl`, không tự đổi mọi đích về
tổng quan. Đây là đề xuất mở rộng menu, chưa tạo route trong lượt nghiên cứu.

## Bố cục và cảm giác đề xuất

Desktop giữ sidebar khoảng200–220px; vùng chính mở đầu bằng lời chào thấp,
khoảng180–230px với nội dung thông thường, tự tăng khi chữ dài. Tiếp theo là
dải tóm tắt ví, rồi bố cục bất đối xứng: **kệ rộng ở trái, hoạt động gọn ở phải**.
Đơn hàng nối tiếp khi đủ đường dữ liệu/trang đích. Không ép mọi khối thành các
card giống nhau hoặc cùng chiều cao.

```text
Sidebar       Lời chào + Đăng sách / Xem kệ
              Ví mô phỏng: khả dụng · đang giữ cho giao dịch
              Kệ cập nhật gần đây (rộng) | Hoạt động gần đây (gọn)
              Đơn mua / đơn bán (giai đoạn2)
```

- Lời chào dùng tên session thật, câu ngắn như “Chào [tên], đây là kệ của bạn.”;
  một CTA chính Đăng sách và link Xem kệ. Hình nằm bên phải, không lót dưới chữ
  hoặc chiếm phần lớn viewport laptop; tên dài được xuống dòng.
- Giữ ý tưởng ảnh giấy cũ của Minh. Đã xem `public/bg-greeting.png`: bản đồ thế
  giới/kính lúp có chất liệu hợp, nhưng ít liên quan mua bán sách TP.HCM. Không
  ưu tiên làm hình trung tâm; chọn asset sách đã có sau khi kiểm nguồn/quyền,
  crop và tối ưu kích thước. Chưa tạo ảnh hoặc xác minh bản quyền asset trong gói này.
- Dùng đỏ rượu/kem/giấy sáng, font và Lucide hiện hành. Đường phân cách mảnh,
  ít khung; chữ viết tay nếu có chỉ ở một ghi chú ngắn, không ở số liệu/nhãn.
  Không đổi token toàn app hoặc dựng lại Home hero trong tài khoản.
- Kệ tối đa4 bài cập nhật gần đây, dạng dòng bìa nhỏ: tên, tác giả, trạng thái,
  giá bán/giá trị đổi nếu có. Không đưa hiệu ứng3D public listing vào danh sách
  quản lý. “Xem toàn bộ kệ” dẫn `/my-books`.
- “Bản nháp”, “Chờ duyệt”, “Bị từ chối” dẫn filter kệ có thật, chưa gắn số đếm
  khi không có tổng từ API. Không hứa sửa tiếp bản nháp trực tiếp khi luồng
  resume chưa được hiện thực và kiểm chứng.
- Hoạt động tối đa3 thông báo, thời gian và link đúng phiên; “Xem thông báo”
  đến inbox hiện hành. Không đổi unreadCount thành số việc cần xử lý.
- Mobile một cột, menu cá nhân thu gọn hiện tại. Thứ tự lời chào → tóm tắt ngắn
  → kệ → hoạt động, cùng thứ tự DOM/keyboard desktop.320px vẫn đọc được
  tên/bìa, nút wrap khi cần; không đảo vị trí bằng CSS làm tab order khó hiểu.
- Skeleton giữ khoảng trống tương ứng nội dung, không khoá toàn trang ở chiều
  cao cố định. Giữ scrollbar gutter và chiều cao tối thiểu hợp lý của các khối.
- Motion ngắn ở feedback/đổi trạng thái, không opacity0/stagger100–500ms cho
  mọi section lúc vào trang. Giữ chính sách motion chủ dự án, cleanup/visibility
  và tối ưu mobile; không sửa hiệu ứng navbar đang có.

## Dữ liệu: dùng ngay và có điều kiện

| Vùng | Source thực tế | Quyết định |
| --- | --- | --- |
| Tên/email/trạng thái | Session hiện tại | Dùng ngay, không tạo token store hoặc đọc lại profile vô ích |
| Kệ | `/me/listings`, identity và ảnh owner | Bản đầu, limit4; sort updatedAt/id giảm dần nên gọi “cập nhật gần đây” |
| Ví | `/me/wallet` có controller/service thật | Bản đầu chỉ đọc; thêm service web có schema đúng contract |
| Hoạt động | `/me/notifications`, service web có sẵn | Bản đầu; hiện chỉ gồm sự kiện Auction, không gọi là feed toàn bộ nghiệp vụ |
| Đơn hàng | `/me/orders` có source | Giai đoạn2; summary chưa có tên/bìa/giá, web chưa có màn đơn thật |
| Wishlist | `/me/wishlist` có source | Giai đoạn2; kiểm projection/quyền/visibility/schema trước khi nối |
| Đấu giá cá nhân | Participation theo từng auction | Giai đoạn3; thiếu endpoint list riêng, không quét toàn bộ public auctions |
| Tổng kệ/thu chi/tăng trưởng | Chưa có aggregate phù hợp | Giai đoạn3; định nghĩa và contract trước, không suy từ trang đầu |
| Sửa hồ sơ/avatar/liên hệ | SRS có mục tiêu, chưa thấy API cập nhật hiện hành | Ngoài gói này; không đưa nút Lưu giả vào Profile |

Ví bản đầu hiển thị `available` và `transactionHeld` với nhãn “Ví mô phỏng ·
Mô phỏng đồ án”, định dạng VND. Không cộng giá sách thành giá trị tài sản.
`withdrawalsEnabled` hiện false, `withdrawalHeld` hiện0; không thêm CTA Rút tiền
hoặc số Lật-Xu. Không tạo nút vào màn Ví chưa tồn tại. Các thao tác ví sau này
phải dựa trên flags server và được triển khai trong gói riêng.

Thông báo là sự kiện lịch sử. Một thông báo vượt giá không chứng minh người
dùng hiện còn bị vượt giá. Không thêm countdown/live badge/giá hiện tại hoặc
yêu cầu thanh toán từ notification body. Trang đấu giá đọc state hiện hành
mới quyết định hành động. Không tự đánh dấu đã đọc khi tổng quan lấy preview;
query và unread badge phải dùng chung cơ chế cache.

Order summary có id/state/version/role/thời gian, thiếu dữ liệu sách/giá; list
chỉ filter state, chưa có role filter. Tab mua/bán cần chốt projection và role
filter hoặc một phương án đọc hữu hạn đã kiểm chứng; không lọc role trên một
trang rồi tuyên bố đó là toàn bộ đơn. Timeline chỉ dùng state đã có, không mở
Delivered/inspection/settlement vượt gate READINESS.

Wishlist cần kiểm thêm đường project book/listing và điều kiện visible/deleted,
không mặc định raw document đã là public response đúng contract. Đây là
dependency cần kiểm, chưa phải kết luận lỗi đã tái hiện. Ví/history/orders/
wishlist có contract/source không có nghĩa mọi luồng đã được runtime nghiệm thu.

## Trạng thái và tương tác

| Trường hợp | Phản hồi yêu cầu |
| --- | --- |
| Khôi phục phiên | Shell loading, chưa render dữ liệu người trước |
| Guest | Login redirect, giữ returnUrl đầy đủ |
| Thành viên mới | CTA Đăng sách, kệ rỗng một hình nhỏ, “Chưa có thông báo”; ví0 chỉ khi server trả0 |
| Một khối lỗi | Lỗi cục bộ và Thử lại; các khối khác vẫn dùng được; không biến lỗi thành0 hoặc trống |
| Refetch | Giữ dữ liệu đúng owner đang có, trạng thái cập nhật nhẹ; không nhấp nháy cả trang |
| RESTRICTED/LOCKED | Hiển thị trạng thái thật, không suy login là quyền;403 có giải thích, không retry vô hạn |
| Draft/PendingReview/Rejected | Giữ nghĩa riêng/lý do khi có, vào owner shelf thay vì ép mở detail public |
| Approved nhưng Hidden/Removed | Không coi đang bán công khai, không link public nếu thiếu điều kiện |
| Reserved/Sold/Exchanged | Nhãn riêng, không suy từ visibility hoặc gộp “Đã bán” |
| Identity/ảnh lỗi hoặc hết hạn | Placeholder cùng kích thước, retry phù hợp; không thay bằng bìa sách khác |
| Nội dung dài | Wrap tên/tác giả/lý do, không tràn ngang; giá0 khác chưa có giá |
| Đổi tài khoản/logout | Query owner và cleanup phiên, không flash tên/ảnh/số dư của tài khoản trước |

Một H1, heading từng section; số liệu có nhãn, không truyền nghĩa bằng màu
riêng. Link đi trang, button làm hành động. Giữ skip link, H1 focus khi đổi
pathname, Escape/Tab menu và logout pending/error. Retry section không cướp
focus về H1; không đặt aria-live lên cả danh sách. Touch target đủ lớn,
focus-visible rõ nhưng không viền kép. Không che lỗi để giao diện nhìn gọn.

## Cách triển khai phù hợp codebase

1. Thêm `AccountOverviewPage` và CSS module trong `apps/user-web`, route dưới
   DashboardLayout hiện tại; cập nhật ROUTES/accountNavigation dùng chung.
   Không tạo DashboardLayout hoặc session logic thứ hai.
2. Compose Greeting/WalletSummary/RecentBooks/RecentActivity; có thể refactor
   legacy file khi hữu ích, không import khối mock chỉ vì trùng tên. Style trong
   phạm vi màn hình, không sửa global Tailwind/token.
3. Tách phần owner lặp từ MyBooks: ảnh, identity, nhãn state, điều kiện link.
   Full shelf và preview dùng presentation riêng trên logic chung; không gộp
   public BookCard với owner card vì khác quyền và mục đích.
4. Mở rộng service listings nhận limit, mặc định20 tương thích consumer cũ.
   Key gồm owner và tham số ảnh hưởng response, kể cả limit/cursor/filter;
   dashboard limit4, notification limit3; query factory/cache dùng chung khi phù hợp.
5. Giữ một SessionClient, schema Zod theo OpenAPI cho wallet. Session hiện clear
   cache khi identity đổi; vẫn giữ owner key và kiểm account switching thực tế.
6. Giới hạn fan-out theo4 bài: tối đa một identity và một ảnh đại diện/bài khi
   cần; dedupe cùng bookId. Không fetch toàn bộ media/cursor hoặc poll nhanh
   để dựng dashboard. Ảnh đúng kích thước, tránh kéo nền nặng vào mọi route;
   cache sau read notification cập nhật qua cơ chế hiện có, không đoán state mới.
7. Giai đoạn1 dự kiến không đổi API/DB/migration/OpenAPI. Nếu kiểm runtime phát
   hiện thiếu contract/quyền, ghi dependency và điều chỉnh gói; không workaround
   nghiệp vụ trong UI. Các gói API sau đi contract-first.

## Thứ tự thực hiện

**Giai đoạn1 — Tổng quan sử dụng được:** route/menu/shell, greeting, ví chỉ đọc,
4 bài gần đây,3 thông báo, lối filter kệ và đủ loading/rỗng/lỗi/quyền. Giữ
Profile/MyBooks/đường dẫn cũ; không section mẫu hoặc nút giả trong tài khoản
thật. Đây là phạm vi đề xuất để duyệt triển khai đầu tiên.

**Giai đoạn2 — Đơn hàng và tiện ích cá nhân:** chốt contract đọc/route chi tiết/
state mua-bán rồi gắn Orders vào tổng quan. Wishlist nối sau kiểm projection/
quyền. Màn ví/lịch sử và sửa hồ sơ là các gói riêng; không mở hết menu khi chưa
có trang hoặc hành vi tương ứng.

**Giai đoạn3 — Đấu giá cá nhân và thống kê:** endpoint list tham gia/tổ chức,
tổng kệ theo state, ledger aggregate theo kỳ nếu cần. Định nghĩa nguồn,
currency/timezone/phạm vi trước. READINESS giữ nguyên, không suy quyền làm
settlement từ nhu cầu vẽ biểu đồ.

## Tiêu chí nghiệm thu giai đoạn1

- Menu đến đúng trang, guest quay lại đúng returnUrl; Profile/MyBooks/query/
  Back/active menu giữ hành vi. Không lẫn owner ở tên/email/ảnh/số dư.
- Không nhầm ba trục state;20+ bài/cursor không làm dashboard nhận mình biết
  tổng. Ví lỗi không thành0; thông báo không biến thành quyền hoặc state live.
- Kiểm1440/1280px, laptop cao720px,390/320px và zoom125%/200%: không scroll
  ngang, CTA/focus không bị sticky navbar che; không ép dashboard vào một
  viewport hoặc giật ngang khi chiều cao thay đổi.
- Keyboard menu/Tab/Escape/skip/H1/retry, contrast và nhãn. Kiểm screen reader
  khi có công cụ, ghi đúng phần chưa chạy; DOM không là chứng minh speech PASS.
- Ca kệ0/1/4/>20, tên dài, thiếu ảnh/signed URL hết hạn, endpoint chậm/500/403,
  refetch, logout và account switching. Harness ghi dữ liệu chỉ chạy trên
  Mongo replica set/database `*_test` riêng; không seed/reset DB chính.
- Unit tests cần thiết cho state mapping, owner query/isolation và route khi
  refactor; web test/build/lint và consumer kệ/menu liên quan. API checks theo
  diff nếu có đổi source; không chạy lại gate không đổi.
- Bounded visual QA theo Impeccable: một lượt desktop/mobile, sửa cùng đợt rồi
  xác nhận nếu cần; evidence không lộ PII, handoff ghi thực chạy/NOT RUN/human
  review. Web không là nghiệm thu RN/Flutter/native.

## Checkpoint nghiên cứu

Chủ dự án đã chọn giữ cấu trúc Minh và cải tiến đồng bộ; không còn câu hỏi CSS
hoặc cấu hình cần quyết định. Phạm vi giai đoạn1 và route `/account` là đề xuất
chờ duyệt. Lượt này chỉ lưu nghiên cứu/kế hoạch, không đổi application source,
DESIGN/surface contract/API/DB/runtime. Khi code dùng nhánh feature riêng,
bảo toàn WIP teammate. Chưa push/PR.
