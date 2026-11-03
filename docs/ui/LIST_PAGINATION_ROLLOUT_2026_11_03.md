# Phân trang danh sách web — 03/11/2026

Owner yêu cầu chạy lần lượt, đặt phân trang đúng nơi và giữ giao diện Lật lại.
Nhánh `codex/web-list-pagination-rollout`, base `7366b792`. Phạm vi triển khai là
Member web React/Vite và các consumer Operations liên quan; không đổi API,
contract, DB, tiền, điều kiện review, intent/key/version hoặc phân quyền.

## Quyết định theo từng bề mặt

| Vai trò và entry | Cách đọc/hiển thị | Kết quả và Back/phục hồi |
| --- | --- | --- |
| Member/khách, `/books` | Cursor URL; giữ filter/sort và animation trang | Trước/Sau, browser Back/Forward, detail→Back và reload giữ trail. Cursor dán trực tiếp hiện “Trang hiện tại”, không bịa số trang |
| Member, `/my-books` | Cursor URL, 20 bài mỗi response | Quay lại đúng cursor trước, không chỉ có Về đầu; không đổi card/command của owner |
| Member, `/my-auctions` | Cursor URL, 12 phiên mỗi response | Giữ view, phiên và nghĩa vụ thanh toán; không cộng số đã tải thành tổng |
| Member, `/orders` | Cache cursor, 8 đơn mỗi trang hiển thị | Lọc vai trò/trạng thái rồi phân trang; khi cần, tìm tiếp qua cursor thưa kết quả. Header ghi “Đơn đã tải” khi chưa đọc hết |
| Member, `/exchange/mine` | 5 trao đổi/trang trong snapshot hiện có | Số trang rút gọn và mobile Trước/Sau; URL page quá lớn được đưa về trang cuối hợp lệ |
| Member, `/notifications` | Cache cursor, 10 thông báo/trang | Lọc trong các trang đã đọc; tìm tiếp được ở trang cũ hơn. Số unread vẫn lấy từ máy chủ, không từ bộ lọc local |
| Member, `/reviews?tab=pending` | Cache cursor, 10 giao dịch/trang | Deep link viết đánh giá giữ type/transaction; không đổi quyền viết/công bố, 72h/48h hoặc trạng thái giao dịch |
| Khách/Member, `/members/:id` và hồ sơ của tôi | Cache cursor, 10 nhận xét/trang | Điểm và số mẫu vẫn từ summary API; không tính lại theo trang. 404 che cache, 503 giữ trang; đổi member không dùng nhận xét cũ |
| Member, `/support` | Cache cursor, 10 yêu cầu/trang | Giữ state/kind; lỗi trang sau không thành rỗng hoặc làm mất hồ sơ đang đọc |
| Khách/Member, `/auctions` | Snapshot API, 8 phiên/trang; Sắp mở có pager riêng | Giữ filter/sort trong URL, reset page khi đổi filter; hai nhóm không dùng chung số trang |
| Member, `/auctions/new` | Tải thêm cursor trong bộ chọn sách | Chọn được sách ngoài 50 mục đầu; retry giữ sách đã chọn và giá nhập. Fieldset vẫn khóa khi command pending/unknown; không submit khi bấm tải thêm |
| Admin, Trung tâm xử lý | `CursorPagination` của Operations | Có page count đã tải, lỗi/retry cursor, giữ các hồ sơ đã đọc; từ chối role trước khi đọc |
| Admin/Staff, Đánh giá giao dịch | Giữ pager Operations hiện có | Next dùng `cancelRefetch:false`, không hủy refresh bằng tải trang mới |

## Chỗ giữ cách hiện tại

- Home là các kệ giới thiệu dẫn đến danh sách đầy đủ, không đặt số trang vào từng
  preview. Hội thoại/tin nhắn, hàng việc và các picker có tải thêm đang dùng cách
  mở rộng theo ngữ cảnh; không thay bằng pager làm mất nháp hoặc quyết định đang mở.
