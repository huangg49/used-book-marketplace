# Dọn tài liệu hiện hành — 09/10/2026

Yêu cầu: bỏ hướng dẫn lỗi thời, giữ context dùng được cho AI/chat mới.
Đối chiếu source sản phẩm main `da59199`, sau gói context `d77290a`;
nhánh `codex/docs-refresh`, checkpoint subject
`docs: refresh current guides and archive outdated session notes`.

## Phạm vi và phát hiện

Kiểm kê585 file tracked trong `docs/`, README các app/package và hướng dẫn root,
gồm175 Markdown trước thay đổi. Tìm trạng thái/version/runtime cũ, hướng dẫn
setup và liên kết; đọc sâu entrypoint, kiến trúc, đặc tả và báo cáo liên quan tới
code mới. Đối chiếu contract, registry Mongo, workspace scripts, app/gateway/
worker và Git history. Không có nghĩa đã tái nghiệm thu mọi evidence cũ.

| Thông tin gây nhầm | Xử lý |
| --- | --- |
| Contract0.21.0/3 migration được gọi là hiện tại | Hướng dẫn hiện hành dùng snapshot0.30.0/15 migration |
| API README còn Prisma/PostgreSQL runtime | Viết lại theo Mongo replica set; SQL giữ cho import lịch sử |
| Member web chỉ là Expo, app web riêng chưa tồn tại | Ghi rõ RN/Expo và React/Vite user-web đã cùng có trên main |
| Auction/point/chat còn được gọi là hoàn toàn Planned | Cập nhật code map theo source; phân biệt purchase chat với Order/payment |
| Mọi lane đều dừng F2h/chưa có settlement code | DirectDelivery tới F2h; ViaPoint có completion source, gate vẫn mở |
| Setup không nói user-web env/CORS/quyền collection mới | Bổ sung phần app env riêng, origin5174/4174 và bootstrap role sau migration |
| Kế hoạch demo06/10/phân công cũ được dẫn như việc mới | Bỏ khỏi bảng điều hướng hiện hành, đánh dấu kế hoạch lịch sử |
| Báo cáo increment/ADR nói chưa UI/inbox/merge | Gắn provenance và link trạng thái mới; giữ quyết định và evidence gốc |
| SRS/HTML mô tả chỉ có auth/catalog/listing | Dẫn implementation sang SESSION_STATE; cập nhật stack theo ADR0027 |

## Nội dung đã làm gọn và giữ lại

- [SESSION_STATE](SESSION_STATE.md) trở thành checkpoint ngắn. Nội dung trước
  thay đổi giữ ở [SESSION_HISTORY](SESSION_HISTORY_2026_10_09.md); chỉ bỏ khoảng
  trắng cuối hai dòng cũ để đạt diff check, không sửa nội dung teammate.
- [README API](../../apps/api/README.md) là hướng dẫn runtime hiện hành. Bản trước
  thay đổi giữ nguyên ở [README_HISTORY](../../apps/api/README_HISTORY_2026_10_09.md).
- README root/docs, START_HERE, TEAM_WINDOWS, DEVELOPMENT, ENV_HANDOFF,
  AI_WORKFLOW, architecture và DOMAIN_RULES được cập nhật ở đúng entrypoint.
  Context/prompt mới có chỉ dẫn phân biệt phát hiện trước và sau đợt dọn.
- Checklist thiết kế/nghiệm thu, report/ADR và các checkpoint cũ có ghi mốc
  lịch sử; không đổi kết quả test cũ thành PASS cho source mới.
- Không xóa SRS1.0, diagram/bundle, ADR, evidence, PostgreSQL migrations hoặc
  ghi nhận teammate. Không đổi FR/BR/POL, contract, code sản phẩm hay dữ liệu.
- Các file trùng byte tìm thấy là6 LICENSE ảnh và2 cặp ảnh evidence. Giữ vì giấy
  phép đi cùng từng asset và ảnh gắn từng ca; không có guide độc lập trùng byte.

## Kiểm chứng và giới hạn

PASS trên Node24.19.0/pnpm11.19.0:

- `pnpm docs:check`:191 Markdown,1572 link file tương đối,3 skill/adapter pairs.
- Render SRS1.1 và renderer `--check`:26 yêu cầu,12 use case,38 nhóm AC,
  16 policy phụ lục,221 link local;33 snapshot lịch sử không đổi.
- `git diff --check`: PASS.
- Hai archive giữ nội dung so với `d77290a` (chuẩn hóa khoảng trắng cuối dòng);
  các trạng thái gate READINESS
  và danh sách dòng FR/BR/POL trong SRS không đổi.

Renderer tạo lại [SRS1.1 HTML](../SRS_V1_1.html) từ nguồn Markdown; các checksum
artifact lịch sử vẫn phải đạt kiểm tra bảo toàn. Không sửa trực tiếp HTML.
Link checker kiểm link local Markdown; không xác minh nội dung website ngoài repo.

Không chạy app/worker/migration/seed, không kiểm lại API/native/live storage,
remote CI hoặc human review. READINESS giữ gate hiện có; gap LOCKED point
handlers, Exchange mock và eval/provider trong context không được sửa bằng docs.
Không push/PR/merge/deploy trong gói này.

Đọc mới từ [docs README](../README.md) và [SESSION_STATE](SESSION_STATE.md).
History dùng truy vết source; không lấy trạng thái chưa merge, PID hoặc lịch cũ
làm cấu hình/quyền gói mới.
