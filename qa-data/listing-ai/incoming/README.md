# Nơi Gemini bàn giao

Hiện tại **chưa có dữ liệu thu thập**. Chỉ file hướng dẫn này và .gitignore được
theo dõi trong Git. Gemini ghi các file/thư mục sau bên cạnh README, không ghi đè
hướng dẫn hoặc giả định folder trống nghĩa dữ liệu đã đạt:

```text
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

`import-candidates.json` có thể là `[]`: chỉ là danh sách chờ kiểm, không tự
import. `real-camera/cases.json` phải để cases rỗng nếu không có ảnh chụp thật;
không sao chép ảnh scan sang lane này. Chi tiết bắt buộc nằm ở
[prompt giao việc](../GEMINI_PROMPT.md).
