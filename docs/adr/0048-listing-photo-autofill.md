# ADR 0048: Gợi ý thông tin sách từ ảnh khi đăng bán

**Status: Accepted (chủ dự án duyệt kế hoạch trong phiên 27/10/2026) — triển khai sau cờ
tắt mặc định.** Nhánh `feature/ai-listing-assist`. Sửa một phần §5 của
[ADR 0028](0028-listing-price-assistant.md) (“không OCR tạo listing”). SRS 1.1 không đổi:
đây là trợ giúp nhập liệu, không phải quy trình nghiệp vụ mới.

## 1. Bài toán

Người bán phải tự tìm đầu sách trong danh mục hoặc gõ đủ tên, tác giả, NXB, năm, ISBN
để gửi yêu cầu danh mục. Sách cũ ở Việt Nam thường không có mã vạch đọc được; gõ tay
trên điện thoại chậm và hay sai dấu. Ảnh bìa, gáy và trang bản quyền đã được tải lên
bài đăng nháp nên có thể đọc giúp.

## 2. Quyết định

**Model đọc ảnh chỉ đề xuất trường văn bản; server kiểm, đối chiếu danh mục, người bán
xác nhận từng trường. Không gì được lưu vào bài đăng hay danh mục một cách tự động.**

1. `POST /listings/{listingId}/autofill-suggestions` với `Idempotency-Key`, thân
   `{ mediaIds: 1–3 }`. Chỉ chủ bài đăng ACTIVE, bài đăng ở cùng trạng thái được phép
   như gợi ý giá (Draft/Rejected, hoặc Approved và Available), không phải bộ sách.
   Ảnh phải thuộc bài đăng, `Ready`, chưa purge.
2. Gửi provider **chỉ ảnh sách** (bản derivative đã bỏ EXIF/GPS, thu nhỏ JPEG tối đa 1536 px và ≤ 180 KB mỗi ảnh)
   và lời dặn cố định. Với OpenAI hoặc model NVIDIA mặc định, có thể gửi kèm tối đa một ảnh cận
   sinh từ cùng bộ ảnh trong một lần gọi. Không gửi id người dùng/bài đăng, email,
   địa chỉ, ghi chú tình trạng, session hay token.
3. Mặc định **NVIDIA NIM**, model `nvidia/nemotron-3.5-super-vl-120b-a12b`, với model
   dự phòng nội bộ theo cấu hình hiện có. `AUTOFILL_PROVIDER=openai` chọn Responses API,
   mặc định `gpt-5.4-mini`. Khi có key NVIDIA, dùng NVIDIA tối đa một lần với ảnh toàn trang
   sau timeout, lỗi kết nối hoặc HTTP 408/429/5xx của OpenAI. Hai provider chia ngân sách
   `AUTOFILL_TIMEOUT_MS` theo tỷ lệ 60/40. Kết quả hợp lệ nhưng thiếu trường được trả ngay.
   Hai lượt gọi tính vào cùng lượt Autofill và ngân sách chi phí chung.
4. Prompt yêu cầu JSON (không bắt buộc structured output vì không phải VLM nào cũng hỗ
   trợ), suy luận tắt, và kiểm lại phía server: độ dài như
   `CatalogMetadata`, năm 1400..năm hiện tại, ngôn ngữ chuẩn hóa BCP-47, ISBN chuẩn hóa
   và kiểm checksum (sai checksum thì bỏ, không sửa). Trường không chắc để `null`.
   Model không đề xuất tình trạng, giá, thể loại hay tính xác thực của sách.
5. Đối chiếu danh mục: chỉ đầu sách **Confirmed** (hoặc yêu cầu Pending của chính người
   bán) theo ISBN trùng khớp, rồi theo tên chuẩn hóa + tác giả. Tối đa 5 kết quả.
6. Trạng thái: `Suggested` (có ít nhất tên sách), `NeedsMoreData` (không đọc được tên;
   gợi ý chụp bìa/trang bản quyền rõ hơn). Lỗi provider/timeout/hết hạn mức → 503,
   giới hạn → 429; client luôn giữ nhập tay và dữ liệu đã gõ.
7. Gọi provider **sau commit**: cùng một transaction kiểm quyền, replay theo key, cache
   theo dấu vân tay (sha256 các ảnh, model chính và dự phòng, lời dặn và cấu hình thu ảnh) trong 24 giờ, giữ chỗ hạn mức và ghi bản
   `Pending`. Một yêu cầu đang chạy/người; 3 lần/bài đăng/phút; mặc định 10 lần/người/
   ngày (`AUTOFILL_USER_DAILY_LIMIT`). Chi phí cộng vào **ngân sách ngày chung** với trợ
   lý gợi ý giá (`price_assist_usage`, `global:<ngày>`).
