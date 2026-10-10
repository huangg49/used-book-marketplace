---
target: Tìm sách, chi tiết và đăng sách Member web; chỉ3 source đã ghi
total_score: 62
max_score: 120
na_heuristics: ""
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\ASUS\\Documents\\LaiLai\\used-book-marketplace\\apps\\user-web\\src\\pages"
timestamp: 2026-10-09T16-30-59Z
slug: apps-user-web-src-pages
---
⚠️ DEGRADED: single-context (hai sub-agent được cấp quyền đều dừng vì usage limit trước kết luận cuối; parent hoàn tất phần còn lại).

# Critique ba màn Member web — 09/10/2026

Source sản phẩm `da59199`, nền tài liệu `2e13f04`; phạm vi chỉ
[tìm sách](../../apps/user-web/src/pages/BookSearchPage.tsx),
[chi tiết](../../apps/user-web/src/pages/BookDetailPage.tsx) và
[đăng sách](../../apps/user-web/src/pages/SellBookPage.tsx), không phải mọi màn trong thư mục.
Brief áp dụng: [DESIGN](../../DESIGN.md) và [PRODUCT](../../PRODUCT.md).
Đây là đánh giá, chưa sửa UI/runtime/API và chưa là human sign-off.

## Nhận định thiết kế

Màn tìm sách có cá tính nhưng hướng tới một văn khố/sách sưu tầm, lệch audience
marketplace sách cũ thông thường. Chữ “thư tịch”, “ấn hành”, “thủ bút” và bộ lọc
di sản khiến người mới phải học ngôn ngữ của app trước khi tìm sách. Chi tiết và
đăng sách dễ hiểu hơn nhưng ngôn ngữ thị giác khác hẳn cùng hành trình.

Không thể quy tất cả lỗi web cho Lora: screenshot/computed style xác nhận search
headline dùng Playfair Display, body dùng Inter; detail/sell dùng Inter. RN còn
Lora/Be theo source, chưa được xem native trong lượt này. Cơ hội lớn nhất là thống
nhất typography và đưa tìm sách, tình trạng, giá, hành động lên trước phần trang trí.

## Điểm heuristic

0–4 mỗi tiêu chí; tất cả áp dụng cho các màn Operate. Điểm là nhận định AI về
source và những trạng thái đã xem, không là đo usability hoặc tiêu chí nghiệm thu.

| Nielsen | Tìm | Chi tiết | Đăng | Điểm yếu chính |
| --- | --- | --- | --- | --- |
| Trạng thái hệ thống | 1 | 3 | 2 | Search gộp loading/error/empty thành0 kết quả |
| Ngôn ngữ đời thực | 1 | 3 | 3 | Thuật ngữ văn khố, Xu và tên hành động lệch kết quả |
| Quyền kiểm soát | 1 | 2 | 3 | Nút lọc mobile không mở; review cho quay lại bước |
| Nhất quán | 1 | 2 | 2 | Font, giá trị đổi và các nhãn giữa màn khác nhau |
| Ngăn lỗi | 1 | 3 | 2 | Sort khác enum API; form đợi cuối mới báo thiếu |
| Nhận biết thay nhớ | 2 | 3 | 3 | Có nhãn tình trạng; bước review bỏ dữ kiện cần kiểm |
| Hiệu quả thao tác | 2 | 2 | 2 | Nhiều nút không hoạt động; mobile input rất hẹp |
| Tối giản/phân cấp | 1 | 2 | 3 | Hero/chips lớn; detail cover/tên dài đẩy giá xuống |
| Khôi phục khi lỗi | 1 | 2 | 2 | Search thiếu retry; sell lỗi dài không dẫn tới trường |
| Hướng dẫn theo tác vụ | 2 | 3 | 2 | Detail giải thích giữ24h; condition còn từ khó hiểu |
| **Tổng /40** | **13 — Poor** | **25 — Acceptable** | **24 — Acceptable** | Cần cải thiện rõ trước nghiệm thu UX |

