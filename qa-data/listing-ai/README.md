# Bàn giao dữ liệu trợ lý đăng sách

Thư mục đã chuẩn bị cho Gemini/Antigravity ngày 29/10/2026.
Repo base `fc9ce22`, nhánh chuẩn bị `codex/listing-ai-data-handoff`.

- [Prompt giao việc đầy đủ](GEMINI_PROMPT.md): đưa nguyên file cho Gemini đọc.
- Codex đã hoàn thiện bộ kiểm và gói local sau v3: [kết quả hiện tại](REVIEW_2026_10_29.md).
  Technical PASS; coverage11/15 và nghiệm thu vẫn PARTIAL. Các prompt Gemini là
  lịch sử giao việc; không cần chuyển qua agent khác để sửa checker nữa.
- [Mẫu catalog](templates/books.example.json),
  [mẫu quan sát giá](templates/price-observations.example.json),
  [mẫu nguồn](templates/sources.example.json),
  [mẫu đáp án đọc ảnh](templates/cases.example.json).
- [Nơi nhận kết quả](incoming/README.md): Gemini chỉ ghi vào khu vực này. Mẫu
  chứa placeholder, **không phải dữ liệu thật hoặc dữ liệu sẵn để import**.

Đường dẫn trên máy chủ dự án:

```text
C:\Users\DESKTOP\Documents\WDP391\used-book-marketplace\qa-data\listing-ai\incoming
```

Hướng dẫn/template được lưu Git. Dữ liệu thu thập/ảnh trong incoming được ignore,
chưa phải tài sản đã duyệt để commit hoặc đưa vào DB. Chia sẻ qua Git chỉ sau khi
rà soát nguồn/quyền dùng/dữ liệu riêng; không dùng env/token trong gói này.

## Bộ kiểm dùng lại

```sh
pnpm data:listing-ai:test
pnpm data:listing-ai:check
pnpm data:listing-ai:check --write-report
```

[Validator](validator.mjs) dùng Sharp/Zod đã cài ở API/session-client, không thêm
dependency. [Tests](validator.test.mjs) tự sinh fixture và xóa đúng thư mục tạm có
guard; chạy được khi chưa có incoming private. [CLI](validate.mjs) mặc định chỉ
đọc, `--write-report` mới ghi incoming/validation/report.json; `--dir=<folder>`
chọn corpus khác cùng schema. JSON, paths/image bytes/schema/date/reference sai
trả exit1. Exit0 nghĩa technical PASS, **không** thay coverage/acceptance report.
Human review, real-camera quality và model evaluation luôn NOT_RUN ở bộ kiểm
offline này; nó không tự xác minh ý nghĩa locator, quyền dùng hoặc ấn bản ngoài web.

Gói **chuẩn bị data** không gọi AI trả phí, chạy app, import/seed/migrate,
đụng GHN hoặc thay source/contract. Không thay
[READINESS](../../docs/handoff/READINESS.md). Chất lượng ảnh chụp thật vẫn NOT_RUN
nếu không có corpus điện thoại do người có quyền cung cấp và kiểm đáp án.

Sau bàn giao, Codex kiểm lại manifest → ảnh/edition → nguồn giá → chạy QA riêng.
`price-refs:import` hiện cần kết nối DB kể cả dry run, nên **không chạy** trong gói
thu thập này. OnlineRetail chưa phải kind import được; không đổi nhãn để ép nhập.

## Kiểm model và hành trình sau chuẩn bị

[Gói kiểm riêng29/10](../../docs/features/LISTING_AI_CORPUS_2026_10_29.md) đã gọi
model với24ảnh scan:13/24tên,18/24tác giả,0ISBN bịa trên ảnh không có ISBN. Không
cải thiện khi thử prompt bố cục nên giữ prompt sản phẩm. Browser web/RNweb PASS
với một bìa và output phát lại; chưa là native/human/real-camera acceptance.

`pnpm data:listing-ai:test` hiện gồm29validator +12CLI/preflight, không gọi paid AI.
Sau build API, `node qa-data/listing-ai/evaluate-prices.mjs` chỉ đọc corpus/rule,
không DB/provider; thêm `--live` mới gọi tối đa3lượt với budget token dự toán0,02USD.
Không thêm flag nếu chưa có quyền trả phí. Bộ map giữ OnlineRetail và loại
likely/out-of-stock/blocked; không import hoặc cho mức Strong từ retail-only.
