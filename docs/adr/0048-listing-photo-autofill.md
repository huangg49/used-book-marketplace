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
3. Provider **NVIDIA NIM**, model mặc định `nvidia/nemotron-3.5-super-vl-120b-a12b`
   (model VL v1 dự kiến ban đầu đã hết hạn 26/08/2026). Một model dự phòng tùy chọn chỉ được gọi **một lần** khi lần đầu
   không đọc được tên sách và còn hạn mức; cả hai tính vào ngân sách.
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
- **NOT RUN**: ảnh chụp điện thoại thật (ngưỡng §5, ≥ 20 cuốn).
