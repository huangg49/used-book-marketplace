# ADR 0028: Trợ lý gợi ý giá bán khi đăng sách

**Status: Proposed — đã triển khai sau cờ tắt mặc định, chờ chủ dự án duyệt.** 05/10/2026.
Nhánh `codex/bao-listing-price-assist`. OpenAPI 0.22.0, migration `0005-price-assist`.
SRS 1.1 §75 loại “định giá thị trường tự động” khỏi phạm vi; tài liệu này là đề xuất
mở rộng, **không** sửa SRS. Chủ dự án quyết định nguồn dữ liệu, provider và ngưỡng đạt
(§7) trước khi bật cho demo. Báo cáo và evidence: [PRICE_ASSIST_REPORT](../features/PRICE_ASSIST_REPORT.md).

## 1. Bài toán

Người bán cần một khoảng giá có căn cứ khi nhập giá bán. Dự án không có lịch sử giao dịch
hoàn tất (F2h dừng trước Delivered/Completed), không có giá bìa trong catalog và BR-09
cấm dùng trung bình listing cùng thể loại làm chuẩn. Một model tự sinh giá sẽ không kiểm
chứng được và dễ bị nhầm là giá đã xác minh.

## 2. Quyết định

**Luật cố định quyết định; model chỉ soạn khoảng giá và lý do trong giới hạn luật cho phép.**

1. Nguồn giá tách loại, không gộp: `CoverPrice` (giá bìa), `EditorialReference` (nhóm
   biên tập kiểm), `CompletedSale` (giá đã bán — schema có, dữ liệu v1 trống) lưu ở
   `price_references`, ghi bởi công cụ import với quyền migrator; app chỉ đọc.
   `InternalAsking` là giá rao của listing Approved/Visible/Available cùng đầu sách của
   **người khác**, tính lúc yêu cầu, luôn hiển thị “chưa phải giá đã bán”.
2. Luật (`evidence.ts`, có rule id trả về client):
   - Từ chối: không đọc rõ, thiếu nội dung trọng yếu, nguồn dưới 10.000 đ hoặc trên
     1.000.000 đ (POL-16).
   - Thiếu dữ liệu: chưa chọn tình trạng/trả lời câu hỏi, không còn nguồn dùng được,
     hoặc chỉ có một giá rao.
   - Loại nguồn: khác ISBN (`OtherEdition`), cũ hơn 24 tháng (giá bìa 36 tháng),
     lệch quá 3 lần trung vị khi có ≥3 nguồn (`Outlier`). Nguồn bị loại vẫn hiển thị.
   - `Strong` chỉ khi ≥3 nguồn, ≥2 nguồn độc lập theo nhãn, có nguồn không phải giá rao,
     không chỉ có giá bìa, nguồn mới nhất ≤12 tháng, biết ISBN/ấn bản và catalog đã xác
     nhận. Còn lại `Limited`. Không có phần trăm tin cậy.
3. Model nhận khối DATA (JSON) gồm metadata sách, tình trạng, ghi chú đã lọc và nguồn
   được dùng; system prompt nói rõ DATA là dữ liệu, không phải chỉ dẫn. Không tool.
   Output qua structured JSON, rồi server kiểm (`output-check.ts`): số nguyên, làm tròn
   1.000, nằm trong biên `[min×0.3, max×1.1]` và POL-16, high ≤ 2.5×low, mỗi lý do chỉ
   trích nguồn có trong DATA hoặc `condition`, ít nhất một lý do trích nguồn giá, không
   link, không khóa lạ. Sai bất kỳ điểm nào → bỏ toàn bộ, 503, người bán nhập tay.
4. Không gửi provider: id người dùng/listing, email, địa chỉ, session, token. Ghi chú tình
   trạng bị thay email, URL, chuỗi ≥8 chữ số bằng `[đã ẩn]` trước khi gửi.
5. Giao thức: transaction 1 (khóa user/session như mọi lệnh) kiểm owner/trạng thái
   listing, catalog, tính luật, tra cache, giữ hạn mức và tạo bản ghi `Pending`; gọi
   provider **sau commit** (không side effect trong transaction có thể chạy lại);
   transaction 2 ghi kết quả/chi phí. Một yêu cầu `Pending` mỗi thành viên; tối đa 3
   lần gọi model/listing/phút; mặc định 20 lần/người/ngày; ngân sách ngày toàn hệ thống
   (mặc định 2 USD). Cùng listing + input + bộ nguồn trong 24 giờ trả bản đã lưu
   (`cached=true`), không gọi lại. Mỗi lần hỏi có `Idempotency-Key` riêng (bắt buộc như
   mọi lệnh không phải GET): cùng key + cùng body trả lại đúng kết quả/lỗi đã lưu, cùng
   key khác body → 409 `IdempotencyConflict`; key theo từng thành viên.
