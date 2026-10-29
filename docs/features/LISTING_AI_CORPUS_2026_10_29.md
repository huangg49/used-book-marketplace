# Kiểm AI bằng bìa sách thật — 29/10/2026

Owner duyệt kiểm model và hành trình đăng bán. Nhánh
`codex/listing-ai-real-corpus-qa`, base `2412523`; gói chỉ thay bộ eval/QA và tài
liệu. Không thay prompt/model đang phục vụ, API0.61, migration hoặc UI sản phẩm.

**Kết luận: luồng phục hồi hoạt động trong browser QA; chất lượng đọc tên hiện
chưa đủ tin cậy để tự điền.** Không có bằng chứng đóng ADR0048 hoặc READINESS.
Kết quả dưới đây dùng đáp án chưa được người thật duyệt, chỉ là số đo tạm thời.

## Model ảnh: nhanh nhưng còn sai chữ và nhầm bố cục

[Evidence tổng hợp](listing-ai-corpus-2026-10-29/evidence.json),
[24 kết quả ban đầu](../../apps/api/eval/autofill-assist/results/cover-scan/2026-10-29T05-17-26-738Z.json),
[24 kết quả thử prompt](../../apps/api/eval/autofill-assist/results/cover-scan/2026-10-29T05-19-18-161Z.json).
NVIDIA `nvidia/nemotron-3.5-super-vl-120b-a12b`; ảnh đi qua cùng derivative và
shrink của upload. Chỉ có bìa trước, không có trang bản quyền hay ảnh điện thoại.
24case active/24hash khác nhau; bản Nhà giả kim95k vẫn cách ly, không chạy.

| Chỉ số | Prompt đang dùng | Prompt thử bố cục |
| --- | ---: | ---: |
| Tên đúng cả dấu, bỏ khác biệt hoa/thường/dấu câu | 13/24 (54,2%) | 13/24 (54,2%) |
| Tên đúng khi bỏ dấu — chỉ số phụ | 17/24 | 17/24 |
| Tìm đủ tác giả | 18/24 | 18/24 |
| ISBN sai lọt qua output check | 0 | 0 |
| Lỗi provider / ca bỏ qua | 0 / 0 | 0 / 0 |
| Chi phí dự toán USD | 0,034249 | 0,039821 |

Lượt đầu p50=1.424ms, p95=2.254ms trong24mẫu, bao gồm xử lý ảnh local và model;
không gồm upload, catalog lookup, HTTP/UI. Lượt thử đã chuẩn bị ảnh trước khi đo
provider nên không so tốc độ trực tiếp hai lượt. Không suy SLA hoặc tốc độ mọi
lần demo từ mẫu nhỏ này.

Finding quan sát được: Dế→Đế/Đề, cả→cá, Tắt→Tất; hai Mắt biếc lấy tên người làm
tên sách hoặc ghép vào tên; Số đỏ trả tên tác giả vào title và nhãn tủ sách vào
publisher; Kính vạn hoa/Doraemon bỏ phần nhận diện tập; nhiều tác giả trên bìa nhỏ
bị bỏ sót. Giữ nguyên đáp án và cả kết quả sai để truy vết. Không dùng catalog
hoặc kiến thức ngoài để âm thầm sửa output thành tên mong đợi.

[Prompt thử](listing-ai-corpus-2026-10-29/rejected-layout-prompt.txt) nhắc phân
biệt bố cục/tác giả, số tập, vai trò người viết và logo NXB. Không cải thiện tổng
điểm nên **không áp vào sản phẩm**. Đây là thử nghiệm trên cùng corpus, không có
holdout độc lập và chưa chứng minh khả năng tổng quát. Không thêm lượt gọi dự
phòng hoặc hạ tầng mới để che điểm thấp.

Mọi expected ISBN trong24ảnh đều null: 0ISBN sai chỉ đo không bịa số khi ảnh
không có ISBN, chưa đo đọc ISBN có mặt. NXB/năm/ấn bản/ngôn ngữ không có đáp án
trong case nên NOT_SCORED; lỗi NXB ở trên là finding quan sát, không phải tỷ lệ
đã nghiệm thu. `reviewed=false` được giữ nguyên; ảnh scan không thành real-camera.

## Giá: giữ đúng nguồn và mức bằng chứng

[Kết quả giá](listing-ai-corpus-2026-10-29/prices-live.json) dùng validator trước
khi map dữ liệu, không kết nối DB/import. Chỉ nhận quan sát ready + exact +
in-stock; giữ kind OnlineRetail, nhóm nguồn độc lập, ngày và ISBN được ghi nhận.
Không lấy likely/out-of-stock/blocked để làm đầy nguồn, không đổi thành CoverPrice.
Tình trạng Good/đủ trang là **giả định QA**, không phải kiểm định bản sách.

- 25raw:1quarantine;23Proceed với mức Limited;1NeedsMoreData (Nhà giả kim79k).
  Tất cả chỉ có retail, không có CompletedSale/EditorialReference nên không
  trường hợp nào được nâng thành Strong. Mục tiêu nguồn độc lập vẫn11/15.
