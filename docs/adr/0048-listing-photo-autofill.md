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
2. Gửi provider **chỉ ảnh sách** (bản derivative đã bỏ EXIF/GPS, thu nhỏ ≤ 1024 px JPEG)
   và lời dặn cố định. Không gửi id người dùng/bài đăng, email, địa chỉ, ghi chú tình
   trạng, session hay token.
3. Provider **NVIDIA NIM**, model mặc định `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`
   (VLM đọc tài liệu). Một model dự phòng tùy chọn chỉ được gọi **một lần** khi lần đầu
   không đọc được tên sách và còn hạn mức; cả hai tính vào ngân sách.
4. Output ràng buộc bằng JSON schema (`guided_json`) và kiểm lại phía server: độ dài như
   `CatalogMetadata`, năm 1400..năm hiện tại, ngôn ngữ chuẩn hóa BCP-47, ISBN chuẩn hóa
   và kiểm checksum (sai checksum thì bỏ, không sửa). Trường không chắc để `null`.
   Model không đề xuất tình trạng, giá, thể loại hay tính xác thực của sách.
5. Đối chiếu danh mục: chỉ đầu sách **Confirmed** (hoặc yêu cầu Pending của chính người
   bán) theo ISBN trùng khớp, rồi theo tên chuẩn hóa + tác giả. Tối đa 5 kết quả.
6. Trạng thái: `Suggested` (có ít nhất tên sách), `NeedsMoreData` (không đọc được tên;
   gợi ý chụp bìa/trang bản quyền rõ hơn). Lỗi provider/timeout/hết hạn mức → 503,
   giới hạn → 429; client luôn giữ nhập tay và dữ liệu đã gõ.
7. Gọi provider **sau commit**: cùng một transaction kiểm quyền, replay theo key, cache
   theo dấu vân tay (sha256 các ảnh + model) trong 24 giờ, giữ chỗ hạn mức và ghi bản
   `Pending`. Một yêu cầu đang chạy/người; 3 lần/bài đăng/phút; mặc định 10 lần/người/
   ngày (`AUTOFILL_USER_DAILY_LIMIT`). Chi phí cộng vào **ngân sách ngày chung** với trợ
   lý gợi ý giá (`price_assist_usage`, `global:<ngày>`).
8. Cờ `AUTOFILL_ENABLED=false` mặc định; key `AUTOFILL_API_KEY` chỉ ở `.env` của API.

## 3. Client

Nút “Điền từ ảnh” ở form nháp khi có ảnh Ready. Kết quả hiện cạnh từng trường với nhãn
“Gợi ý từ ảnh — kiểm tra lại”, có Dùng/Bỏ từng trường và danh sách đầu sách khớp để chọn.
Không ghi đè trường người bán đã gõ trừ khi họ chọn Dùng. Không hiển thị điểm tin cậy
giả.

## 4. Không làm

Không tạo bài đăng/yêu cầu danh mục tự động; không đọc chữ viết tay của chủ cũ hay
thông tin cá nhân trong ảnh; không xác minh tính xác thực, tình trạng, giá; không gửi ảnh
cho dịch vụ khác ngoài provider đã cấu hình; không lưu ảnh ở provider (API không lưu
theo điều khoản công bố — cần chủ dự án kiểm lại khi lên production).

## 5. Hệ quả

- Ảnh sách rời hệ thống tới NVIDIA khi người bán bấm. Cần ghi trong chính sách quyền
  riêng tư nếu ra ngoài demo.
- Chất lượng chữ tiếng Việt có dấu trên bìa cũ chưa được đo; cần bộ thử 20–30 ảnh thật
  trước khi bật demo (ngưỡng đề xuất: ≥ 80% đúng tên sách, 0 ISBN sai checksum lọt ra).
- Bản trial build.nvidia.com có giới hạn tốc độ, không SLA.

## 6. Triển khai (27/10/2026)

- OpenAPI 0.53.0 `requestAutofillSuggestion`; migration `0038-listing-autofill` tạo
  `autofill_suggestions`. Sau `pnpm db:migrate` phải chạy lại `pnpm db:bootstrap` để
  role `latlai_app` được quyền trên collection mới.
- Module `apps/api/src/modules/autofill-assist`; adapter NIM dùng chung
  `price-assist/nvidia-chat.ts`. Ảnh lấy từ derivative trên kho ảnh, thu về JPEG
  ≤ 180 KB (giới hạn ảnh inline của NIM hosted).
- Kiểm: unit (chuẩn hóa output, adapter, thu ảnh), e2e với provider/ảnh giả trên replica
  set QA (quyền, ảnh không hợp lệ, replay/xung đột key, cache, lỗi lưu lại, model dự
  phòng, giới hạn/phút, một yêu cầu đang chạy khi gửi song song, ngân sách chung).
  **Chưa chạy live** với key NVIDIA và ảnh thật: chất lượng đọc chưa được đo.