8. Cờ `AUTOFILL_ENABLED=false` mặc định. `AUTOFILL_API_KEY` (NVIDIA) và
   `AUTOFILL_OPENAI_API_KEY` chỉ ở `.env` của API. Tác vụ tự duyệt dùng cấu hình NVIDIA riêng
   qua các biến NVIDIA hiện có và gate ở [ADR0063](0063-ai-listing-review-hardening.md).

## 3. Client

Nút “Điền từ ảnh” ở form nháp khi có ảnh Ready. Kết quả hiện cạnh từng trường với nhãn
“Gợi ý từ ảnh — kiểm tra lại”, có Dùng/Bỏ từng trường và danh sách đầu sách khớp để chọn.
Không ghi đè trường người bán đã gõ trừ khi họ chọn Dùng. Không hiển thị điểm tin cậy
giả.

## 4. Không làm

Không tạo bài đăng/yêu cầu danh mục tự động; không đọc chữ viết tay của chủ cũ hay
thông tin cá nhân trong ảnh; không xác minh tính xác thực, tình trạng, giá; không gửi ảnh
cho dịch vụ khác ngoài provider đã cấu hình. OpenAI dùng `store: false` cho phản hồi.
Cần xác nhận điều khoản xử lý và lưu dữ liệu của từng provider trước production.

## 5. Hệ quả

- Ảnh sách rời hệ thống tới provider đã cấu hình khi người bán bấm. Cần ghi trong chính sách quyền
  riêng tư nếu ra ngoài demo.
- Chất lượng chữ tiếng Việt có dấu trên bìa cũ chưa được đo; cần bộ thử 20–30 ảnh thật
  trước khi bật demo (ngưỡng đề xuất: ≥ 80% đúng tên sách, 0 ISBN sai checksum lọt ra).
- Bản trial build.nvidia.com có giới hạn tốc độ, không SLA.

## 6. Triển khai (27/10/2026) và cập nhật 09/11/2026

- OpenAPI 0.53.0 `requestAutofillSuggestion`; migration `0038-listing-autofill` tạo
  `autofill_suggestions`. Sau `pnpm db:migrate` phải chạy lại `pnpm db:bootstrap` để
  role `latlai_app` được quyền trên collection mới.
- Module `apps/api/src/modules/autofill-assist`; adapter NIM dùng chung
  `price-assist/nvidia-chat.ts`. Ảnh lấy từ derivative trên kho ảnh, thu về JPEG
  ≤ 180 KB (giới hạn ảnh inline của NIM hosted).
- **09/11, Member web**: có đường gọi AI khi riêng tra ISBN lỗi, sửa gợi ý và dùng
  dữ liệu đã sửa dù danh mục không khớp. Form nhập tay cho sửa hoặc bỏ thông tin
  ấn bản. Lỗi gửi đã xác định có bước đọc lại bản nháp để sửa. Mất phản hồi giữ
  nguyên yêu cầu để thử lại. Biên nhận mở đúng bài vừa gửi.
- **09/11, xử lý ảnh và lời dặn**: thử giữ đến 1536 px trước khi giảm về mức cũ
  để giữ chữ nhỏ. Lời dặn ghép tựa in rời và số in dọc, tách mốc trong tựa khỏi
  năm xuất bản. Giữ cấu hình ảnh của pipeline tự duyệt. Thử trực tiếp NVIDIA với
  cùng hai ảnh *Cao-Lãnh đến 1954*: cấu hình cũ đọc thiếu, chỉ sửa lời dặn vẫn thiếu,
  cấu hình mới đọc đủ phần tựa ở 2/2 lượt, bỏ dấu gạch nối, giữ ISBN và năm xuất bản
  trống. Bằng chứng giới hạn ở một cuốn và chưa đạt bộ thử ảnh thật của §5.
- Kiểm: unit (chuẩn hóa output, adapter, thu ảnh), e2e với provider/ảnh giả trên replica
  set QA (quyền, ảnh không hợp lệ, replay/xung đột key, cache, lỗi lưu lại, model dự
  phòng, giới hạn/phút, một yêu cầu đang chạy khi gửi song song, ngân sách chung).
  **Live 27/10/2026** (key NVIDIA của người giao việc, ảnh **tổng hợp** vẽ chữ tiếng Việt,
  không phải ảnh chụp thật): bìa sạch, bìa + trang bản quyền, bìa xoay/mờ/tối — đúng tên,
  tác giả, NXB; kèm trang bản quyền thì đúng năm, lần tái bản, ISBN; bỏ qua tem giá và lời
  đề tặng viết tay; 1–2,5 s, ~1.150–1.900 token vào. ISBN sai checksum bị server bỏ đúng.
  Trình duyệt: `/sell` với API + Mongo local + Supabase thật → tạo nháp, tải 2 ảnh, đọc,
  “Dùng tất cả” điền form; bản ghi `Suggested`, chi phí ước tính 2.316 micro-USD tính vào
  ngân sách chung. Provider trả id `private/nvidia/...`, được lưu như provider báo.
