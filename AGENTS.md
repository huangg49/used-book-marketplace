# Working in Lật lại

## Start with the task

- Kiểm git status/branch/log/remote trước khi sửa; bảo toàn local work. Không reset,
  clean, checkout đè hoặc pull khi chưa hiểu working tree. Mỗi feature một nhánh.
- Đọc [SESSION_STATE](docs/handoff/SESSION_STATE.md) và [READINESS](docs/handoff/READINESS.md)
  để biết việc/gate hiện tại. Máy mới theo [TEAM_WINDOWS](docs/handoff/TEAM_WINDOWS.md).
  [START_HERE](docs/handoff/START_HERE.md) là code map và setup; chỉ đọc sâu phần cần.
- [AI_WORKFLOW](docs/AI_WORKFLOW.md) hướng dẫn công cụ, giao việc, kiểm tra và bàn giao
  cho cả nhóm. Claude đọc cùng file này qua CLAUDE.md; không có bộ luật riêng.
- Tự hoàn thành công việc thông thường đã được giao. Chỉ hỏi khi thiếu quyết định
  hoặc quyền truy cập cần thiết; không hỏi lại dữ kiện tìm được trong repo.
- Lấy phạm vi từ yêu cầu/issue, đối chiếu code và contract. Nếu tài liệu mâu thuẫn,
  chỉ rõ khác biệt; không tự sửa nghiệp vụ để khớp implementation bị nghi sai.

## Sources and scope

- Nghiệp vụ: [SRS 1.1](docs/SRS_V1_1.md) và [phụ lục TP.HCM](docs/features/LOCAL_HANDOVER_AUCTION.md).
  DirectDelivery address zones are TP.HCM, Bình Dương and Vũng Tàu per owner
  request17/10 ([ADR0039](docs/adr/0039-book-circulation-regions.md)); stable demo
  keys remain compatible. Two simulated managed points remain at TP.HCM; optional
  ViaPoint for ordinary sales/exchanges, mandatory intake/inspection before auction.
  Yêu cầu được chấp nhận không có nghĩa workflow đã triển khai. Giữ snapshot v1.0.
- ADR là quyết định kiến trúc; OpenAPI là contract; code/tests/evidence mô tả phần
  đã hiện thực tại source được ghi. Báo cáo có ngày và HISTORY không là trạng thái mới nhất.
- Runtime MongoDB, [ADR 0027](docs/adr/0027-mongodb-persistence-protocol.md).
  DirectDelivery tới F2h; ViaPoint đấu giá có source inspection/claim/settlement,
  nhưng không là bằng chứng đóng gate. Giữ [READINESS](docs/handoff/READINESS.md):
  hoàn tất gate và quyền gói trước mở rộng Delivered/inspection/settlement.
  [CONTINUATION_PLAN](docs/handoff/CONTINUATION_PLAN.md) không tự cấp quyền bỏ gate.
- React Native là client Member ưu tiên; API chung cho RN, web và Flutter.
  Flutter còn scaffold; Member web có Expo web và `apps/user-web` React/Vite đã có.
  Sửa đúng app được giao; không tự tách thêm client/framework.

## Read by task

| Nhiệm vụ | Đọc trước khi sửa |
| --- | --- |
| UI RN/web/admin/Flutter | [Skill UI](.agents/skills/latlai-ui/SKILL.md), [brief hiện hành](DESIGN.md), UI rules/components; [Impeccable workflow](docs/design/IMPECCABLE_WORKFLOW.md) khi design/critique/refine |
| API, permission, session, persistence | [Skill API/Mongo](.agents/skills/latlai-api-mongo/SKILL.md), phần liên quan trong [DOMAIN_RULES](docs/architecture/DOMAIN_RULES.md) và ADR/feature được dẫn |
| Review hoặc hoàn tất một gói | [Skill verify/handoff](.agents/skills/latlai-verify-handoff/SKILL.md), [CONTRIBUTING](CONTRIBUTING.md), [TEAMWORK](docs/TEAMWORK.md) |

Skills là quy trình theo nhiệm vụ, không thay SRS/ADR và không mở rộng quyền thao tác.
Không cần đọc mọi skill hoặc mọi báo cáo trong một lần sửa nhỏ.

## Architecture and invariants

