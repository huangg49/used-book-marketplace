# Tài liệu Lật lại

## Đọc theo việc cần làm

| Bạn cần | Tài liệu chính |
| --- | --- |
| Dựng máy để làm cùng nhóm | [TEAM_WINDOWS](handoff/TEAM_WINDOWS.md) → [START_HERE](handoff/START_HERE.md) → [ENV_HANDOFF](handoff/ENV_HANDOFF.md) |
| Dùng Codex/Claude/AI khác để làm việc | [AI_WORKFLOW](AI_WORKFLOW.md), [AGENTS](../AGENTS.md); chọn skill theo nhiệm vụ |
| Nối tiếp phiên làm việc | [SESSION_STATE](handoff/SESSION_STATE.md), [prompt tiếp nhận](handoff/NEXT_SESSION_PROMPT.md) |
| Bàn giao toàn cảnh cho AI/chat mới | [Context snapshot 09/10](handoff/PROJECT_CONTEXT.md), [inventory API/DB/test/config](handoff/PROJECT_CONTEXT_INVENTORY.md); đối chiếu source và các khác biệt tài liệu/code |
| Biết gate nào còn mở | [READINESS](handoff/READINESS.md) |
| Hiểu nghiệp vụ mục tiêu | [SRS1.1](SRS_V1_1.md), [phụ lục TP.HCM](features/LOCAL_HANDOVER_AUCTION.md) |
| Tìm API đang có | [OpenAPI](../packages/api-contract/openapi.yaml), [code map](handoff/START_HERE.md) |
| Sửa kiến trúc / database | [Kiến trúc](architecture/README.md), [ADR0027](adr/0027-mongodb-persistence-protocol.md), [model map MongoDB](refactor/MIG02_MODEL_MAP.md) |
| Sửa giao diện | [Brief hiện hành](../DESIGN.md), [Impeccable workflow](design/IMPECCABLE_WORKFLOW.md), [UI rules](design/UI_CODING_RULES.md), [components](design/UI_COMPONENTS.md), [brand assets1.1](../packages/brand/v1.1/README.md) |
| Lập công việc tiếp theo | [CONTINUATION_PLAN](handoff/CONTINUATION_PLAN.md), chỉ mở gói khi dependency/gate đạt |
| Tìm báo cáo hoặc bằng chứng cũ | [Danh mục chi tiết](CATALOG.md) |

## Nguồn nào quyết định điều gì?

- SRS/phụ lục: yêu cầu nghiệp vụ; ADR: quyết định thiết kế theo phiên bản.
- OpenAPI và code: API/triển khai thực tế. Snapshot main `da59199` (09/10): contract0.30.0,15 migration Mongo;
  17 migration SQL là lịch sử chỉ đọc phục vụ import.
- SESSION_STATE: việc đang làm và bước tiếp. READINESS: gate còn mở. Không lấy
  trạng thái hiện tại từ câu “chưa làm” trong một báo cáo có ngày cũ.
- Báo cáo feature/native/refactor: bằng chứng tại source và môi trường được ghi;
  không sửa kết quả lịch sử để trông như đã kiểm lại.

## Tổ chức thư mục

| Thư mục | Nội dung và cách dùng |
| --- | --- |
| handoff/ | Setup, trạng thái hiện tại; file HISTORY và báo cáo theo ngày là lịch sử |
| features/ | Thiết kế/acceptance/báo cáo tính năng; phân biệt mục tiêu với implementation |
| adr/ | Quyết định kiến trúc; không viết đè quyết định cũ khi đã có ADR thay thế |
| refactor/ | Hồ sơ MongoDB, model map, runbook và evidence |
| design/ | Quy tắc UI và báo cáo thiết kế |
| verification/ | Ảnh/JSON bằng chứng, không phải code ứng dụng |
| deliverables/, reference/ | Bản nộp và nguồn tham khảo lịch sử; không dùng làm hướng dẫn runtime |

HTML/PDF/ZIP/PNG có thể là bản xuất của cùng nguồn; giữ snapshot bàn giao và
[manifest](artifact-manifest.json), sửa nguồn chính thay vì sửa mọi bản xuất.
Không đặt thêm README hướng dẫn chạy khác ở root. Khi cập nhật trạng thái, sửa
SESSION_STATE/READINESS tại chỗ; chuyển phần cũ vào lịch sử khi cần, không nối mãi
các đoạn “điểm mới nhất”. [Lượt dọn09/10](handoff/DOCS_AUDIT_2026_10_09.md) ghi phạm vi cập nhật/lưu trữ.
Kế hoạch demo06/10 trong [CATALOG](CATALOG.md) là lịch sử, không là deadline hiện hành.