- Bộ chấm `pnpm --filter @used-books/api eval:autofill --dir <thư mục ảnh>` (`--init` tạo
  `cases.json`): ảnh đi qua cùng bước derivative + thu nhỏ như khi tải lên, chấm tên đúng
  (có dấu / bỏ dấu), tác giả, ISBN đúng/sai, p50/p95, chi phí; chỉ `source: real-camera`
  với ≥ 20 cuốn mới được tính là bằng chứng §5. Ảnh không vào Git; kết quả ghi ở
  `apps/api/eval/autofill-assist/results/`. Chạy thử trên 3 ca tổng hợp 27/10: 3/3 tên,
  tác giả, ISBN 1/1, 0 ISBN sai, p95 2,0 s — **không là bằng chứng** (ảnh tổng hợp).
- Trình duyệt 27/10, gửi trọn bài sau khi điền: lần gửi dùng lại bản nháp của lần đọc
  ảnh (không tạo nháp thứ hai), chỉ tải ảnh bìa mới; yêu cầu danh mục mang đủ NXB, năm,
  lần xuất bản, ISBN đã “Dùng”; bài đăng `PendingReview` với đúng 1 ảnh. Ảnh chỉ dùng
  để đọc không gắn vào revision và bị worker xóa sau ~24 giờ như ảnh nháp khác. Sửa
  hai lỗi tìm thấy: bước Kiểm tra chưa hiện các trường này (nay hiện trước khi gửi), và
  “Đăng cuốn khác” giữ bản nháp cũ — lần gửi sau sẽ phát lại kết quả cũ thay vì tạo
  bài mới; nay tạo bản nháp mới và xóa trường đã dùng (đã kiểm hai lần gửi liên tiếp
  tạo hai nháp khác nhau).
- **Bìa thật dạng scan** (27/10, `source: cover-scan`, người giao việc cung cấp 4 bìa:
  Doraemon tập 1 bản Nhật, Harry Potter tập 6 và tập 1 NXB Trẻ, Alice ở xứ sở thần tiên):
  4/4 tên đúng cả dấu, 3/3 tác giả in trên bìa, không lấy người dịch (Lý Lan, Hương Lan,
  Xuân Uyên) hay “Catmint Books” làm tác giả, 0 ISBN bịa. Lần đầu Doraemon trả
  `language: vi` và HP6 bỏ sót dòng nghiêng “Tái bản lần thứ 23”; đã sửa lời dặn (ngôn
  ngữ theo chữ in, không mặc định `vi`; đọc cả dòng nhỏ/in nghiêng). Sau sửa: Doraemon
  `ja`, HP6 đọc đúng lần tái bản 3/3 lần, 2,0–3,3 s; một lần HP6 timeout 25 s do provider
  chậm (lần khác 1,6–4,4 s). NXB có khi trả nguyên chữ hoa như in (“NHÀ XUẤT BẢN TRẺ”).
  Bìa scan phẳng, sạch hơn ảnh chụp điện thoại: **không là bằng chứng §5**.
- **20 bìa dựng hình** (27/10, `source: synthetic`, hai lưới 5×2 người giao việc gửi, cắt
  từng bìa ~210×340 px; có lỗi in cố ý như “The Midnight Hibrary”): tiếng Anh, Việt, Nhật,
  Hàn; 17/19 tên đúng cả dấu, 18/19 bỏ dấu, 17/19 tác giả, 0 ISBN bịa, ngôn ngữ đúng
  20/20, p50 1,1 s. Sai: “Hibrary” bị model “sửa” thành “Library” (dùng hiểu biết ngoài
  dù lời dặn cấm); dấu trên chữ nhỏ/kiểu cách (“Dế” → “Đế/Đề”, “Mặc” → “Mạc”, “Trọng” →
  “Trong”); NXB chữ rất nhỏ “Nhà xuất bản Trẻ” đọc thành “Nhà Xuất Bản Dân Trí” — **một
  NXB có thật nhưng sai**, người bán phải kiểm trước khi “Dùng”. Phóng to ảnh nhỏ 4× trước
  khi gửi làm kết quả kém hơn (13/19) nên không áp dụng.