6. Quyết định của người bán: `priceAssist {suggestionId, applied}` tùy chọn trên
   `PUT /listings/{id}/draft` và `POST /listings/{id}/revision`, ghi vào
   `price_suggestions.outcome` **trong cùng transaction** với lần lưu (kèm giá đã chọn
   và có nằm trong khoảng không). Id của người/listing khác hoặc gợi ý thất bại → 422.
   Giá thật vẫn chỉ là `salePrice`; không đổi listing revision schema. Đổi giá sau duyệt
   vẫn qua revision/duyệt lại như cũ.
7. Provider: adapter `PriceModel`, chọn bằng `PRICE_ASSIST_PROVIDER`.
   `anthropic`: SDK chính thức, `maxRetries: 0`, timeout 20 s, `max_tokens` 4000, effort
   `low`, model mặc định `claude-opus-5-5`. `gemini` (05/10, theo key người giao việc
   cung cấp): REST `generateContent`, key trong header `x-goog-api-key` (không ở URL),
   `responseSchema` JSON, `maxOutputTokens` 4000, temperature 0.2, timeout bằng
   AbortController, không retry; token suy nghĩ tính vào output; model mặc định
   `gemini-3.8-flash` (05/10: Google trả 404 cho `gemini-2.5-flash` với người dùng API mới).
   Cả hai đều qua cùng `output-check.ts`. Không bật server-side fallback khi
   model từ chối: từ chối chỉ chuyển sang nhập tay. Fake provider chỉ dùng cho test lỗi/
   adapter và UI fixture, không là evidence chất lượng.

## 3. Client

RN (dùng chung Expo web): panel ở bước “Bán hoặc đổi”, chỉ khi bán. State nằm trong
editor nên giữ khi đổi bước. Đổi đầu sách/tình trạng/ghi chú → gợi ý cũ báo hết hiệu lực;
phản hồi muộn của request cũ hoặc listing khác bị bỏ. Chọn mức giá khi ô giá đã có số
khác → hỏi xác nhận. Gợi ý không chặn rời màn (không phải mutation).

## 4. Cấu hình

`PRICE_ASSIST_ENABLED` (mặc định false), `PRICE_ASSIST_API_KEY` (chỉ backend `.env`),
`PRICE_ASSIST_PROVIDER` (`anthropic`|`gemini`), `PRICE_ASSIST_MODEL`, `PRICE_ASSIST_EFFORT`, `PRICE_ASSIST_TIMEOUT_MS`,
`PRICE_ASSIST_USER_DAILY_LIMIT`, `PRICE_ASSIST_DAILY_BUDGET_USD`, tùy chọn
`PRICE_ASSIST_INPUT/OUTPUT_USD_PER_MTOK`. Tắt hoặc thiếu key: luật vẫn trả
NeedsMoreData/Refused, lời gọi model trả 503.

## 5. Không làm

Không sửa giá tham chiếu đã xác minh, trần giá trị đổi, cọc, số dư; không gợi ý giá trị
đổi; không crawler, OCR tạo listing, model tự huấn luyện, nhận diện sách giả; không tự
quyết giá giao dịch.

## 6. Hệ quả

- Phần lớn đầu sách sẽ là NeedsMoreData cho tới khi nhóm biên tập nhập nguồn có quyền
  sử dụng. Đó là hành vi đúng, không phải lỗi.
- `price_suggestions` giữ đầu vào đã lọc và kết quả để đánh giá/chi phí; không có TTL.
  Cần chính sách lưu giữ nếu đưa ra ngoài demo.
- Ngân sách được kiểm trước khi gọi bằng chi phí đã ghi; nhiều yêu cầu song song của
  các thành viên khác nhau có thể vượt nhẹ ngưỡng ngày bằng chi phí của các lời gọi
  đang chạy.

## 7. Cần chủ dự án quyết định

