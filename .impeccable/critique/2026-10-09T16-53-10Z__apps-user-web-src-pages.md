---
target: "Critique độc lập3màn Member web: search/detail/sell"
total_score: 56
max_score: 120
na_heuristics: ""
p0_count: 0
p1_count: 5
target_identity: "file:C:\\Users\\ASUS\\Documents\\LaiLai\\used-book-marketplace\\apps\\user-web\\src\\pages"
timestamp: 2026-10-09T16-53-10Z
slug: apps-user-web-src-pages
---
Method: dual-agent (A: /root/ui_review_a_fresh · B: /root/ui_review_b_retry)

# Critique độc lập ba màn Member web — 09/10/2026

HEAD lúc review `046b5e9`; source sản phẩm `da59199`, chưa sửa UI giữa hai lượt.
Phạm vi đúng [tìm sách](../../apps/user-web/src/pages/BookSearchPage.tsx),
[chi tiết sách](../../apps/user-web/src/pages/BookDetailPage.tsx) và
[đăng sách](../../apps/user-web/src/pages/SellBookPage.tsx). Directory target chỉ
là identity lưu chung, không có nghĩa mọi màn trong thư mục đã được review.
Theo [PRODUCT](../../PRODUCT.md), [DESIGN](../../DESIGN.md) và contract hiện hành.
[Lượt trước](2026-10-09T16-30-59Z__apps-user-web-src-pages.md) là DEGRADED; hai
agent lần này không đọc báo cáo/điểm/findings của lượt trước hoặc output của nhau.

## Nhận định thiết kế

Xanh rừng, giấy sáng và bản sách vật lý có thể tạo cá tính riêng. Search hiện dựng
hiệu sách di sản, trong khi detail là marketplace thông thường và sell là wizard
trung tính. Ba màn thiếu một ngôn ngữ tác vụ chung. Các chữ “thư tịch”, “ấn hành”,
“thủ bút” cùng collector filters lệch audience marketplace sách cũ tại TP.HCM.
Cá tính nên đến từ cuốn sách, tình trạng và ảnh hữu ích, không từ định vị cổ thư
chưa được sản phẩm chứng minh. Grid/card phù hợp để so sánh, không cần bỏ máy móc.

Cả hai xác nhận search headline dùng Playfair Display, detail/sell dùng Inter.
`--font-serif` ở detail thực tế resolve thành Inter. RN còn Lora/Be theo source;
không xem native trong lượt này. Vì vậy bỏ ràng buộc Lora và thống nhất sans theo
brief là hướng sửa, nhưng thay font riêng lẻ không giải quyết controls/copy sai.

## Điểm Nielsen của A

0–4 mỗi heuristic; tất cả áp dụng cho Operate, không có n/a. B cung cấp kiểm chứng
source/browser, không tự tạo bộ điểm thứ hai hoặc đọc điểm A. Điểm AI không là
usability research, accessibility acceptance hoặc human sign-off.

| # | Heuristic | Tìm | Chi tiết | Đăng | Điểm yếu chính |
| --- | --- | --- | --- | --- | --- |
| 1 | Trạng thái hệ thống | 1 | 2 | 2 | Search loading/error/empty cùng zero surface |
| 2 | Ngôn ngữ đời thực | 1 | 2 | 3 | Di sản/Xu/nhãn mua khác định vị và hành động |
| 3 | Quyền kiểm soát | 2 | 2 | 2 | Có back/reset; detail back mất query; thiếu checkpoint form |
| 4 | Nhất quán | 1 | 2 | 2 | Hai sort khác behavior; nhãn condition khác giữa màn |
| 5 | Ngăn lỗi | 1 | 2 | 1 | Control unsupported; seller tới cuối mới biết lỗi |
| 6 | Nhận biết thay nhớ | 2 | 3 | 2 | Nhóm tình trạng tốt; review bỏ dữ kiện đã nhập |
| 7 | Hiệu quả thao tác | 1 | 2 | 2 | Main search Enter hoạt động; shortcuts chết |
| 8 | Tối giản và phân cấp | 2 | 3 | 3 | Search nhiều lựa chọn; detail/sell tương đối rõ |
| 9 | Khôi phục khi lỗi | 0 | 2 | 2 | Search thiếu recovery; form error không dẫn tới field |
| 10 | Hướng dẫn tác vụ | 1 | 2 | 3 | Sell có mẫu; search thiếu đường tiếp tục khi rỗng |
| **Tổng /40** | | **12 — Poor** | **22 — Acceptable** | **22 — Acceptable** | Cần sửa trước nghiệm thu UX |