- Admin Users, review queue/history, hậu kiểm AI đã có cursor component riêng;
  giữ pattern phục vụ hàng việc thay vì nhập component Member sang Operations.
- RN có các nút/điều khiển tải thêm của nền tảng; Flutter có shelf cursor riêng.
  Không đưa CSS/React component này vào native. Gói này không tuyên bố parity,
  nghiệm thu native hoặc khảo sát toàn bộ nghiệp vụ của những app đó.

## Trạng thái và thiết kế

[Pagination](../../apps/user-web/src/components/Pagination/Pagination.tsx) giữ
wine/cream, không nhấc nút khi hover, focus từ brand chung. Owner yêu cầu giữ
phong cách số trang của Antigravity: trang hiện tại nền wine; trang1/2 luôn hiện,
dấu “…” mở bảng chọn khoảng trang. Không có form nhập số/Đi. Container hẹp giữ
số trang và target44px; dưới280px chia hai hàng. Không phụ thuộc chỉ viewport. Specificity của
control đủ để form CSS của trang không đổi riêng font/padding của pager.

[Cursor navigation](../../apps/user-web/src/components/Pagination/useCursorNavigation.ts)
lưu toàn bộ trail và index trong từng history entry, scope theo identity/bộ lọc.
Nhảy10→2 dùng cursor đã biết trực tiếp; không cắt mất trang3–10. Khi server trả
cursor kế tiếp khác, chỉ vô hiệu hóa phần trail sau vị trí hiện tại. Không dùng
localStorage/sessionStorage và không lưu token. Chặn double navigation trước
commit location. URL cursor lỗi vẫn có đường quay lại và retry request hiện tại.

[Paged collection](../../apps/user-web/src/components/Pagination/usePagedCollection.ts)
dùng cache TanStack hiện có, không tạo data/token store mới. Chỉ đọc tiếp khi cần
một trang chưa có; scan bộ lọc thưa đến khi có kết quả hoặc hết cursor. Lỗi giữ
rows/page, retry cùng cursor, chặn request trùng và vòng cursor. Đổi filter/owner,
điều hướng hoặc unmount ngừng scan cũ; response cũ không chuyển trang hiện tại.
History state giữ vị trí khi đi chi tiết rồi Back; đổi filter về trang1. Khi đọc
hết, total là tổng thực của tập đã đọc; trước đó không lấy loaded count làm tổng.

[CollectionPager](../../apps/user-web/src/components/Pagination/CollectionPager.tsx)
chỉ cuộn/focus về đầu nhóm kết quả sau thao tác phân trang được xác nhận; không
cướp focus khi người dùng đổi bộ lọc. Dùng Lenis hiện có khi đã khởi tạo. Form mở
đấu giá dùng tải thêm và giữ nguyên draft/intent thay vì thay trang/unmount form.

Một lỗi responsive có trước được tái hiện trong harness hồ sơ: ở320px, tên/nhãn
uy tín ép identity rộng254px trong vùng193px. Thêm wrap cho identity/name/badge,
giữ bản thiết kế local Antigravity. Không xóa assertion chống overflow để qua test.
CSS pager cũ của Search/MyBooks/MyAuctions/Exchange được bỏ sau khi consumer đã
chuyển hết; không đổi CSS/biểu mẫu giao dịch ngoài phạm vi.

## Giới hạn dữ liệu có thật

- `/exchanges` hiện không nhận cursor và source backend giới hạn100 bản ghi,
  trả nextCursor null. Pager ở Exchange là phân trang snapshot **đã tải**. UI ghi
  phạm vi khi đạt100; không tuyên bố đã thấy mọi lịch sử. Xem
  [list backend](../../apps/api/src/modules/exchanges/exchanges.service.ts) và
  [adapter Member](../../apps/user-web/src/services/exchange.ts).
