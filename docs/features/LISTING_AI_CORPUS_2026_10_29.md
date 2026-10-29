# Kiểm AI bằng bìa sách thật — 29/10/2026

## Lượt mới nhất: xác minh endpoint — 29/10, 16:04–16:06 VN

Nhánh `codex/listing-ai-endpoint-verification`, basec59d8cf. Owner giao bước
xác minh endpoint trước mở đối chứng. [Plan4call](../../qa-data/listing-ai/endpoint-probe-plan.json)
chốt tại3ee7bda trước network; [evidence](listing-ai-corpus-2026-10-29/endpoint-verification.json).
Kết quả **BLOCKED_CANDIDATE**: chưa có model mới đủ khả dụng trong cấu hình thử.
Gói chẩn đoán đã xong; giữ nguyên model, env và prompt sản phẩm.

Đối chiếu [API chính thức Gemma4](https://docs.api.nvidia.com/nim/reference/google-gemma-4-31b-it-infer)
xác nhận `POST https://integrate.api.nvidia.com/v1/chat/completions` đúng đường
dẫn. [Model card](https://build.nvidia.com/google/gemma-4-31b-it/modelcard) khuyến
nghị đặt ảnh trước chữ; lượt này thử riêng cách gọi đó, không đổi ảnh hoặc đáp
án. Không đoán route khác để gửi key. Gemma3 đã404 ở lượt trước nên không gọi lại.

| Chẩn đoán đã chốt | Kết quả quan sát |
| --- | --- |
| Gemma4, chỉ text, tối đa64token | Timeout15.018ms, chưa nhận HTTP headers |
| Gemma4, ảnh trước chữ, chỉ yêu cầu title, tối đa256token | Timeout25.008ms, chưa nhận HTTP headers |
| Gemma4, ảnh trước chữ, toàn bộ chỉ dẫn ở một user turn, tối đa1200token | Timeout25.011ms, chưa nhận HTTP headers |
| Nemotron, cách gọi sản phẩm hiện tại, cùng ảnh/key/origin, tối đa1200token | HTTP200; headers2128ms, hoàn tất2130ms; trả đủ cấu trúc nhưng vẫn đọc “Đế” thay “Dế” |

Cùng temperature0,2, thinking=false, không retry/fallback. Chỉ dùng1bìa Dế Mèn
đã lộ trong bộ phát triển; **0call trên12case đối chứng**. Phần có usage dự toán
0,001711USD;3timeout không có usage nên **chưa biết tổng phí**. Abort ở client
không chứng minh provider đã hủy xử lý hoặc không tính phí. 4call/0,05USD dự toán
là giới hạn chẩn đoán, không phải trần hóa đơn.

Suy luận có giới hạn: timeout cả text tối giản không ủng hộ việc quy lỗi riêng
cho ảnh/phần thu nhỏ hoặc system role. Nemotron thành công giúp loại trừ tình
huống toàn bộ đường mạng/key chung đều không dùng được tại thời điểm thử; chưa
loại trừ quyền theo model, hàng đợi, route/capacity phía provider. Chưa nhận
headers của Gemma4 nên không thấy HTTP202 để poll; không tự POST lại. **Nguyên
nhân phía provider chưa xác minh**, chưa có output để chấm chất lượng Gemma4.

Đã thêm [runner chẩn đoán](../../apps/api/eval/autofill-assist/probe-endpoints.ts)
và [helper](../../apps/api/eval/autofill-assist/endpoint-probe.ts): allowlist đúng
origin/model, không theo redirect, lưu hash thay request/key/ảnh, khóa journal,
ghi Pending trước call, atomic save và chặn replay bất định. Kết quả tách HTTP,
headers/time, usage biết/chưa biết và lỗi output; lỗi không biến thành PASS.
Parser hỗ trợ channel envelope chỉ ở diagnostic helper, **production parser giữ
nguyên** vì chưa có bằng chứng response thực tế cần đổi.

```sh
# Từ apps/api; chỉ đọc journal, không cần key/ảnh và không gọi provider:
pnpm eval:endpoints --report
# Khi đã được phép gọi AI: tối đa4call theo plan và dùng lại journal hiện có:
pnpm eval:endpoints --live
```

`--report` và resume `--live` hiện exit1 đúng với BLOCKED_CANDIDATE; resume giữ
journal y hệt,0call mới. `--report` thiếu journal báo lỗi, không tự gọi AI. Không
xóa journal để chạy lặp trả phí. Lần chạy đầu trước bổ sung exit status đã ghi
đủ dữ liệu; exit0 lịch sử của lệnh đầu không là endpoint PASS.

PASS28unit (13endpoint+12comparison+3quality), API typecheck/lint eval, docs/diff.
Không cần chạy lại UI/DB vì source sản phẩm không đổi; không thao tác DB/GHN/
import/migration/contract hoặc remote integration. Kiểm cuối Docker daemon không
truy cập được, nên chưa đọc lại trạng thái container (mốc trước stopped); không
khởi động Docker và không có listener QA của gói. Human/real-camera/
ISBN có mặt và READINESS giữ trạng thái cũ. Bước mở so sánh tiếp cần **bằng
chứng endpoint ứng viên trả được phản hồi đầy đủ trong hạn chờ**, rồi mới chốt
vòng phát triển mới; chưa đủ điều kiện dùng12case đối chứng. Không kéo dài
timeout/đổi provider hoặc chạy lặp benchmark chỉ để nhận một kết quả thành công.

## Lượt tiếp: rà đáp án và sàng lọc model

Nhánh `codex/listing-ai-model-comparison`, base12f108d. Chốt
[plan/case/gate](../../qa-data/listing-ai/comparison-plan.json) tại commit79e21b3
**trước** các lượt gọi model mới; [evidence](listing-ai-corpus-2026-10-29/model-comparison.json).
Kết luận hiện tại: **BLOCKED_PROVIDER_COMPATIBILITY**, chưa có ứng viên đủ điều
kiện mở lượt holdout hoặc đổi model sản phẩm. Không hạ tiêu chí vì model lỗi.

- Rà lại cả24ảnh cũ trực tiếp bằng Codex, giữ đáp án/kết quả cũ. Phân biệt tên
  catalog với chữ in và số tập; ghi điểm cần người thật kiểm ở byline chữ nhỏ
  Tuổi trẻ đáng giá/Lược sử. Đây là review bằng AI, **chưa có review độc lập
  của người thật**, không đổi `reviewed=false` hoặc nhận là nghiệm thu.
- Thu12đầu sách khác từ feed Nhã Nam/Kim Đồng, giữ bytes/hash/URL/đáp án trước
  output. Có11ảnh bìa sản phẩm và1mockup marketing; đều không là ảnh điện thoại.
  Tác giả/biên kịch khác người dịch/minh họa/hiệu đính; ca chỉ in “Nhiều tác
  giả” không chấm tên từng người. Các cách ghi tên hợp lệ được chốt trong plan,
  vẫn giữ riêng số tên đúng theo canonical để không giấu lợi ích từ alias.
- Không biến24case đã chạy thành holdout bằng cách chia lại. Bộ12mới chưa có
  call model, còn nguyên để dùng cho lượt đối chứng sau; không tuyên bố model
  chưa từng thấy tác phẩm trong dữ liệu huấn luyện của provider.

[Danh mục qua API NVIDIA](https://docs.api.nvidia.com/nim/reference/llm-apis) liệt
kê84model lúc kiểm, gồm cả hai ứng viên; điều đó không chứng minh endpoint gọi
được. Chọn Gemma4 và Gemma3 trong cùng provider/key server. Tài liệu chính thức
[Gemma4](https://build.nvidia.com/google/gemma-4-31b-it/modelcard) mô tả text/image;
Llama3.2Vision không chọn vì [phạm vi ngôn ngữ image+text được công bố chỉ có
English](https://docs.api.nvidia.com/nim/reference/meta-llama-3_2-90b-vision-instruct).
Không cài model local, thêm provider hoặc đưa key sang dịch vụ khác.

| Model / 6case phát triển khó | Phản hồi đọc được | Kết quả / quyết định |
| --- | ---: | --- |
| Nemotron hiện tại | 6/6 | 0/6tên,4/6tác giả; p50=1384/p95=2128ms. Đây là6ca từng sai được chọn để sàng lọc, không phải chất lượng chung24case bị giảm |
| Gemma4 31B | 0/6 | 6Timeout ở25giây. Không có output để chấm khả năng OCR; không phù hợp đường gọi demo hiện tại |
| Gemma3 12B | 0/6 | 6ProviderError;1chẩn đoán có kiểm soát xác nhận HTTP404/NotFound. Chưa xác định được khả năng OCR |

18call sàng lọc +1call chẩn đoán, không gọi lại ca lỗi để tìm kết quả đẹp. Tổng
phần có usage dự toán0,008424USD;13lượt lỗi/timeout không có usage, nên **không
biết tổng phí thực tế**, không coi các lượt này là miễn phí. Trần42call và ngân
sách token dự toán0,30USD là giới hạn của plan, không phải trần hóa đơn cứng.
Không thêm lượt gọi khi không có ứng viên đạt.

Gate lựa chọn: chỉ dùng6case phát triển; ứng viên cần tăng ít nhất2tên và không
lỗi/ISBN sai. Gate đối chứng sau đó cần ít nhất10/12tên, tăng ít nhất2so với
baseline cùng12case, tác giả không giảm,0lỗi/ISBN sai,p95≤8giây. Không model nào
qua vòng đầu, nên **holdout NOT_RUN**. Ngay cả khi các ngưỡng so sánh sau này đạt,
người thật/ảnh điện thoại/ISBN có mặt vẫn là gate riêng, READINESS không đổi.

[Runner](../../apps/api/eval/autofill-assist/compare.ts) dùng ảnh qua cùng
derivative/shrink, prompt hiện hành, không fallback/retry; xen kẽ model trên
từng case, cùng scope latency. Kiểm plan, trùng work/title/hash, đáp án, đường
dẫn vật lý, hash ảnh và giải mã trước gọi. Journal ghi Pending trước network;
có Pending không tự replay. Resume giữ18row giống hệt và0call mới; thử mở
holdout bị chặn trước provider. Report phân biệt lỗi kỹ thuật và số phản hồi
chấm được; gate thiếu/budget/row trùng không thể thành khuyến nghị PASS.

PASS15unit (12so sánh +3quality), API typecheck và lint eval, docs/diff. Không
chạy lại browser/native/DB vì không đổi source sản phẩm. Mongo chính và QA đều
giữ dừng; không GHN, import, migration, đổi env/prompt/model/API/UI hoặc remote
integration. Ảnh/PDF/feed mới vẫn local ignored; chỉ metadata/plan/evidence vào Git.

Chạy từ `apps/api` khi được phép gọi provider:

```sh
pnpm eval:compare --phase screen
# Chỉ mở nếu journal có ứng viên thắng vòng phát triển:
pnpm eval:compare --phase holdout
```

Journal ở `.tmp/listing-ai-model-selection/comparison.json`; cần raw ảnh đúng
hash trong `qa-data/listing-ai/incoming/model-comparison/`. Đổi plan/prompt sẽ
bị chặn khi dùng journal cũ; không xóa journal để ép gọi lại. Sau khi xử lý
khả dụng endpoint, cần plan/lượt phát triển mới, giữ lịch sử lỗi và chưa dùng
holdout để chỉnh prompt. Bước kế tiếp cụ thể là xác minh một endpoint VLM chạy
ổn định trong NVIDIA, rồi mới mở bộ12case đã giữ; vẫn cần dữ liệu điện thoại
và người duyệt đáp án để nghiệm thu.

## Lượt đầu: corpus và hành trình

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
