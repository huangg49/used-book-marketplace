# Bộ lọc theo danh mục — 11/10/2026

## Cập nhật hiện hành12/10/2026

Gói lõi mở rộng đã triển khai trên `codex/catalog-expansion`: vocabulary v2
17gốc/55con/72mã,25facet/234lựa chọn; parent query tách metadata, migration0019,
Navbar/Home/Search/Chi tiết/Đăng sách/Admin và RN bảo toàn classification.
OpenAPI0.34.0/125operation; preview118ấn bản có nguồn, thuộc tính và giá vẫn là mẫu.
Migration0019 đã áp dụng local; không backfill hay sửa catalog revision cũ.
Xem [ADR0035](../adr/0035-catalog-vocabulary-v2.md), [kế hoạch được duyệt](CATALOG_EXPANSION_PLAN.md)
và [evidence](../../.impeccable/review/catalog-v2/README.md).

Phần dưới là snapshot của gói v1 ngày11/10, giữ để đối chiếu lịch sử; các số
vocabulary, preview, contract và trạng thái migration bên dưới thuộc mốc đó.

Phạm vi chủ dự án đã duyệt: mở rộng bộ lọc theo từng nhóm sách và triển khai
xuyên suốt Search → Đăng sách → catalog/API/Mongo → Admin đọc hồ sơ. Nhánh
`codex/catalog-contextual-filters`, base `aadbd88`. Đây là phần tiếp nối của
[plan Search](WEB_SEARCH_FILTER_REFINEMENT_PLAN.md); yêu cầu cũ “mọi control luôn
vừa một viewport laptop” được thay bằng nhóm lọc đầy đủ, cuộn tự nhiên khi dài.
Hero và bố cục Home giữ nguyên; Chat/Thông báo còn là WIP riêng.

## Phân loại dùng chung

Vocabulary `catalog-v1` ở `packages/api-contract/src/catalog-taxonomy.js`:
11 danh mục gốc (10 nhóm chính + Sách khác), tổng 29 nút và 16 loại thuộc tính.
Mã ổn định dùng cho query/DB; nhãn tiếng Việt dùng cho giao diện. Một đầu sách
có một categoryId và nhiều giá trị trong từng thuộc tính tùy chọn.

| Nhóm | Nhóm con / thuộc tính riêng |
| --- | --- |
| Manga / Comic | 10 thể loại nội dung, Shounen/Shoujo/Seinen/Josei/Kodomo, bộ truyện |
| Light Novel | 10 thể loại, học đường/dị giới/đời thường/hậu tận thế/siêu nhiên, bộ truyện |
| Văn học | Tiểu thuyết/truyện ngắn/tản văn/thơ/hồi ký, thể loại nội dung |
| Học ngoại ngữ | Anh/Nhật/Hàn/Trung/khác; mục đích, trình độ/chứng chỉ, 7 kỹ năng |
| Giáo khoa / tham khảo | 4 cấp học, lớp 1–12 theo cấp, 10 môn, giáo khoa/bài tập/tham khảo/luyện thi |
| Kinh tế / kinh doanh | Quản trị/marketing/tài chính/khởi nghiệp/kinh tế học; đối tượng sử dụng |
| Tâm lý / kỹ năng sống | Tâm lý/kỹ năng sống; thói quen/giao tiếp/cảm xúc/quan hệ/nghề nghiệp, đối tượng |
| Thiếu nhi | 4 khoảng tuổi, sách tranh/hoạt động/truyện đọc, 4 chủ đề |
| Khoa học / công nghệ | Tự nhiên/công nghệ/vũ trụ/môi trường; nhập môn/phổ thông/chuyên sâu |
| Lịch sử / địa lý | Lịch sử/địa lý; 5 phạm vi, 4 thời kỳ, văn hóa/chính trị/văn minh |
| Sách khác | Các bộ lọc chung, không tạo thuộc tính tùy tiện |

JLPT N5–N1 chỉ hiện khi chọn sách học tiếng Nhật và mục đích Luyện thi;
IELTS/TOEIC, HSK, TOPIK tương ứng Anh, Trung, Hàn. Trình độ thông thường vẫn
có thể dùng. Lớp phụ thuộc cấp học; đại học không có lớp 1–12. “Ngôn ngữ của
sách” là ngôn ngữ ấn bản, khác ngoại ngữ đang học: sách luyện Nhật viết bằng
tiếng Việt là một trường hợp hợp lệ. Tuổi/độc giả/chủ đề là metadata phân loại,
không phải đánh giá, quyền truy cập hoặc cam kết chất lượng.