1. Có chấp nhận mở rộng SRS này cho demo không; ghi change request ở SRS CHANGELOG.
2. Nguồn giá được phép (giá bìa NXB/nhà sách, biên tập), quyền sử dụng, ai nhập/duyệt.
3. Provider/model, người giữ key, ngân sách chạy thử.
4. Ngưỡng đạt eval (đề xuất: 100% ca phải từ chối/thiếu dữ liệu đúng; ≥80% ca có khoảng
   kỳ vọng đã kiểm có điểm giữa nằm trong khoảng; 0 output sai lọt tới client; p95 < 8 s).
5. ~~Reviewer có được thấy người bán đã áp dụng gợi ý hay không.~~ Đã chọn hiển thị (§8).
6. Tỷ lệ băng theo tình trạng ở §8 (đề xuất, chỉnh trong `CONDITION_BANDS`).

## 8. Cập nhật v2 (06/10/2026)

Nhánh `codex/bao-price-assist-gemini`, OpenAPI 0.23.0, migration `0006`, `0007`.

- **Băng theo tình trạng quyết định khoảng giá** khi có giá sách mới (giá bìa nhân viên
  nhập hoặc giá tra trực tuyến, [ADR 0029](0029-online-price-lookup.md)): Như mới 55–75%,
  Tốt 40–60%, Khá 25–45%, Cũ 15–30% trung vị giá sách mới; thiếu trang thì tối đa băng Khá.
  Làm tròn 1.000 đ, cắt theo POL-16. Không có giá sách mới thì giữ biên từ giá sách cũ
  (`R-BAND-USED-PRICES`). Strong cần giá sách mới và một giá sách cũ từ nguồn độc lập.
- **Cần ít nhất 1 ảnh Ready** trước khi gợi ý (`R-NEED-PHOTO`), không gọi model.
- **Giá rao của người bán khác chỉ để tham khảo** (`excluded: AskingPrice`), không vào
  khoảng giá và không tính là đủ dữ liệu.
- **Lưu nháp kiểm lại gợi ý**: bản ghi giữ `input` (sách, tình trạng, ba câu trả lời);
  lưu khác đầu vào hoặc gợi ý đã hết hạn → 422 `/priceAssist/suggestionId`.
- **Staff thấy gợi ý** ở chi tiết duyệt (`PrivateListing.priceAssist`): khoảng, mức căn
  cứ, tình trạng người bán khai lúc xin gợi ý, đã dùng hay không, giá chọn, nguồn.
- Gemini thử lại một lần khi 503/429 nếu còn ≥ 8 s; lỗi provider ghi log WARN kèm lý do
  ngắn của Google.

## 9. Cập nhật provider NVIDIA (27/10/2026)

Nhánh `feature/ai-listing-assist`. Không đổi contract, migration hay luật bằng chứng.

- `PRICE_ASSIST_PROVIDER=nvidia` gọi NVIDIA NIM qua API chat tương thích OpenAI
  (`integrate.api.nvidia.com/v1`, hoặc `NVIDIA_BASE_URL` https cho NIM tự host). Key
  `nvapi-…` chỉ ở header `Authorization`; không retry, timeout bằng AbortController.
- Model mặc định `nvidia/nemotron-3.5-lightning-30b-a3b`. Tắt suy luận bằng
  `chat_template_kwargs.enable_thinking=false` (Nemotron 3.x mặc định suy luận vào
  `reasoning_content`, hết token và để `content` rỗng); output ràng buộc bằng
  `response_format: json_schema` (API hosted từ chối `nvext.guided_json` với 400) và vẫn
  qua `output-check.ts`. Thẻ `<think>` hoặc code fence bị bỏ trước khi parse.
- Đơn giá NVIDIA trong `KNOWN_RATES` là ước lượng cao để ngân sách không đếm thiếu
  (bản dùng thử build.nvidia.com tính theo credit); gói trả phí đặt
  `PRICE_ASSIST_INPUT/OUTPUT_USD_PER_MTOK`.
- Tra giá trực tuyến (ADR 0029) vẫn chỉ chạy với Gemini; với `nvidia` thì
  `PriceFinder` là null như với `anthropic`.
- Live 27/10/2026: hai model Nemotron 1.x/VL v1 ban đầu đã hết hạn 26/08/2026 (410),
  nhiều model trong `/v1/models` trả 404 “not found for account”. Với model mới, một
  ca Mắt biếc (Good, giá bìa 110.000 đ, biên tập 55.000 đ, biên 44–66k) cho khoảng
  48–58k và 48–60k, qua `output-check`, ~2,3–2,8 s, ~725/160 token. Một ca không là eval
  §7; chưa chạy bộ eval đầy đủ.