- Sửa sau đợt này: lời dặn viết lại chữ in toàn hoa thành kiểu thường (trước đó “PROJECT
  HAIL MARY”, “FRANK HERBERT” đi thẳng vào yêu cầu danh mục), không giảm độ đúng; đối
  chiếu danh mục so tác giả bỏ khoảng trắng/dấu chấm (“新海 誠”/“新海誠”, “J. K.”/“J.K.”),
  vốn đã bỏ hoa/thường và dấu — nên “Đề Mèn” hay “Tống Mạc” vẫn khớp đúng đầu sách
  trong danh mục (e2e mới).
- **NOT RUN**: bộ nghiệm thu ảnh chụp điện thoại thật (ngưỡng §5, ≥ 20 cuốn).

### Bộ ảnh chuẩn bị buổi chấm 09/11

Member web có nút **Đọc chữ bằng AI** ngay sau khi chọn ảnh. Dùng nút này cho
sách cũ khi biết không có ISBN. **Đọc thông tin** vẫn thử tra mã vạch trước.
Từ thư mục ảnh chủ dự án cung cấp, đối chiếu trực tiếp chữ in rồi chạy NVIDIA
với bốn cuốn. Lượt gốc nhận đủ phần tựa của cả bốn nếu bỏ khác biệt dấu nối,
có hai tác giả đọc sai dấu. Lượt đọc bỏ sót dòng thông tin in ấn ở *Âm thanh
và cuồng nộ*. Không gợi ý ISBN cho cả bốn cuốn. Hai biến thể lời dặn/thu ảnh sai thêm trường nên không được áp dụng.

| Cuốn | Ảnh đã thử | Khi trình bày |
| --- | --- | --- |
| Âm thanh và cuồng nộ | `1.jpg` + `3.jpg` | Ca chính. Nhận đúng tựa và William Faulkner ở cả hai bộ ảnh đã thử. Ảnh 3 in Kinh Thi, lần I, 1972. Lượt đọc có thể bỏ sót dòng này. Ảnh 4 có quảng cáo cuốn khác. |
| Cao-Lãnh đến 1954 | `1.jpg` + `4.jpg` | Ca sửa tựa in rời. Tựa đủ chữ nhưng có thể thiếu dấu nối. Ảnh 4 có dòng in xong năm 1963. Tác giả chưa đủ rõ để tự điền. |
| Á-Nam thi tuyển | `1.jpg` + `2.jpg` + `3.jpg` | Đối chiếu dấu trong “tuyển” và tên tác giả trên trang nhan đề. Bỏ ảnh 3 trong lần thử riêng vẫn có lỗi dấu. |
| 9 đêm | `1.jpg` + `2.jpg` + `3.jpg` | Tựa in là “9 đêm”. Đối chiếu tác giả ở đầu bìa trước. Ảnh chương và lời bìa sau có thể gây nhiễu. Chỉ dùng ảnh 1 trong lần thử riêng vẫn có lỗi dấu. |

Các cuốn này dùng để kiểm phát triển và chọn ca trình bày. Tập nghiệm thu ảnh
thật ở §5 và việc gửi/duyệt bài bằng tài khoản thật vẫn cần bằng chứng riêng.

### Đọc chữ nhỏ tự động — 10/11/2026

Profile `listing-text-v2` giữ ảnh toàn trang và tự dò cụm chữ in nhỏ, gọn,
cách biệt với phần chữ còn lại. Nếu đạt ngưỡng, lấy tối đa một vùng từ bộ
ảnh đã chọn, phóng ảnh cận lên cạnh dài tối đa 640 px và gửi cùng lượt đọc
cho model mặc định. Các cấu hình model khác và lượt gọi dự phòng dùng ảnh
toàn trang. Mỗi ảnh vẫn chịu giới hạn 180 KB. Khi không có vùng phù hợp
hoặc không tạo được ảnh cận, đọc bằng bộ ảnh toàn trang. Dấu vân tay cache
bao gồm profile và lời dặn cho ảnh cận.

Thử phát triển bằng cùng model NVIDIA trên bốn cuốn của chủ dự án. Với bộ
`1.jpg`, `4.jpg`, `5.jpg` của *Cao Lãnh*, ảnh cận đọc đúng năm in 1963 ở 2/2
lượt, so với 0/2 lượt toàn trang. Với *Âm thanh và cuồng nộ*, năm 1972 đạt
2/2 so với 0/2. *Á-Nam thi tuyển* và *9 đêm* dùng đầu vào toàn trang giống
cấu hình cũ. Một lượt *Cao Lãnh* còn sai khác dấu câu trong tựa. Bốn lượt
có ảnh cận tăng khoảng 4–9% chi phí ước tính theo token. Đây là mẫu phát
triển nhỏ, chưa đạt bộ nghiệm thu ở §5.