## Hành vi tìm kiếm

- Bộ lọc chung: q (tên/tác giả/ISBN), hình thức Sale/Exchange/Both, tình trạng,
  giá bán và giá trị đổi tách biệt, ngôn ngữ ấn bản, sắp xếp.
- Chọn nhiều giá trị trong một nhóm là OR; kết hợp các nhóm là AND. Chọn danh
  mục cha bao gồm nhóm con. Bộ truyện khớp tên đầy đủ, NFC/không phân biệt hoa
  thường, không phải substring.
- Apply mới đưa bản nháp lên URL. Mỗi lựa chọn có chip để bỏ, Reset và Back
  giữ semantics; đổi bối cảnh hoặc bỏ mục đích/cấp học sẽ bỏ lựa chọn phụ thuộc
  không còn phù hợp. Query sai có thông báo và nút xóa để khôi phục.
- Lọc trước phân trang, 20 bản/trang, không bịa tổng số kết quả. Cursor gắn
  phạm vi q/filter/sort; hoán đổi thứ tự facet/set không đổi phạm vi, đổi giá
  trị thì cursor bị từ chối. Listing vẫn qua toàn bộ public eligibility cũ.
- Sidebar264px: nhóm có tiêu đề đóng/mở, năm lựa chọn đầu và Xem thêm. Panel
  chỉ sticky khi toàn bộ chiều cao vừa vùng nhìn; panel dài cuộn cùng trang.
  Không khóa chiều cao rồi cắt control hoặc tạo sidebar cuộn kép.
- ≤900px: native dialog có thân cuộn riêng, footer Apply/Reset, Escape/đóng
  trả focus và mở lại giữ bản nháp; page body khóa chỉ khi dialog mở.

## Đăng sách và dữ liệu

Form chọn đầu sách đã xác nhận qua catalog API hoặc đề nghị mới. Đầu sách đã
xác nhận giữ metadata bất biến; không gửi lại một yêu cầu trùng để sửa metadata.
Đề nghị mới chọn danh mục và có thể để trống thuộc tính không biết. Closure
gửi lại đóng băng classification cùng dữ liệu cũ; giữ key/version/retry.
Admin đọc được category chuẩn, series và các thuộc tính bằng nhãn; Admin vẫn
Confirm/Reject revision qua workflow cũ. Bộ vocabulary được quản lý bằng source
versioned và migration, **chưa có màn CRUD danh mục/giá trị dành cho Admin**.

[ADR0033](../adr/0033-catalog-contextual-classification.md) mô tả quyết định.
OpenAPI0.31.0/114 operation và generated types đã đồng bộ. Route taxonomy mới
public/read-only; optional metadata giúp RN/client cũ tiếp tục gửi request cũ.
Migration0016 bổ sung schema/index; không sửa migration cũ, không backfill hay
sửa revision đã xác nhận. API validation và commit-time check kiểm bối cảnh.

Dữ liệu cũ thiếu categoryId/attributes vẫn đọc được. Nhãn cũ có ánh xạ biết
trước tham gia lọc danh mục; nhãn không biết không tự đoán. Lọc thuộc tính cụ
thể không bao gồm đầu sách thiếu thuộc tính đó. Khi cần phân loại dữ liệu cũ,
phải dùng workflow quản lý revision được duyệt, không cập nhật trực tiếp DB.

## Preview và bằng chứng

Bộ preview97 ấn bản: 91 cũ + 3 học ngoại ngữ + 3 giáo khoa/tham khảo có nguồn
Open Library. Giá, tình trạng và thuộc tính enrichment là mẫu được ghi rõ,
không nhập vào DB thật. Script refresh giữ classification đã biên tập; chưa
chạy lại toàn bộ refresh remote trong gói này. Không tái dùng bìa hero cho kệ.

Checks đã chạy trên source feature:

| Kiểm tra | Kết quả / giới hạn |
| --- | --- |
| API unit | 119/119 PASS |
| Web unit / Admin unit | 34/34 và15/15 PASS; gồm regression URL facet sai cấu trúc |
| E2E catalog-drafts/listing-review/listing-schema | 105/105 PASS; Mongo QA8.0 replica set riêng, storage fake |
| Mongo schema/runtime | 39 PASS,4 SKIP; fault injection/failover không bật |
| API/Web/Admin build và typecheck | PASS; bundle size warning đã biết |
| RN consumer typecheck | PASS; không thay thế native runtime QA |
| Contract generate/check/routes | PASS,114 operation/21controller |
| Lint | API/Admin sạch; Web0error/5warning cũ ngoài phạm vi |
| Detector Impeccable | Một lượt Search target,0 finding; không phủ mọi file |

