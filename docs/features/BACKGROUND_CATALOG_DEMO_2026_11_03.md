# Dữ liệu nền cho kệ sách — 03/11/2026

Owner yêu cầu khoảng400cuốn từ API công khai, một nửa Manga/Light Novel,
phục vụ giao diện, tìm kiếm và bộ lọc trên ứng dụng local đang dùng. Gói dữ liệu
đã nhập bổ sung; không reset hoặc thay các bài, tài khoản và giao dịch có trước.
Nhánh bàn giao `codex/demo-background-catalog`, base059a777e; không đổi source
ứng dụng, contract, migration, cấu hình hay READINESS.

## Mở và nhận biết dữ liệu

- [Kệ chính](http://localhost:5174/?data=live),
  [Manga](http://localhost:5174/books?data=live&categoryId=manga),
  [Light Novel](http://localhost:5174/books?data=live&categoryId=light-novel).
- Tìm `Naruto` có10cuốn; có100Manga và100Light Novel. Còn200cuốn chia14nhóm:
  văn học20, ngoại ngữ5, thiếu nhi20, kinh doanh20, tâm lý20, khoa học20,
  lịch sử20, tiểu sử15, sức khỏe10, nghệ thuật10, đời sống10, nuôi dạy con10,
  xã hội10 và giáo khoa/tham khảo10. Đây là400ID ấn bản/cover ID khác nhau; nhiều
  tập trong cùng bộ truyện không được hiểu là400tác phẩm độc lập.
- Ba người đăng mẫu có tên `Kệ Manga · DEMO`, `Kệ Light Novel · DEMO`,
  `Kệ sách · DEMO`; tách khỏi tài khoản demo dùng để thao tác trực tiếp.
- Mỗi bài ghi rõ dữ liệu mẫu, link ấn bản nguồn, ảnh bìa thư viện và các trường
  giá/tình trạng mô phỏng. Không cấu hình nơi gửi cho các bài nền; không dùng
  chúng để trình diễn mua/giao hàng. Khi cần giao dịch, dùng bài thật của nhóm.

## Vị trí của bài đăng thật

Home gọi `sort=newest`; API xếp theo `publishedAt` giảm dần. Toàn bộ bài nền có
mốc công bố cũ hơn các bài hiện có, vì vậy không đẩy bài thật xuống dưới chúng.
Tại kiểm tra cuối,401bài public gồm400mẫu và1bài thật; bài thật đứng đầu.

Bài thật được duyệt sau đó sẽ đứng trước bộ nền nếu còn đủ điều kiện public.
Đây là thứ tự thời gian, không phải ghim: bài khác được duyệt sau có thể đứng
trước. Bộ lọc có thể loại bài thật khỏi kết quả. Bài đang giao dịch vẫn có thể
hiện kệ với trạng thái tương ứng; không được diễn giải thành còn mua được.

## Nguồn và giới hạn

Metadata lấy từ [Open Library Search API](https://openlibrary.org/dev/docs/api/search),
bìa theo cover ID của ấn bản qua [Covers API](https://openlibrary.org/dev/docs/api/covers).
Query và ảnh được cache, giữ nhịp yêu cầu thấp; không gọi lại upstream mỗi lần
mở trang. Quyền ảnh thuộc chủ sở hữu; không gán giấy phép CC cho ảnh bìa.
Không sao chép mô tả dài hoặc dùng ảnh bìa thành bằng chứng ảnh chụp hiện vật.

Rà danh sách đã thay26ứng viên lệch nhóm, sách hướng dẫn/fanbook lẫn vào manga,
bộ nhiều cuốn hoặc CD-ROM trước import. Một số ảnh trả502 ở lượt thu thập đầu;
chỉ400ảnh cuối đã decode và round-trip thành công mới được nhập.
Phân loại là biên tập cho demo, không là nghiệm thu metadata từng ấn bản.

Giá, tình trạng và hình thức bán/đổi là mẫu cho filter, không phải giá khảo sát.
Không nhập `price_references`/`online_price_offers`, không dùng bộ này để làm
AI định giá đạt gate hoặc coi ảnh thư viện là corpus điện thoại đã nghiệm thu.

Trạng thái Confirmed/Approved là fixture nhập mẫu, có actor nhập riêng mang
nhãn demo và bị LOCKED, cùng audit `DemoBackgroundImport`. Checklist và thời
điểm trong fixture không là thao tác/khẳng định kiểm hiện vật hay sở hữu của
người thật. Không mượn danh Admin đang dùng và không bật AI duyệt bài.
Gói này không chứng minh luồng đăng/duyệt trả phí, quota hoặc fulfillment E2E.

## Bằng chứng thực chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Chuẩn bị trên QA Mongo riêng | PASS: validator/index unique lấy từ runtime thực;400checkCatalog,400checkListing;400bài đủ publicEligible |
| Ảnh thực | PASS:400ảnh decode, xử lý bằng processImage, upload input/WebP và đọc lại đối chiếu hash trên private storage hiện có |
| Nhập DB local chính | PASS: snapshot backup riêng trước ghi; một transaction thêm dữ liệu, không migrate/reset hoặc sửa bản ghi cũ |
| Bảo toàn | PASS: fingerprints bản ghi nghiệp vụ cũ không đổi, ledger reconcile trước/sau giống hệt và balanced; User1/User2/User3 giữ nguyên |
| API thực | PASS:9trang lấy đủ401ID không trùng;100Manga,100Light Novel; tìm Naruto và lọc bộ Naruto đều10; từ khóa vô nghĩa0; mua/đổi,giá≤100k,LikeNew và genre action đúng tiêu chí |
| Ảnh qua API public | PASS:12bài detail/signed read/WebP;400object đã kiểm storage riêng ở bước trước |
| Browser thực | Home hiện bài thật trước mẫu, bìa đã tải; trang lọc Manga và tìm Naruto10kết quả hiển thị dữ liệu thật từ API. Không là native PASS |
| Dọn tài nguyên tạm | QA database đã drop đúng namespace `_test`; dừng container QA do gói này bật.24media staging bị thay được xóa sau khi kiểm không có reference DB;400media đang dùng và ảnh cũ giữ nguyên |
| Native/human acceptance/provider AI/CI | NOT RUN; không đóng readiness, không push/merge |

Plan, nguồn từng ảnh/edition/hash, proof QA, snapshot backup, đối chiếu trước/sau
và kết quả API lưu riêng trong `.tmp/background-catalog-400/`, không đưa DB,
credentials hay ảnh bìa vào Git. Không chạy lại script để reset dữ liệu đã dùng.
Muốn tái tạo trên máy khác phải chuẩn bị nguồn/storage và đích riêng có kiểm soát;
commit tài liệu này không tự cung cấp400listing cho clone khác.