- Chỉ3case Proceed đầu tiên gọi NVIDIA thật;3/3qua output check về bounds/ref,
  dự toán0,001909USD. Đây là kiểm ràng buộc output, không phải3giá sách cũ đúng.
- Không có khoảng giá do người thật đánh giá hoặc giao dịch hoàn tất làm đáp
  án: **độ chính xác định giá NOT_SCORED**. Không seed giá vào DB chính để demo.

Tổng51call mới (48ảnh +3giá), dự toán **0,075979USD** theo rate trong source,
không phải hóa đơn NVIDIA hoặc trần chi phí cứng. Không gọi provider thêm trong
browser; timeout/lỗi ở browser được tiêm có chủ đích.

## Hành trình và kiểm tra đã chạy

[Browser evidence](listing-ai-corpus-2026-10-29/journey.json): Chromium, Member
web từ entry đăng sách; RN web từ Tài khoản→Kệ sách→đăng sách. Dùng bìa Không gia
đình và phát lại output đã ghi từ lượt model thật; API/Mongo/Sharp thật, kho ảnh
giả và giá QA tổng hợp. Bìa được mã hóa PNG cho MIME của fixture, không sửa nội
dung. Giá40000/60000 trong browser là fixture, không phải giá đo từ corpus.

| Phạm vi | Kết quả / giới hạn |
| --- | --- |
| Web | PASS: mất ACK ảnh/giá giữ key/body; một call; xác nhận trước thay trường/giá; đổi tình trạng làm stale; cùng1nháp gửi thành PendingReview, applied40000 |
| RN web | PASS: entry thật, upload/Sharp, chọn catalog, ảnh còn ở bước tiếp; mất503 phải replay trước intent mới; mất ACK giá giữ giá125000 |
| Chậm / thiếu nguồn | PASS: giá chậm1,5giây khóa nút gửi trùng, giữ input; bỏ nguồn trong DB QA và đổi input để tránh cache → không gọi AI, vẫn giữ giá tự nhập |
| Responsive | 1440/768/390/320web,390/320RNweb không overflow trang; xem ảnh kiểm tra cuối. Không đổi brand/component/motion |
| Unit eval | 3PASS: dấu/metadata/ISBN, đủ tác giả và tác giả thừa, chặn nghiệm thu giả/partial/lặp cuốn |
| Data + CLI | 41PASS,0skip:29validator +12CLI/preflight. AI thật bị tắt; HTTP giả kiểm budget; chặn sai option/ID/path/ảnh/đáp án trước gọi trả phí |
| Static checks | API typecheck, lint eval, docs/link và diff checks PASS |
| Native / human / storage thật | NOT_RUN; RN web không thay Android/iOS. Không mở lại Metro native hoặc lấy kết quả cũ làm evidence mới |

Eval bổ sung chấm tác giả thừa, hash prompt/case/ảnh, kiểm toàn bộ ảnh trước gọi,
không cho option thiếu giá trị vô tình chạy cả bộ, ghi usage khi provider trả lỗi,
không gọi fallback sau khi chạm ngân sách dự toán; exit1 khi failed/budget-skip.
Các giới hạn nguồn/cost/human vẫn hiện trong report, không tự chuyển thành PASS.

## Chạy lại và bước tiếp

```sh
pnpm data:listing-ai:check
pnpm data:listing-ai:test
# API build hiện hành; chỉ đọc file/rule, không DB hoặc provider:
node qa-data/listing-ai/evaluate-prices.mjs
# Chỉ khi có quyền gọi trả phí; tối đa3call, dự toán0,02USD:
node qa-data/listing-ai/evaluate-prices.mjs --live
# Từ apps/api, đọc cấu hình server ignored:
pnpm eval:autofill --dir ../../qa-data/listing-ai/incoming/autofill/cover-scan --max-usd 0.10
```

`--system-file <file>` thử prompt riêng mà không sửa prompt phục vụ; chỉ đưa
prompt vào file đó, không env/secret. Raw ảnh còn local/ignored, quyền ảnh chưa
duyệt. Browser QA theo START_HERE, QA replica set57017/rs-test và database *_test;
set `LISTING_AI_CORPUS_RESULT` tới JSON24case đã ghi, rồi chạy
`node scripts/test-listing-ai-journey.mjs`. Không set biến này thì dùng fixture
tổng hợp cũ. Bỏ biến sau chạy, dừng QA và giữ Mongo chính dừng.

Ưu tiên tiếp: review độc lập đáp án/khả năng nhận diện đúng tập và20–30ảnh điện
thoại có ISBN đọc rõ; so model/pipeline trên tập giữ riêng trước đổi cấu hình.
Tiếp tục giữ người bán xác nhận từng trường, chọn catalog hoặc nhập tay; không
demo như OCR đã chính xác. Gói hiện tại không chứng minh native, human acceptance,
live storage hoặc định giá thị trường. READINESS không đổi; chỉ commit local,
chưa push/PR/merge/deploy.