Snapshot metadata:56/120 = tổng30 điểm thành phần. Source giống lượt trước;
chênh điểm62→56 phản ánh người đánh giá/phương pháp, không chứng minh regression
hoặc cải thiện sản phẩm. Không dùng tổng để che điểm yếu của search.

## Điều đang làm tốt

1. Listing/photo và pagination dùng API thật; B thử trang đầu12 cuốn, trang tiếp
   một cuốn, rồi về trang đầu thành công trên fixture13 cuốn.
2. Detail có giá bán/giá trị đổi, mô tả ruột/bìa/ghi chú/phụ kiện và giải thích
   giữ24h/chưa thanh toán; giới hạn kiểm duyệt được nói trung thực.
3. Sell có labels, mẫu mô tả, bước hiện tại, focus nhìn thấy ở text input và giữ
   title khi chuyển bước hoặc sau invalid submit. Không gọi form là mất dữ liệu
   ở những thao tác này; reload/mutation recovery chưa được chạy.

## Năm ưu tiên

1. **P1 — Search hiển thị lựa chọn mà request không thực hiện.** Hai agent cùng
   thấy category/era/collectible đổi URL/chips nhưng whitelist request bỏ chúng;
   multi-condition chỉ gửi giá trị đầu. Desktop sort `price_asc` khác enum
   `salePriceAsc` của API. Giá/trend/ISBN/list view thiếu handler. B xác nhận era
   chỉ đổi URL và sort không có error/retry, nhưng tool không expose HTTP status;
   không nhận là đã đo HTTP400. Sửa map đúng contract, bỏ lựa chọn chưa hỗ trợ và
   giữ cursor reset. Không thêm API giả. `harden` + `clarify`.
   Source: BookSearchPage.tsx:10,134,167,325,364,405,491,522,568; OpenAPI:767.
2. **P1 — Mobile và keyboard bị mất đường thao tác.** A đo input chính khoảng25px
   tại390×844; cả hai click filter không mở panel, đổi sort mobile không đổi URL.
   B xác nhận checkbox hidden không có role/control trong AX; search/price/sort
   thiếu label, upload input hidden không có affordance keyboard. Cho input đủ
   hàng, một sort nối query, panel filter thật; dùng control focusable và label
   bền vững. Kiểm keyboard/screen reader riêng trước nhận accessibility PASS.
   `adapt` + `audit`. Source: BookSearchPage.tsx:98,256,264,280,322,362,491;
   SellBookPage.tsx:373. Không kết luận mọi input sell thiếu label/focus.
3. **P1 — Không phân biệt rỗng, đang tải và thất bại.** Cả hai thấy keyword không
   có sách trả0 và vùng trống, không đường phục hồi. Source search render count
   theo items.length hoặc0 bất kể pending/error. Detail mọi read error thành
   “Cuốn sách này không còn trên kệ”. Render loading/empty/error riêng, gợi ý sửa/
   clear query, retry giữ filter; phân biệt not-found/network/server ở detail.
   `harden`. Source: BookSearchPage.tsx:23,549,602; BookDetailPage.tsx:29.
   Network fault injection chưa chạy; error branches là source evidence.
4. **P1 — Dữ kiện/câu chữ hứa quá kết quả thật.** Cả hai nhận ra claim12.800,
   count/condition percentages và120Xu hardcode; BookCard dùng Xu trong khi
   detail/API dùng VND. “Mua ngay” mở detail; “Mua sách” mở giữ24h/chat. Bỏ claim
   không có provenance, giữ đơn vị đúng contract; dùng “Tìm sách”, “Xem sách”,
   “Giữ sách và mở chat”. Thống nhất typography theo brief, glyph/weight/license
   trước bundle. `clarify` + `typeset`. Source: BookSearchPage.tsx:83,91,311,354,451;
   BookCard.tsx:67,108,120; Header.tsx:107; BookDetailPage.tsx:36.
5. **P1 — Review đăng sách chưa giúp kiểm/sửa đủ dữ liệu.** A xét cả hành trình
   là P1; B xét riêng validation muộn là P2. A gửi trống gặp13 mục thiếu; B nhập
   title rồi gửi gặp12 mục và focus vẫn ở submit, title được giữ. Review bỏ ảnh/
   mô tả vật lý nên người bán phải nhớ nhiều bước. Validate theo bước/trường,
   summary nhóm lỗi có link/focus; review đầy đủ dữ kiện với đường Sửa tại từng
   nhóm. Giữ key/version/attempt, không hứa autosave khi source chưa có.
   `harden` + `clarify`. Source: SellBookPage.tsx:65,99,143,1210,1256.

