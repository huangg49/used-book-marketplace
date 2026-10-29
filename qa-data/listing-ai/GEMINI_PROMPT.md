# Nhiệm vụ cho Gemini/Antigravity: chuẩn bị dữ liệu AI Lật lại

Bạn là người thực hiện gói dữ liệu để Codex kiểm và đưa vào QA của dự án nhóm
Lật lại. Hãy **thu thập và lưu dữ liệu thật có nguồn**, không chỉ viết kế hoạch,
trả danh sách link hoặc làm 2–3 mẫu rồi tuyên bố hoàn tất. Không được tự công bố
nghiệm thu sản phẩm. Tôi không có sẵn ảnh chụp điện thoại để cung cấp cho bạn.

## 1. Workspace và phạm vi ghi

Repository:

```text
C:\Users\DESKTOP\Documents\WDP391\used-book-marketplace
```

Folder đầu ra duy nhất đã được chuẩn bị:

```text
C:\Users\DESKTOP\Documents\WDP391\used-book-marketplace\qa-data\listing-ai\incoming
```

Đọc AGENTS.md, docs/handoff/SESSION_STATE.md, docs/handoff/READINESS.md và
docs/AI_WORKFLOW.md trước. Kiểm git status/branch/log/remote ở chế độ đọc và giữ
nguyên local work. Không switch branch, pull, reset, clean, commit, push hay sửa
file ngoài incoming. Nếu incoming đã có dữ liệu, kiểm tra và tiếp tục; không xóa
hoặc ghi đè bằng file rỗng. Giữ nguyên incoming/README.md và .gitignore.

Bạn được tìm kiếm web, đọc trang công khai và tải ảnh bìa được phép truy cập
để chuẩn bị đánh giá local. Không cần hỏi lại các dữ kiện có thể đọc từ repo/web.
Không đọc/in/sao chép .env, credential, token hoặc dữ liệu cá nhân. Không chạy app,
Docker, DB, seed, migration, importer, gọi AI trả phí hay sửa GHN/carrier/Driver.
Không cài thêm thư viện lớn hay thay cấu hình máy chỉ để chuẩn bị dataset.

Đọc đúng phần liên quan, không đoán schema:

- qa-data/listing-ai/README.md và các file templates/*.json.
- docs/adr/0028-listing-price-assistant.md, 0029-online-price-lookup.md,
  0048-listing-photo-autofill.md và 0054-cross-client-listing-ai.md.
- apps/api/eval/autofill-assist/README.md, run.ts, quality.ts.
- apps/api/src/modules/autofill-assist/autofill-check.ts: chuẩn hóa/checksum.
- apps/api/src/modules/price-assist/evidence.ts và apps/api/src/price-refs-import.ts:
  ý nghĩa nguồn giá và giới hạn importer. **Chỉ đọc, không chạy importer**, cả dry
  run cũng cần kết nối DB. Không sửa schema/code để khiến dữ liệu của bạn đi qua.

## 2. Mục tiêu cụ thể

Chuẩn bị **25 cuốn/ấn bản khác nhau**, chủ yếu sách lưu hành ở Việt Nam. Cố gắng
có ít nhất 20 cuốn kèm ảnh bìa đọc được và metadata xác minh được từ nguồn công
khai. Đây là mục tiêu thu thập, không phải lý do để bịa khi thiếu nguồn.

- Ít nhất 18 cuốn tiếng Việt; phần còn lại có thể tiếng Anh/ngôn ngữ khác.
- Có văn học Việt, dịch, thiếu nhi/truyện tranh và sách kiến thức/kỹ năng.
- Có sách nhiều tác giả, người dịch dễ nhầm tác giả, tên có dấu, tập/bộ, lần
  xuất bản hoặc tái bản dễ nhầm. Ít nhất 2 cặp cùng tên nhưng khác ấn bản/tập;
  mỗi ấn bản có bookKey riêng, có bằng chứng phân biệt.
- Giá: cố gắng ít nhất 15 cuốn có 2 quan sát từ **nguồn độc lập**, đúng ấn bản.
  Có cả giá bìa và giá bán mới nếu tìm được, ghi đúng loại. Không mua dữ liệu.
- Giữ trường hợp chưa đủ nguồn/không xác minh được làm hàng partial/blocked có
  lý do, không lấp bằng số trung bình hay giá do bạn/model nghĩ ra.

Không đặt độ khó cho ảnh bằng cách giả cảnh chụp rồi gọi là ảnh thật. Mục tiêu
này là **catalog/cover-scan để demo và kiểm sơ bộ**, chưa phải corpus real-camera.

## 3. Nguồn và cách kiểm tra

Ưu tiên trang nhà xuất bản/đơn vị phát hành, rồi nhà sách có trang sản phẩm
chỉ rõ ISBN/ấn bản. Mở trang thực tế để kiểm, không lấy snippet tìm kiếm hoặc
trí nhớ model làm bằng chứng duy nhất. URL phải là trang sản phẩm cụ thể.

Với mỗi nguồn ghi ID, URL, đơn vị, thời điểm truy cập ISO8601, loại nguồn,
nhóm độc lập và facts/đoạn hoặc vị trí ngắn giúp người khác kiểm lại. Không copy
toàn văn sách hoặc cả trang. Không vượt đăng nhập/paywall/CAPTCHA, xóa watermark
hoặc truy cập nguồn riêng tư. Nếu bị chặn, ghi blocked và tìm nguồn khác.

- ISBN kiểm checksum và khớp đúng cuốn/ấn bản. Không sửa chữ số để hợp checksum.
- Nhà phát hành không mặc nhiên là NXB. Người dịch/biên soạn không tự gộp vào
  authors. Không ghép metadata nhiều ấn bản để tạo một bản ghi trông đầy đủ.
- Không rõ năm/lần in/NXB/ISBN thì null/unknown cùng lý do, không suy từ cuốn
  khác. ISBN null không tự chứng minh sách không có ISBN: ghi isbnStatus riêng
  `observed | not-present | unknown` và dẫn nguồn chứng minh.
- Nguồn cùng chủ sở hữu/bản sao cùng feed phải cùng independenceGroup. Nhiều URL
  không tự thành nhiều nguồn độc lập.
- Ngày thu thập là ngày truy cập thật, không đặt sẵn ngày từ prompt hoặc lấy
  ngày xuất bản làm ngày quan sát giá.
- Mỗi metadata có fieldEvidence dạng
  `{ "title": { "sourceIds": ["src-001"], "locator": "tên trên bìa/trang sản phẩm" } }`.
  Làm tương tự cho các trường đã điền; không đặt sourceId không tồn tại.

## 4. Ảnh và ground truth đọc ảnh

Tải ảnh gốc công khai đủ đọc vào `autofill/cover-scan/images/<bookKey>/` nếu
được phép truy cập/sử dụng cho đánh giá local; ghi nguồn và quyền dùng thực tế.
Không gán Creative Commons/public-domain khi nguồn không nói vậy. Nếu quyền
không rõ thì ghi unknown; nếu không thể dùng ảnh, giữ URL và báo thiếu ảnh,
không nói đã có file. Không đưa ảnh chưa duyệt lên Git/dịch vụ công khai.

Xác minh bytes thực sự là JPEG/PNG/WebP, không lưu HTML/trang lỗi với đuôi jpg.
Ghi kích thước, dung lượng và SHA-256 tính từ file; không tự bịa checksum. Không
upscale để che ảnh mờ; không tạo lại ảnh bằng AI, thêm chữ/ISBN hoặc ghép ảnh các
ấn bản. Nếu có tạo bản xử lý phục vụ xem, giữ bản gốc và ghi rõ phép biến đổi.

Trong `autofill/cover-scan/cases.json`, dùng format eval thật:

```json
{
  "source": "cover-scan",
  "cases": [{
    "id": "stable-case-id",
    "bookKey": "stable-edition-key",
    "reviewed": false,
    "photos": ["images/stable-edition-key/front.jpg"],
    "expected": {"title": "chữ đọc được trên ảnh", "authors": [], "isbn": null}
  }]
}
```

Đường dẫn photos tương đối với file cases.json. Mỗi case có 1–3 ảnh cùng cuốn.
Một cuốn không được chia nhiều case để đạt đủ số lượng.

**Catalog facts và đáp án đọc ảnh là hai thứ khác nhau:**

- Expected chỉ là thông tin nhìn thấy trên bộ ảnh của case. ISBN có ở trang web
  nhưng không thấy trên ảnh thì expected.isbn=null; không yêu cầu model đoán nó.
- Chữ tiêu đề/tác giả phải được bạn trực tiếp đọc từ ảnh, giữ đúng dấu/tập và
  không tự “sửa” bằng tên quen thuộc. Không gán tên người dịch làm tác giả.
- publisher/publicationYear/edition/language thêm vào expected khi đã xác minh
  được từ ảnh; thiếu căn cứ thì bỏ trường. null nghĩa đã kiểm và trường không
  xuất hiện, bỏ trường nghĩa chưa chấm. Title chưa đọc được thì case blocked,
  không coi là đáp án hoàn chỉnh.
- `reviewed` luôn false nếu chỉ do agent kiểm. Ghi phương pháp source-read-by-agent
  ở manifest; humanReviewed=false, reviewedBy/reviewedAt=null. Không ký thay người
  thật, không dùng chính output của tính năng AI làm đáp án.

Tạo `autofill/real-camera/cases.json` với source=real-camera và cases=[] nếu
không có ảnh chụp điện thoại thật. Ghi NOT_RUN trong bàn giao; không đưa scan,
ảnh screenshot, ảnh thêm nhiễu/phối cảnh hoặc ảnh AI vào lane này. Không tự đóng
gate ADR0048: cần ít nhất 20 cuốn điện thoại thật và người kiểm đáp án.

## 5. Giá: không trộn loại, không dựng thị trường

Ghi từng lần quan sát theo templates/price-observations.example.json:

- OnlineRetail: giá bán mới niêm yết tại nhà sách, chưa là giá bán sách cũ.
- CoverPrice: giá bìa chỉ khi trang/ảnh nói rõ giá bìa/giá niêm yết gốc.
- Không tạo EditorialReference vì bạn vừa tìm được URL; loại đó cần người nhóm
  biên tập kiểm/chấp nhận. Không tạo CompletedSale từ giá rao/giá sách mới.
- Ghi số nguyên VND, loại giá, ngày quan sát, link bằng sourceId, trạng thái còn
  hàng và bằng chứng đúng ISBN/ấn bản. Giá khuyến mại/voucher/thành viên/phí ship
  phải ghi riêng điều kiện, không tự biến thành giá tiêu chuẩn.
- Cùng trang có giá bìa và giá giảm là hai quan sát cùng nhóm nguồn, không độc lập.
- Không tự đưa khoảng giá sách cũ “chuẩn”, không dùng giá cùng thể loại, không
  tạo giao dịch đã bán hoặc nhập số giả để tính năng hiển thị Suggested/Strong.
- Quan sát khác ấn bản/không rõ/out-of-stock vẫn lưu với status/editionMatch/
  availability rõ để Codex kiểm quy tắc loại nguồn, không trộn vào tập ready.

Tạo `prices/import-candidates.json` là mảng ứng viên **chờ người kiểm**. Có thể []
nếu chưa có CoverPrice rõ nguồn. Nếu có ứng viên, mỗi phần tử gồm bookKey,
approvalStatus=PendingHumanReview và importEntry có các trường importer:
isbn (không bịa UUID bookId), kind=CoverPrice, amount, condition=null,
sourceLabel, sourceUrl=https, observedAt=YYYY-MM-DD, enteredBy=Gemini-candidate,
rightsNote trung thực. Chưa map catalog DB, không chạy import. OnlineRetail không
được ép thành kind importer hỗ trợ. Không sửa file eval cases hiện có trong repo.

## 6. Cấu trúc bàn giao bắt buộc

```text
incoming/
  catalog/books.json
  prices/observations.json
  prices/import-candidates.json
  provenance/sources.json
  autofill/cover-scan/cases.json
  autofill/cover-scan/images/<bookKey>/...
  autofill/real-camera/cases.json
  validation/report.json
  HANDOFF.md
```

Theo cấu trúc template, có thể thêm trường ghi bằng chứng nhưng không đổi ý nghĩa.
File JSON là JSON thật UTF-8, không comment, không markdown fence, không NaN.
Tất cả bookKey/sourceId/id duy nhất và tham chiếu khớp. Mỗi dòng partial/blocked
ghi issues; không để placeholder hoặc tên QA giả trong dòng được gọi là ready.
`ready` chỉ nghĩa đủ file/nguồn để Codex kiểm tiếp, không là đã được người thật
duyệt hoặc được phép import. Mọi humanReviewed/reviewed vẫn theo quy tắc ở trên.

HANDOFF.md phải có:

1. Giờ bắt đầu/kết thúc, git HEAD đã đọc, phạm vi chỉ ghi incoming.
2. Số cuốn/ấn bản độc lập, số ready/partial/blocked, số có ảnh local, số ISBN đã
   xác minh, số cuốn có ≥2 nguồn giá độc lập; số nguồn lỗi và không rõ quyền.
3. Bảng từng cuốn: bookKey, tên/ấn bản/ISBN, file ảnh, nguồn metadata, nguồn giá,
   trạng thái và phần còn thiếu. Không chỉ đưa một tổng số đẹp.
4. Khác biệt giữa dữ liệu cover-scan và real-camera; human review/real-camera là
   NOT_RUN khi chưa có. Không tuyên bố native/AI chất lượng/READINESS PASS.
5. Các xung đột metadata/giá, việc bị chặn và cách Codex có thể kiểm lại.
6. Danh sách file đã tạo/thay đổi và đúng lệnh kiểm thực chạy, exit code.

## 7. Tự kiểm trước khi dừng

Dùng công cụ local sẵn có, không chỉ tự viết “đã kiểm”. Có thể tạo script kiểm
trong incoming/validation và chạy nó, không sửa source app. Kiểm tối thiểu:

- Parse tất cả JSON; đếm thật từ file, không chép tổng số bằng tay.
- ID/tham chiếu/đường dẫn không trỏ thiếu hoặc ra ngoài incoming; ảnh không phải
  HTML, hash/kích thước khớp file; paths expected khớp vị trí cases.json.
- Trùng cuốn/ISBN/ảnh/nguồn: rà hash và ID; ảnh giống nhau ở nhiều ấn bản phải
  báo xung đột, không âm thầm tính nhiều cuốn. ISBN checksum đúng vẫn cần khớp
  cuốn, checksum không chứng minh metadata đúng.
- Số tiền/ngày/loại nguồn/edition được ghi đúng. Không có expected suy từ web
  cho chữ không xuất hiện trên ảnh. Kiểm lại ảnh thực tế, không chỉ tên file.
- Tất cả reviewed/humanReviewed còn false nếu không có người thật ký.
- Ghi validation/report.json: mỗi check PASS/FAIL/NOT_RUN/BLOCKED, số đếm tính
  được, lỗi cụ thể và giới hạn. PASS định dạng không là PASS độ đúng nội dung.
- Kiểm git status lần cuối: không thay file ngoài incoming, không stage/commit.
  Dữ liệu incoming bị ignore là chủ ý, không dùng git add -f.

Làm theo từng lô khoảng 5 cuốn, lưu tiến độ để có thể tiếp tục nếu ngắt. Nếu chưa
đủ mục tiêu, tiếp tục tìm nguồn khác trong phạm vi. Nếu thật sự bị chặn, bàn giao
PARTIAL kèm số thiếu và bằng chứng; không bịa để đạt 25 hoặc hỏi người dùng những
dữ kiện bạn có thể tự tra. Không chạy eval live/AI trả phí để tự chấm sản phẩm.

Phản hồi cuối bằng tiếng Việt, ngắn gọn: đường dẫn tuyệt đối HANDOFF.md, số liệu
thực tế, phần nào dùng được/chờ kiểm, phần còn thiếu. Việc chính là các file thật
đã lưu đúng folder, không phải lời hứa sẽ làm sau.
