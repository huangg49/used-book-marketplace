# Bàn giao dữ liệu trợ lý đăng sách

Thư mục đã chuẩn bị cho Gemini/Antigravity ngày 29/10/2026.
Repo base `fc9ce22`, nhánh chuẩn bị `codex/listing-ai-data-handoff`.

- [Prompt giao việc đầy đủ](GEMINI_PROMPT.md): đưa nguyên file cho Gemini đọc.
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

Đây là gói **chuẩn bị data**: không gọi AI trả phí, chạy app, import/seed/migrate,
đụng GHN hoặc thay source/contract. Không thay
[READINESS](../../docs/handoff/READINESS.md). Chất lượng ảnh chụp thật vẫn NOT_RUN
nếu không có corpus điện thoại do người có quyền cung cấp và kiểm đáp án.

Sau bàn giao, Codex kiểm lại manifest → ảnh/edition → nguồn giá → chạy QA riêng.
`price-refs:import` hiện cần kết nối DB kể cả dry run, nên **không chạy** trong gói
thu thập này. OnlineRetail chưa phải kind import được; không đổi nhãn để ép nhập.
