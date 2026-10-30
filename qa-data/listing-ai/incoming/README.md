# Nơi Gemini bàn giao

Đã có dữ liệu Gemini và được Codex hoàn thiện phần kỹ thuật ngày29/10/2026.
25raw books,24case active/1quarantine; technicalPASS, coverage11/15 và nghiệm thu
vẫnPARTIAL. Xem HANDOFF.md và validation/report.json trong folder local này.
Chỉ file hướng dẫn này và .gitignore được theo dõi trong Git; raw/ảnh chưa duyệt
để commit. Cấu trúc chính:

```text
catalog/books.json
prices/observations.json
prices/import-candidates.json
provenance/sources.json
autofill/cover-scan/cases.json
autofill/cover-scan/quarantine-cases.json
autofill/cover-scan/images/<bookKey>/...
autofill/real-camera/cases.json
validation/report.json
HANDOFF.md
```

Đường kiểm chuẩn là `pnpm data:listing-ai:test` và
`pnpm data:listing-ai:check --write-report` từ root. Hai runner trong validation
chỉ là wrapper tương thích; nguồn checker/tests được lưu Git ở folder cha.

`import-candidates.json` có thể là `[]`: chỉ là danh sách chờ kiểm, không tự
import. `real-camera/cases.json` phải để cases rỗng nếu không có ảnh chụp thật;
không sao chép ảnh scan sang lane này. Chi tiết bắt buộc nằm ở
[prompt giao việc](../GEMINI_PROMPT.md).
