# Chọn skill UI cho Lật lại

Theo yêu cầu chủ dự án24/10/2026, `latlai-ui` được bỏ và thay bằng hai skill
upstream đã ghim phiên bản. Impeccable vẫn giữ nguyên engine/playbook hiện có.
Nguồn canonical ở `.agents/skills/`; `.claude/skills/` chỉ chứa adapter trỏ về
nguồn chung, không nhân bản script hoặc dữ liệu. Các skill đi theo Git của dự án,
không thay cấu hình Codex toàn máy.

## Chọn theo việc đang làm

| Skill | Khi dùng | Nguồn đã khóa |
| --- | --- | --- |
| [ui-ux-pro-max](../../.agents/skills/ui-ux-pro-max/SKILL.md) | Tìm hướng dẫn UX, accessibility, layout, typography, interaction hoặc stack của client đang sửa; hỗ trợ web/RN/Flutter | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/d14efff8ed1faa4187f004f79926f428c8074ec7/.claude/skills/ui-ux-pro-max), MIT |
| [design-taste-frontend](../../.agents/skills/design-taste-frontend/SKILL.md) | Art direction, composition và refinement web; phân biệt trang đọc/cuộn với màn thao tác như Search, Wallet, Chat và Admin | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill/tree/6010f91a9935f1c167dfc500fb1a475681892e6b/skills/taste-skill), Taste v2 mặc định, MIT |
| [impeccable](../../.agents/skills/impeccable/SKILL.md) | Các lệnh design/critique/refine/audit đã có trong [workflow](IMPECCABLE_WORKFLOW.md) | Giữ revision/engine hiện có trong lock của skill |

Theo yêu cầu owner24/10, khi làm UI web, kết hợp cả ba: UI/UX Pro Max cho UX và
hướng dẫn theo stack, Taste cho art direction/composition, Impeccable cho
critique/refine/audit và kiểm chất lượng. Chỉ đọc reference, chạy search/helper
phù hợp phạm vi; sửa nhỏ không tự thành redesign hoặc audit toàn app.
Dùng API/Mongo hoặc verify/handoff cho các phần công việc tương ứng. Taste không
cài toàn bộ các biến thể v1/GPT/style/imagegen trên website, không là hướng dẫn
native RN/Flutter; UI native kết hợp Pro Max và Impeccable theo nền tảng.

## Bối cảnh dự án ưu tiên hơn mặc định upstream

Đọc [AGENTS](../../AGENTS.md), [PRODUCT](../../PRODUCT.md), [DESIGN](../../DESIGN.md),
[UI rules](UI_CODING_RULES.md), [components](UI_COMPONENTS.md) và
[brand](../../packages/brand/v1.1/README.md) trước khi sửa UI. SRS/ADR/OpenAPI và
phạm vi được giao quyết định nghiệp vụ; skill không cấp quyền mở gate hoặc sửa API.

- Sửa đúng client được giao. RN dùng `src/core/ui`, routes compose feature;
  web/Admin dùng component/CSS của app đó. Không thêm client/framework/UI library
  chỉ vì gợi ý trong search hoặc template.
- Refinement giữ identity, nội dung thật và component hiện có. Không tự sinh
  design system mới thay DESIGN, palette/font hoặc đổi light/dark. Khi dùng Taste
  draw để đề xuất trong brand hiện có, chọn `--keep palette,type`; chỉ thay toàn
  bộ visual direction khi người dùng giao redesign tương ứng.
- Motion theo yêu cầu owner11/10 trong AGENTS: giữ animation đã thiết kế kể cả
  `prefers-reduced-motion`; giữ viewport/visibility/cleanup/Back và tối ưu mobile.
  Các khuyến nghị reduced-motion hoặc số lượng animation tối thiểu của upstream
  không tự thay quyết định này hoặc mở rộng một chỉnh sửa nhỏ.
- Giữ API/session/owner và retry key/body/version hiện có; không báo mutation
  thành công trước ACK. Không bịa endpoint, số dư, rating, trust badge hoặc lịch sử
  để lấp template. Mock chỉ khi được yêu cầu rõ và gắn nhãn.
- Kiểm loading/empty/error/retry/pending; giữ input khi lỗi, nhãn accessibility,
  focus/keyboard, safe area/Back/chữ lớn và nội dung dài. Thay component chung
  phải xem consumer và cập nhật ví dụ UI liên quan.
- Chọn kiểm tra theo [AI_WORKFLOW](../AI_WORKFLOW.md#kiểm-tra-theo-thay-đổi).
  Thao tác thật trên nền tảng đổi; web export/browser không thành native PASS.
  Thiếu helper/browser thì ghi NOT RUN và dùng công cụ được cấp cho phần có thể
  kiểm; không sửa requirement hoặc che finding để đạt điểm detector.

## Chạy helper từ root repository

UI/UX Pro Max cần Python3; helper chỉ tìm dữ liệu local, không cần API key hoặc
package Python ngoài. Ví dụ tìm một vấn đề cụ thể:

```powershell
python .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus modal" --domain ux
python .agents/skills/ui-ux-pro-max/scripts/search.py "form validation" --stack react
```

Taste cần Node22+ cho helper; inspector cần Chrome/Edge/Chromium. Không chạy
browser helper ngoài các công cụ được môi trường cấp. Khi chạy draw có ghi file,
đặt `--out .tmp/taste-skill` và `TASTE_SKILL_HISTORY` về file trong `.tmp/` để giữ
history riêng cho dự án; không đưa dữ liệu riêng vào brief/search.

```powershell
node .agents/skills/design-taste-frontend/scripts/draw.mjs --sector ecommerce --brief "used book marketplace" --keep palette,type --options 3 --out .tmp/taste-skill
```

`--options` chỉ đề xuất, không áp thiết kế vào UI. Không dùng `--persist`/`--force`
để ghi đè brief hoặc master hiện có ngoài phạm vi. File sinh mặc định `.taste-skill/`
được Git ignore; assets tải về vẫn phải được kiểm nội dung/license trước sử dụng.

## Pin và cập nhật

Mỗi skill mới có `upstream.lock.json`: repo, full commit, source path, license,
hash file gốc và hash những file đã thích nghi. Chỉ đổi frontmatter/preamble,
đường dẫn helper UI/UX Pro Max và whitespace đã ghi; không sửa ngầm engine/data.
Hai LICENSE được giữ trong từng thư mục. Khi cập nhật, chọn revision cụ thể,
review diff và chạy lại validator, docs check cùng smoke helper liên quan.

Skill mới có thể dùng từ lượt tiếp theo. Nếu catalog còn hiện `latlai-ui` cũ hoặc
chưa thấy tên mới, mở lại chat/Codex để nạp danh sách; docs check không chứng minh
host đã tự discover skill.