- Danh sách đấu giá công khai là snapshot giới hạn50, không có cursor trong
  contract response hiện tại. Giữ thông báo scope50 và tổng trong danh sách đó;
  không tự tạo cursor hoặc thay backend để làm UI trông đầy đủ.
- Tải lại cứng một collection có history page sâu nhưng cache đã mất chỉ hiển thị
  trong dữ liệu vừa đọc; Back/detail Back với cache còn giữ đúng trang. URL cursor
  lists có trail trong history và đọc lại đúng cursor khi reload. Không hứa điều
  hướng đến dữ liệu chưa tải khi API không có khả năng đó.

## Kiểm chứng

### Rà từng consumer và tinh chỉnh — base92c7b178

Owner giao rà tất cả nơi đã dùng phân trang, nhánh `codex/pagination-consumer-audit`.
Source inventory gồm12 cụm Member trong11 màn (đấu giá công khai có2 kệ) và8
consumer `CursorPagination` Operations. Không đổi API/contract hoặc seed DB.

| Màn/nhóm | Kích thước trang hiện hành | Kết luận và thay đổi |
| --- | --- | --- |
| Search, kệ cá nhân, đấu giá cá nhân | Theo cursor server,20 mục trong fixture | Giữ cursor/trail; thêm scroll/focus sau kết quả cho hai màn cá nhân. Search đã có heading/motion riêng |
| Đơn trực tiếp |8 đơn | Giữ cache, focus về nhóm kết quả, Back và retry |
| Thông báo, giao dịch đánh giá, hồ sơ uy tín, hỗ trợ |10 mục | Giữ cache/focus. Chỉnh wrap tên/ngày/điểm của thẻ review ở màn nhỏ để phần trên pager đọc được |
| Trao đổi |5 hồ sơ nặng | Chừa24px giữa thẻ cuối và divider, focus sau đổi trang; giữ scope snapshot100 |
| Đấu giá công khai: đang mở và sắp mở |8 phiên/kệ | Giữ số trang độc lập trong URL, mỗi kệ focus đúng heading; chừa24px trước divider, giữ scope50 |
| Ví |10 dòng ledger | Focus heading sau đổi trang thành công; giữ dòng khi lỗi, focus filter và cache |
| Admin: Users, lịch sử khóa tài khoản, queue bài đăng, lịch sử bản gửi, đối chiếu bản gửi, hậu kiểm AI, đánh giá giao dịch, hỗ trợ | Trang cursor server, tải thêm | Source8 nơi đều giữ `cancelRefetch:false`, khóa pending và lỗi/retry của component. Cô lập2 selector Users đang ghi đè footer toàn cục; giữ lựa chọn hồ sơ/nháp và layout từng pane |

Chỉnh shared pager: không giấu một số trang duy nhất sau dấu “…”; mobile≤4 trang
hiện thẳng các số. Bảng chọn chia cột theo bề rộng, mũi tên bàn phím theo số cột
thật và chọn phía có chỗ trong viewport. Không đổi tên/màu thương hiệu hoặc
phong cách số trang đã được owner chọn. Không giảm size trang chỉ để làm đẹp ảnh;
các giá trị trên phù hợp trọng lượng nội dung và contract hiện có.

PASS Member/Admin build/typecheck (Admin bundle check),338 unit Member và10 unit
list-feedback Operations. Browser list42 màn/viewport, wallet8 màn/chữ/motion,
popup cột hẹp/viewport thấp/ArrowDown/Escape; focus kệ/đấu giá/trao đổi/ví và kệ
sắp mở độc lập. Browser reputation HTTP/schema thật với dữ liệu giả kiểm privacy,
cache/filter/503/404 và320px chữ130%. Browser Admin Users→Support4 kích thước
kiểm giữ rows khi lỗi/retry, CSS không lan và footer review queue giữ16px.
Tất cả transport QA giả, không DB/provider.8 vị trí Operations được đọc source;
không nhận mỗi trang Admin đã có browser integration riêng từ test footer chung.
Lint chỉ có cảnh báo Date.now có trước ở AuctionList. Native/human/CI mới NOT RUN;
READINESS giữ nguyên. Artifact theo các thư mục ở cuối báo cáo, thêm
`.tmp/admin-pagination-layout/`.