Không có P0 toàn tác vụ được chứng minh. Đây là severity UX, không phải security
findings hoặc quyền mở rộng nghiệp vụ. Ưu tiên có thể hiệu chỉnh sau user testing.

## Tải nhận thức, hành trình và persona giả định

A đánh checklist8 mục: search fail6/8 (focus/chunking/hierarchy/one decision/
minimal choices/progressive disclosure); detail2/8 (hierarchy/working memory);
sell3/8 (chunking/one decision/working memory). Search có6 trends,7 categories,
6 desktop sort options. Listing grid là một tác vụ chọn sách, không coi mỗi card
là một nhánh quyết định. Ngưỡng4 là gợi ý thiết kế, không là giới hạn con người.

Search tạo kỳ vọng qua lời di sản/filter rồi gây hụt hẫng khi không có kết quả
hay control không phản hồi. Detail mô tả bản sách tạo niềm tin nhưng nhãn mua gây
kỳ vọng sai. Sell dễ vào nhưng cuối hành trình phải tự tìm nhiều lỗi. Cải thiện
những đoạn này trước thêm animation.

- Người lần đầu mua có thể nghĩ app chỉ dành cho cổ thư và hiểu nhầm đã mua.
- Người dùng điện thoại bị gián đoạn khó kiểm từ khóa trong ô25px và không mở lọc.
- Người dùng keyboard/screen reader thiếu filter/upload focusable; cần kiểm thật
  Tab/Space/NVDA/TalkBack riêng. Persona là giả định phân tích, chưa phỏng vấn user.

## Quan sát nhỏ và chênh lệch đánh giá

Detail chỉ hiển thị photos[0] dù bản sách có thể có nhiều ảnh hư hại; chưa chạy
đa ảnh/ảnh lỗi. Detail back về `/books` làm mất query. Header result count là số
sách trên trang, không tổng. Sell thiếu xóa/reorder ảnh; catalog selection còn
gap vì source submit tạo catalog request từ title/author. Không tự bổ sung API
hoặc gọi nó đã triển khai. Typography/label condition cần cùng ngôn ngữ.

A thấy hierarchy narrow detail làm giá xuống sau cover/tên dài; B xác nhận wrap
không tràn ngang và ảnh fixture load. Không biến điều này thành lỗi overflow hoặc
chê ảnh thật từ bìa QA màu phẳng. B xác nhận focus text input sell nhìn thấy;
không suy tất cả form mất focus từ một `outline:none`. Hai agent thống nhất lỗi
search/copy/state; khác severity riêng của seller, được giữ rõ ở trên.

## Nguồn và giới hạn của evidence

Detector B chạy một lần qua pinned wrapper, exit0, JSON[],0 findings/rules/locations,
stderr rỗng; không có false positives để phân loại. Các finding ở đây là manual
source/browser, không phải findings của detector. Mechanical clean không là UX PASS.

A dùng tab mới ẩn,1440×1000 và390×844; B tab mới ẩn,1440×900 và390×844. B chỉ
resize sau khi A đóng tab/reset; parent chỉ đọc output B sau khi A final hoàn tất.
A không đọc old report/scores/detector/B; B không đọc old findings/scores/A. B có
một heading search vô tình trả header mô tả lượt DEGRADED cũ, không score/finding,
đã ghi disclosure. Một attempt A ban đầu đọc câu thứ tự sửa trong workflow bị
loại trước browser và thay bằng A fresh context; không dùng attempt đó để chấm.

API/Mongo QA `*_test` thật, storage fake,13 listings fixture/long title/plain covers.
Đã xem3màn×2viewports, tìm/empty/pagination/filter/sort, navigation form và invalid
local validation. Không login, reserve/purchase/pay/upload/valid submit/API mutation.
A/B không tự start server. Overlay NOT RUN vì API evaluate chỉ đọc, không injection;
fallback DOM/AX/computed-style/screenshots/source, không có live overlay server.
Ảnh được tool hiển thị inline; không lưu PNG riêng.

NOT RUN: native, screen reader/audio, chữ lớn/zoom/contrast audit, owner/held,
network fault injection, mutation/upload/retry/reload recovery, live Supabase và
usability người thật. Không đổi READINESS hoặc nhận UI/accessibility/release PASS.

Questions skipped: user đã duyệt scope và hướng thiết kế; không hỏi lại. Bước
nghiệm thu đề xuất là người ngoài nhóm tìm sách, hiểu giữ24h/chưa thanh toán và
tự sửa bài trước gửi; gói redesign cần acceptance và evidence riêng.
