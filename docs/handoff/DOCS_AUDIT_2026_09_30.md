# Rà cấu trúc và tính đồng bộ tài liệu — 30/09/2026

Nguồn1be5144, nhánh codex/docs-navigation-cleanup. Rà file Git, trang điều hướng,
link Markdown và các mô tả runtime đối chiếu source; không phải review lại toàn bộ
SRS/ADR, kiểm render mọi binary hoặc chứng nhận mọi câu trong báo cáo lịch sử.

## Phát hiện và xử lý

| Phát hiện | Cách xử lý |
| --- | --- |
| README dài như changelog, còn contract0.20 và upload “chưa kiểm” chung chung | Rút còn trang bắt đầu/cấu trúc/phạm vi, contract0.21 theo OpenAPI; dẫn gate cụ thể |
| SESSION_STATE nối nhiều “điểm mới nhất”, có cả đã merge và chưa merge/cutover | Tách toàn bộ nội dung cũ sang SESSION_HISTORY, viết điểm lưu ngắn hiện hành |
| READINESS trộn checkpoint28/09 với cập nhật30/09 | Tách lịch sử, thay trang hiện tại bằng bảng gate và link evidence |
| docs index là danh sách dài, link báo cáo thêm cuối không theo nhóm | Giữ danh mục ở CATALOG, tạo mục lục theo nhu cầu và chỉ rõ nguồn thẩm quyền |
| Kiến trúc vẫn PostgreSQL, liệt kê module dự kiến như đã có; Flutter mô tả như đã triển khai | Đối chiếu thư mục modules, MongoService, Flutter main.dart; sửa mô tả |
| START_HERE/prompt/plan/AGENTS chưa phản ánh main/cutover | Sửa điểm vào; giữ business F2h, phân biệt contract hiện0.21 và mốc0.20 lịch sử |
| Checklist demo/Android preflight còn nói kết nối PostgreSQL | Đổi sang replica set MongoDB phù hợp doctor hiện tại |
| Hai link command.service.ts đã bị xóa sau port | Chuyển sang Mongo executor; cập nhật entry point review DB sang validator/index/role/commit checks |

## Root có thừa không?

Root có14 file được Git quản lý:6 cấu hình ẩn (.editorconfig/.env.example/
.gitattributes/.gitignore/.npmrc/.nvmrc),3 file pnpm/package và5 tài liệu
(README/AGENTS/CLAUDE/CONTRIBUTING/SECURITY). Giữ vị trí để Git, Node/pnpm và agent
tự tìm đúng; CLAUDE chỉ là entry point, không sao chép toàn AGENTS.

node_modules, .tmp và .env là local ignored. Không đưa chúng vào bàn giao Git và
không xóa hàng loạt: .tmp đang chứa log/harness/backup phiên cần phục hồi, dependency
đang dùng cho dev. Prisma generated cũ đã ignored/exclude khỏi build từ gói trước.

## Cái gì cần giữ?

Quét292 file docs được Git quản lý trước đợt dọn: không có cặp trùng byte hoàn toàn.
Tệp lớn nhất khoảng1,41MB là deck Review1; các file lớn khác là ZIP bàn giao và ảnh
native. Chúng có vai trò snapshot/evidence. HTML/PNG/SVG/ZIP có thể xuất từ cùng nguồn
nhưng không tự coi là rác. Chưa xóa ảnh, ZIP, SRSv1.0, ADR, migration hoặc evidence.
Lịch sử giữ cùng thư mục để link tương đối vẫn hoạt động; không sửa kết quả test cũ.

## Xác minh và giới hạn

- Quét1.039 link tương đối dạng Markdown trong146 file Markdown tracked và
  file mới: sửa hai link chết có sẵn; kiểm lại sau thay đổi, không còn file đích thiếu.
  Không kiểm URL ngoài mạng, HTML href hoặc mọi fragment heading trong báo cáo cũ.
- git diff --check; đối chiếu contract version, module directories và runtime DB.
- So3 nội dung chuyển sang SESSION_HISTORY/READINESS_HISTORY/CATALOG với Git HEAD:
  giữ nguyên toàn bộ phần cũ sau chuẩn hóa xuống dòng, chỉ thêm lời dẫn lịch sử.
- Không chạy lại API/RN/browser/native: chỉ thay tài liệu và chỉ dẫn agent.
- Không nới release gates hay quy tắc reviewer. Thẩm mỹ, full native và human review
  vẫn OPEN; TEAMWORK yêu cầu reviewer không được coi là đã đáp ứng từ CI.

Về sau cập nhật SESSION_STATE/READINESS tại chỗ. Báo cáo có ngày ghi kết quả tại thời
điểm đó; chỉ thêm evidence khi có công việc thực chạy, không tạo báo cáo trùng cho
cùng một kết luận. Tra [mục lục](../README.md) trước khi thêm tài liệu mới.
