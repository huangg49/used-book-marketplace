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
   `gemini-2.5-flash`. Cả hai đều qua cùng `output-check.ts`. Không bật server-side fallback khi
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
quyết giá giao dịch; không hiển thị cho reviewer (chờ chủ dự án quyết).

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
5. Reviewer có được thấy người bán đã áp dụng gợi ý hay không.