Bản local Documents đã nhận các file của gói sau khi đối chiếu nguồn và sao lưu.
Phần CSS hồ sơ uy tín được nối thêm vào bản local hiện có. Sau khi khởi động
ứng dụng, Member5174, Admin5173 và API3000 trả HTTP200. Smoke Search live chỉ
đọc,1→2→1 PASS ở1440/390px,0 lỗi trang.

Follow-up số trang (`codex/pagination-direct-page-jump`, base099e3340): PASS
build/typecheck,13 unit Pagination và lint phạm vi, detector0. Browser component/
wallet8 ca màn/chữ/motion; list42 màn/viewport và ca10→2 một lần bấm ở1440/390/
320px (320 chữ130%), không fetch trung gian; dấu “…”/Escape, không form nhập số.
Cursor10→2→3→10, Back/Forward, về1/2 và reload giữ trail. Test phản hồi muộn vẫn
kiểm filter/page1 và rỗng; fixture hiển thị empty ngoài pager khi hết dữ liệu,
thay vì phụ thuộc vào thời điểm pager rỗng bị ẩn. Bằng chứng dùng transport giả.
Không chạy lại API/native/provider hoặc CI vì không đổi source những phần đó.
Sau copy có backup vào Documents: localhost5174 `/books?data=live`, browser riêng
chỉ GET public,1→2→1 PASS ở1440/390px;0pageerror,0write. FE5174/Admin5173/API3000
HTTP200; giữ4file reputation/support của Antigravity byte-identical, không
restart dịch vụ hoặc thay branch runtime. Đây là smoke đọc local, không QA ghi DB.

- PASS Member build/typecheck và336unit; Admin build/bundle/typecheck và229unit
  trên source của gói trước bàn giao; scoped lint chỉ còn cảnh báo Date.now đã có
  ở AuctionList. Không chạy CI hoặc push/PR mới.
- [list-pagination.mjs](../../apps/user-web/tests/list-pagination.mjs):42 cặp màn/
  viewport (10 màn Member ×1440/768/390/320,320 có chữ130%; Admin Support1440/390).
  Model tests cache/Next/Back, filter/owner reset, response cũ, sparse scan, vòng
  cursor, duplicate pending click, URL Back/Forward/detail Back/reload/pasted
  cursor. Có test giữ radio/giá khi picker lỗi rồi retry; role Admin bị từ chối
  không đọc queue. Focus sau page change về kết quả; mobile controls nằm trong
  container và có target44px. External requests bị chặn.
- [pagination.mjs](../../apps/user-web/tests/pagination.mjs):8 ca màn/chữ/motion,
  keyboard/forced-colors, các variant và wallet cache/error/retry/identity.
- [member-reputation.mjs](../../apps/user-web/tests/member-reputation.mjs):HTTP
  fixture qua session/schema thật,1440/900/390/320 và130%, không internal scroll;
  giữ summary/sample count/cache12 dù trang2 chỉ hiện2; pending reply bị ẩn,
  approved reply hiển thị,503 giữ trang,404 che cache và đổi member không rò dữ liệu.
- [search-recovery.mjs](../../apps/user-web/tests/search-recovery.mjs):9 ca PASS,
  không sửa query/filter/focus recovery để làm pagination khớp giả.
- Tất cả browser evidence dùng fixture, không DB/API thật hoặc provider; không
  chứng minh native, thanh toán/giao hàng, UX người thật hay release readiness.

Lệnh: `pnpm --filter @used-books/user-web test:list-pagination:browser` và các
script browser trên. Artifacts cục bộ ở `.tmp/list-pagination/`,
`.tmp/pagination-browser/`, `apps/user-web/test-results/member-reputation/`.
Các server/browser QA được đóng trong finally. READINESS giữ nguyên.
