# Prompt tiếp nhận Lật lại cho AI/chat mới

Cập nhật 09/10/2026, source khảo sát main `da59199`. Dùng cùng
[context đầy đủ](PROJECT_CONTEXT.md) và [inventory kỹ thuật](PROJECT_CONTEXT_INVENTORY.md).
Nếu chat mới đọc được repo, chỉ cần gửi prompt dưới đây. Nếu không đọc được repo,
gửi thêm hai file context; AI chỉ được suy từ snapshot và cần source bổ sung khi sửa.

```text
Tiếp nhận Project Lật lại — used-book-marketplace. Giao tiếp bằng tiếng Việt.

Trước tiên kiểm git status/branch/log/remote, giữ local work và stash; không
reset/clean/checkout đè hoặc tự phục hồi nhánh WIP. Tìm repo thực tế trên máy nhận.
Đọc AGENTS.md; docs/handoff/PROJECT_CONTEXT.md, PROJECT_CONTEXT_INVENTORY.md,
SESSION_STATE.md và READINESS.md. Bản context là snapshot09/10/2026 ở main da59199,
không mặc định branch/remote/environment hiện tại vẫn ở phiên bản đó.

Nền sản phẩm: mua/bán/đổi từng bản sách cũ, TP.HCM, tiền/carrier mô phỏng,
hai điểm HCM-DEMO-01/02. RN là client Member ưu tiên; main còn có Expo web,
React/Vite user-web riêng và admin-web; Flutter là scaffold. API NestJS dùng
MongoDB replica set/official driver; SQL migrations giữ để import lịch sử.
Ở snapshot: OpenAPI0.30.0, 15 migration Mongo, 113 operation HTTP.

Main có catalog/listing/media/review/shelf/addresses/quotes, DirectDelivery tới F2h,
ví mô phỏng, wishlist, purchase conversation/chat giữ sách24h, auction/point Order,
realtime và inbox auction. Purchase chat không là Order/payment/settlement.
Exchange web, register/profile và dashboard admin còn mock/scaffold từng phần.

Đặc biệt: READINESS/AGENTS và tài liệu cũ chặn nghiệp vụ sau F2h/settlement, nhưng
source ViaPoint auction đã có inspection/claim/return và worker settlement.
Context mục10 liệt kê khác biệt code/gate, quyền LOCKED, trạng thái merge và
kiến trúc Member web. Không suy code merged là đã được nghiệm thu/đóng gate,
không tự sửa nghiệp vụ hoặc chạy worker trên DB chính để chứng minh khác biệt.

Nguồn nghiệp vụ: docs/SRS_V1_1.md + docs/features/LOCAL_HANDOVER_AUCTION.md.
Contract: packages/api-contract/openapi.yaml; generated schema không sửa tay.
Trước sửa DB/tiền/quyền đọc ADR0027, model map và DOMAIN_RULES phần liên quan.
Giữ auth hiện tại trước replay, owner/eligibility/state, lock order/transaction,
expectedVersion/key/body/receipt theo từng command, immutable ledger và commitment.
Browser tokens memory-only; native chỉ persist refresh token qua SecureStore.

Setup/code map: START_HERE/TEAM_WINDOWS/DEVELOPMENT/ENV_HANDOFF. Node>=24.15.0,
pnpm11.19.0; kiểm runtime thật. Chạy hằng ngày dev:api + client phụ trách:
dev:rn (A/W), dev:admin hoặc dev:user. Không tự migrate/seed/reset chỉ để tiếp nhận.
QA replica set/database *_test và bucket riêng; không dùng DB/bucket local chính.
Không đọc/in/commit token, password, DB dump, body/PII hoặc cấu hình .env thật.

Chọn skill repo theo nhiệm vụ: latlai-ui, latlai-api-mongo, latlai-verify-handoff.
UI theo DESIGN/UI_CODING_RULES/UI_COMPONENTS/brand1.1, dữ liệu API thật,
giữ lỗi/form/Back/keyboard/safe area/chữ lớn; không tạo rating/số dư/claim badge giả.
Chọn checks theo diff trong AI_WORKFLOW. Báo PASS/FAIL/NOT RUN/BLOCKED và skip rõ;
không coi browser fake là Supabase thật, export là native hoặc AI review là human.

Nhiệm vụ của lượt tiếp nhận: hiểu context, nêu ngắn gọn trạng thái và điểm cần
xác minh cho nhiệm vụ kế tiếp. Chỉ triển khai feature khi chủ dự án giao cụ thể;
CONTINUATION_PLAN không tự cấp quyền bỏ gate. Một feature/nhánh; giữ phần việc
teammate, update SESSION_STATE phần mình. Push/PR/merge/deploy theo quyền gói mới.

Nhiệm vụ cụ thể tiếp theo (nếu đã được giao): [dán yêu cầu và acceptance ở đây].
```

Không gửi cấu hình riêng trong prompt; chuyển theo [ENV_HANDOFF](ENV_HANDOFF.md).
Review tiền/quyền theo [TEAMWORK](../TEAMWORK.md). Remote CI và review tại main
mới chưa được xác minh trong phiên thu thập; kết quả cũ phải gắn source của chúng.