Metadata lưu tổng30 điểm thành phần:62/120. Không dùng tổng này để che mức13/40
của search hoặc tuyên bố cả sản phẩm đạt. Không có tiêu chí n/a.

## Phần đang làm tốt

- Listing/detail lấy dữ liệu API thật; card có tình trạng, giá và fallback ảnh.
- Detail phân biệt chủ bài/người mua, sách đang giữ; giải thích24h và chưa thanh toán.
- Sell có5 bước, nhãn/giải thích tình trạng, quay lại bước và giữ state trong lượt nhập.

## Năm vấn đề ưu tiên

1. **P1 — Bộ tìm kiếm có nhiều lựa chọn chưa thực hiện đúng.** Sort gửi `price_asc`
   thay vì `salePriceAsc`; browser đổi12 kết quả thành0, không báo lỗi. Category/
   collectible/era đổi URL và chips nhưng không vào request; multi-condition chỉ
   gửi giá trị đầu. ISBN, trends, price shortcuts và list view thiếu handler.
   Người dùng tin mình đã lọc nhưng kết quả không phản ánh lựa chọn. Map đúng
   OpenAPI, chỉ hiện filter có API hỗ trợ; bỏ/ghi rõ chức năng chưa có. Không
   thêm metadata/backend giả để hợp thức hóa bố cục. Dùng `harden` + `clarify`.
2. **P1 — Luồng tìm trên mobile và keyboard có điểm nghẽn.** Ở390×844, ô nhập chỉ
   khoảng24.7px vì nút ISBN/search chiếm hàng; nút “Bộ lọc nâng cao(5)” không mở
   panel sau click. Checkbox dùng `hidden`, mất khả năng focus/AX; upload sell
   cũng dùng input `display:none` với label không focus được. Cho input hàng
   đầy đủ, một sort, panel filter thật với focus/Back; dùng control truy cập được,
   label rõ và kiểm keyboard/touch. Dùng `adapt` + `audit`.
3. **P1 — Câu chữ và dữ kiện gây kỳ vọng sai.** “12.800 ấn phẩm trước1975”, counts
   filter và “120 Xu” header là hardcode, chưa có nguồn runtime. Card đổi dùng Xu
   trong khi API/detail/sell dùng VND; “Mua ngay” chỉ mở detail, “Mua sách” mở giữ
   sách/chat, chưa mua/thanh toán. Đổi thành “Tìm sách”, “Xem sách”, “Giữ sách và
   mở chat”; hiển thị đơn vị đúng contract và bỏ claim chưa có bằng chứng. Thống
   nhất một họ sans cho tác vụ theo brief, kiểm dấu tiếng Việt/₫/tên dài.
   Dùng `clarify` + `typeset`; không chỉ thay font rồi xem như UX đã sửa.
4. **P1 — Trạng thái lỗi và bằng chứng tình trạng chưa đủ.** Search thiếu loading/
   empty/error/retry riêng; số hiển thị là số item trang hiện tại. Detail mọi lỗi
   tải đều nói sách không còn, chỉ xem ảnh đầu dù có nhiều ảnh; không có ảnh có
   thể kẹt “Đang tải ảnh…”. Phân biệt unavailable/network/server và cho phục hồi
   đúng API; làm gallery bìa/gáy/trang hỏng. Trên mobile cân lại cover/tên dài để
   giá và thông tin quyết định xuất hiện sớm, vẫn đọc được toàn tên. Dùng `harden`
   + `layout`. Những nhánh lỗi/đa ảnh là evidence source, chưa fault-inject browser.