CUA:1535×735,1366×768,390×844,320×740,768×384. Thao tác đã kiểm: chọn/bỏ
Manga/Apply/chip/Back, Japanese→English bỏ JLPT, THPT→Tiểu học bỏ lớp10,
mobile Escape/body-lock/focus, giá320px, picker thật/metadata disabled và
form context giáo khoa. Viewport768×384 là kiểm màn thấp, **không là browser
zoom200%**. Browser full submit ảnh không chạy lại: E2E105 và unit closure
kiểm phần mutation; lượt trước đã có bằng chứng form gửi ảnh.

Finish reviewer độc lập kiểm đủ9ảnh và source, yêu cầu sửa hai lỗi: facet URL
không phải mảng làm chip render lỗi, dialog bị unmount làm mất bản nháp khi đóng.
Đã sửa cùng một batch; CUA malformed URL→Clear khôi phục, Escape/Close→reopen
giữ lựa chọn chưa Apply, Apply/Back đồng bộ URL. Web34unit/typecheck/build PASS
sau sửa. Hai ảnh laptop đã chụp lại khi ảnh tải đầy đủ (lượt capture tức thời
ban đầu chưa đủ ảnh); verdict cuối **SHIP cho hai material fixes**, không là
một review mới toàn project. Không chạy detector lần hai.

Finish documenter đã đồng bộ riêng Search trong DESIGN.md, canonical sidecar
và surface brief; kiểm JSON/parity/preservation PASS. Tokens và nội dung các
surface khác giữ nguyên. Drift breakpoint header800px trong prose so với1000px
ở source là có trước, được ghi nhận nhưng không sửa trong gói này.

QA browser disposable DB/users/roles và DB E2E `latlai_catalog_filters_test`
đã dọn; API3048/media3010/Admin5187 đã dừng. Vite5186 giữ preview và proxy đã
trả về API local3000; API local3000 không chạy ở thời điểm bàn giao. Docker
Mongo QA8.0 riêng vẫn sẵn sàng, không ảnh hưởng DB chính. Tài khoản QA đăng xuất.

Ảnh cuối ở `.impeccable/review/web-member/contextual-filters-*.png`.
Migration trên DB chính, Supabase thật, full integration mọi nghiệp vụ, native
runtime, browser zoom200%, bàn phím OS thật và human review: NOT RUN gói này.
READINESS không đổi. Trước dùng classification trên DB chính, chạy migration
theo setup của dự án; không suy từ QA rằng DB chính đã được cập nhật.

## Chỉnh giao diện sau phản hồi của chủ dự án — 11/10

Chủ dự án không chấp nhận hình thức panel ở `2e42f0c`. Nhánh
`codex/search-filter-visual-refinement` chỉnh riêng Search: bỏ khung nền ngoài,
tiêu đề wine, các select nền shelf/viền đáy; hai giá xếp dọc đủ chiều rộng,
ba preset chia đều với khoảng cách và nhãn tối đa rõ, chỉ một focus wrapper.
Áp dụng chiếm cả hàng, Xóa lựa chọn là action gạch chân nhẹ. Nhóm cách24px;
style classification qua wrapper Search nên form Đăng sách giữ nguyên.
Các bộ lọc/query/API/draft/validation giữ hành vi; không đổi DB/contract.

Web34unit/typecheck/build PASS, lint0error5warning cũ; detector Search một lượt
0finding trong gói sửa này. CUA1535×735/1366×768/390×844/320×740: không tràn,
ô1000000 rõ;1000001 từ chối/giá hợp lệ cho Apply; Escape/mở lại giữ Hành động,
Apply đồng bộ URL và trả body scroll. Bảy ảnh `filter-refine-*.png` đã mở kiểm.
Reviewer mới xem ảnh người dùng và source, yêu cầu5materialfixes; verdict cuối
SHIP cho5fix đều resolved. Không là nghiệm thu mới toàn surface/human/native.
Documenter đồng bộ riêng Search trong DESIGN/canonical/surface: JSON/parity/
preservation PASS, giữ tokens và mọi nội dung ngoài Search. docs:check289file/
2045link và diff check PASS.
Backend E2E,DB migration,Supabase,200%/OSkeyboard không chạy lại cho thay đổi UI.
Checkpoint subject `fix(web): refine contextual search filter layout`; local,
chưa push. READINESS không đổi.