- API business code ở apps/api/src/modules/<feature>. Auth mặc định; @Public() chỉ
  cho route cố ý public, @Roles cho role. Service vẫn kiểm owner/eligibility/state.
  ExistingObligation chỉ ở đúng method và đi cùng kiểm tra service; login/UI không là quyền.
- Cross-module mutation qua explicit services. Dùng command executor/runTransaction,
  lock order/lockSeq, commit-time checks và updatedAt theo
  [model map](docs/refactor/MIG02_MODEL_MAP.md). Auth hiện tại trước replay.
- Giữ expectedVersion, Idempotency-Key/body và receipt. Mất phản hồi không tự đổi key
  hoặc version để ép thành công. Không thêm write rời rạc phá tính nguyên tử.
- Ledger bất biến là nguồn tiền; không chỉnh balance trực tiếp hay dùng Redis làm
  số dư. Giữ hold/commitment khi review/refund chưa giải quyết. Không refund theo
  nhánh trước acceptance sau khi seller đã nhận. Quote/label/ảnh/report không tự
  chứng minh custody hoặc cho phép restock/settlement. Chi tiết theo DOMAIN_RULES.
- Contract-first: sửa packages/api-contract/openapi.yaml rồi pnpm contract:generate;
  commit cả YAML/generated types, không sửa tay generated types.
- Mongo validator/index/reference data đổi bằng migration mới ở
  apps/api/src/database/mongo/migrations/. Không sửa migration đã áp dụng/checksum,
  reset DB dùng chung hay đổi mật khẩu seed ngầm. apps/api/prisma/migrations là
  lịch sử PostgreSQL chỉ đọc cho import; không xóa khi dọn runtime.
- RN routes compose screens trong src/features, dùng transport/session ở src/core,
  TanStack Query cho server data. RN/web dùng packages/session-client; không tạo
  token store thứ hai. Browser tokens memory-only; native lưu refresh token qua
  SecureStore, không persist access token. Flutter phải giữ cùng semantics API/session.
- UI dùng component chung và brand; giữ loading/empty/error, dữ liệu form khi lỗi,
  keyboard/safe area/Back/chữ lớn. Không bịa rating/trust badge hoặc API để làm demo đẹp.
- Chính sách motion của chủ dự án (11/10/2026): từ nay giữ animation đã thiết kế
  kể cả khi hệ điều hành/trình duyệt bật `prefers-reduced-motion`. Không tự đổi
  sang tĩnh hoặc rút ngắn chuyển động theo preference này. Dùng override trong
  phạm vi component để tránh CSS chung vô hiệu hóa hiệu ứng; giữ điều kiện
  viewport/visibility, cleanup/Back và tối ưu mobile. Không đổi cài đặt máy.
  Fallback kỹ thuật khi không có Canvas/WAAPI vẫn được phép; yêu cầu mới này
  ưu tiên hơn hướng dẫn giảm chuyển động cũ trong DESIGN/UI rules/skills.

## Verify and leave a usable checkpoint

- Chọn kiểm tra theo [ma trận](docs/AI_WORKFLOW.md#kiểm-tra-theo-thay-đổi). Auth,
  permission, session, transaction cần ca từ chối/replay/race liên quan. Không chạy
  lại gate đã đạt khi không đổi source liên quan. Không sửa test để che lỗi.
- QA dùng replica set riêng và database *_test; không chạy harness ghi/xóa trên DB
  hoặc bucket local chính. Xem START_HERE trước chạy E2E/import/live storage tests.
- Web export không là native PASS; storage fake không là Supabase thật; AI review
  không là human review. Ghi rõ NOT RUN/BLOCKED/skip, không hứa hết bug.
- Không in/commit secret, DB/dump, token, request body/PII. Log request ID hợp lệ.
  Hướng dẫn chia sẻ đi qua Git; cấu hình riêng đi theo ENV_HANDOFF, không qua chat.
- Cập nhật setup/ADR khi đổi hành vi hoặc cấu hình; cập nhật SESSION_STATE khi kết
  thúc gói/phiên, giữ phần việc teammate. Issue/PR giữ chi tiết nhiệm vụ; READINESS
  chỉ đổi khi gate có evidence mới. Không nối mãi nhiều bản tóm tắt trạng thái.
- Commit rõ phạm vi. Push/PR/merge/deploy theo quyền đã giao cho gói đang làm;
  không suy từ lần tích hợp trước. Quy tắc review người thật theo TEAMWORK vẫn áp dụng.