5. **P2 — Đăng sách dồn việc sửa lỗi về cuối.** Có thể đến review với form trống;
   click Gửi duyệt tạo một alert dài liệt kê13 mục cần bổ sung, không dẫn tới field/
   bước. Review thiếu ảnh và các mô tả tình trạng, chưa có xóa/thay ảnh. Validate
   theo bước, nối lỗi với trường và focus, review đầy đủ dữ kiện. Recovery reload/
   upload lỗi vĩnh viễn cần gói riêng giữ key/version/receipt, không reset attempt
   tùy tiện để ép thành công. Dùng `harden` + `clarify`.

P0 chưa được chứng minh ở toàn bộ tác vụ; các điểm nghẽn keyboard vẫn phải sửa
trước release. P1/P2 ở đây là severity UX, không đồng nghĩa finding security.

## Tải nhận thức và hành trình

Search fail5/8 checklist: single focus, hierarchy, one decision, minimal choices,
progressive disclosure. Sáu trend chips và6 nhóm lọc desktop tăng lựa chọn không
cần thiết. Detail fail2/8 (hierarchy/choices), sell fail3/8 (chunking/one decision/
choices trong bước tình trạng). Đây là checklist, không phải giới hạn4 lựa chọn
cứng cho mọi giao diện hoặc đo tải nhận thức con người.

Hành trình bắt đầu ở một “văn khố”, gặp lựa chọn không hoạt động rồi mới thấy
detail rõ ràng hơn; người bán gặp form đơn giản ban đầu nhưng phải xử lý lỗi dài
ở cuối. Ưu tiên cải thiện những đoạn gây bối rối này trước thêm animation.

Persona giả định để kiểm thiết kế: người mới không hiểu thư tịch/Xu; người mua
trên điện thoại khó nhập và mở lọc; người lần đầu đăng sách không biết ảnh/ghi chú
còn thiếu từ review. Đây không phải kết quả phỏng vấn người thật.

## Quan sát nhỏ và hướng sửa

Hai sort trên narrow, tên token `--font-serif` thực tế là Inter, icon names lộ
trong AX và summary form thiếu trường là các điểm nên chuẩn hóa cùng lần sửa.
Tránh quy lỗi ảnh QA một màu cho style sản phẩm: ảnh là fixture, storage fake.
Preview đầu thiếu Tailwind vì cwd harness; đã sửa cấu hình và loại khỏi findings.

Thứ tự đề xuất: sửa search đúng API/trạng thái/control → thống nhất câu chữ/font
và detail → hoàn thiện form/recovery; mobile giữ tìm/xem/chụp/đăng/chat thường
xuyên, web thuận tiện mô tả dài/quản lý/vận hành. Không ép người dùng chuyển thiết
bị cho tác vụ thiết yếu. Ba câu kiểm với người ngoài nhóm: có tìm đúng sách không,
có hiểu giữ24h chưa thanh toán không, có tự sửa bài trước gửi được không.

## Bằng chứng và giới hạn

Assessment A parent được ghi xong trước đọc file B/detector; tính độc lập đầy đủ
không còn sau hai agent lỗi quota. B đã chạy detector một lần, exit0, JSON `[]`,
0 primary/advisory, không có rule/location hoặc false positive. Detector không
phát hiện các lỗi API/UX ở trên; sạch pattern không chứng minh UI tốt.

Browser/source là fallback: desktop1440×1000 và narrow390×844, seed13 listing QA,
API build theo source hiện tại, Mongo replica set QA `*_test`, storage local fake.
Đã xem ba màn, đổi sort, click lọc mobile, chuyển bước sell và validate form trống;
không thực hiện mua/giữ sách, upload thật hoặc gửi bài hợp lệ. Native/TalkBack/iOS,
live Supabase, lỗi mạng có chủ đích và usability người thật NOT RUN.
Overlay NOT RUN vì evaluate được cấp chỉ read-only, không có API injection;
không khởi động live overlay server, không nhận là overlay đã hiện.

Questions skipped: hướng typography, audience và phạm vi ba màn đã được chủ dự
án duyệt; không hỏi lại. Các câu kiểm user phía trên là acceptance đề xuất cho gói sửa.
