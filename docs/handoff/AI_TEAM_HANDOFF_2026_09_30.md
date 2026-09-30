# Bộ hướng dẫn AI cho nhóm — 30/09/2026

Nhánh `codex/team-ai-handoff`, base `19ffb84` của gói docs-navigation-cleanup;
main MongoDB là `1be5144`. Commit subject của gói này:
`docs(ai): add shared team skills and verified onboarding workflow`.
Hai gói docs/AI chưa push/merge tại điểm lưu này. Quyền tích hợp gói MongoDB trước
không tự mở rộng sang gói này. Không đổi code sản phẩm, contract hay dữ liệu runtime.

## Kết quả

- [AGENTS](../../AGENTS.md) rút từ 183 xuống 84 dòng; các quy tắc theo miền chuyển
  sang [DOMAIN_RULES](../architecture/DOMAIN_RULES.md), giữ invariant và tài liệu dẫn.
  [CLAUDE](../../CLAUDE.md) import cùng nguồn thay vì giữ mô tả trạng thái riêng.
- [AI_WORKFLOW](../AI_WORKFLOW.md) hướng dẫn công cụ, ranh giới client, giao việc,
  check theo diff, review và cách nhiều người cập nhật điểm lưu.
- Ba skill nguồn trong `.agents/skills/`: UI, API/Mongo, verify/handoff. Ba adapter
  `.claude/skills/` dẫn đến nguồn chung; file thường dùng được khi clone trên Windows.
- Mẫu issue/PR bổ sung phạm vi/dependency, owner và kết quả check thực chạy. README,
  TEAM_WINDOWS và prompt tiếp nhận dẫn đến workflow. START_HERE bỏ đường clone/SHA
  lịch sử bị gọi là hiện hành; Flutter architecture ghi rõ là thiết kế cho scaffold.
- [Checker](../../scripts/check-agent-docs.mjs) và [Documentation CI](../../.github/workflows/docs-ci.yml)
  kiểm link file Markdown và name/description/link của adapter. Job chạy mọi PR để
  bắt source bị xóa mà docs còn dẫn tới; không cần pnpm install/database.

## Kiểm tra thực chạy

Parent dùng bundled Node 24.19.0/pnpm 11.19.0 trên Windows:

| Kiểm tra | Kết quả / phạm vi |
| --- | --- |
| `node --test scripts/check-agent-docs.test.mjs` | 5/5 PASS; link tương đối/encoded name, fenced example, malformed encoding, adapter lệch/orphan và import trong code fence |
| `pnpm docs:check` | PASS: 155 Markdown, 1.111 link file tương đối; ba cặp skill/adapter hợp lệ |
| `quick_validate.py` của skill-creator, từng folder | 6/6 PASS (ba skill và ba adapter), UTF-8 |
| `pnpm contract:check` | PASS; generated types hiện hành, không đổi API |
| Node syntax và YAML parse | PASS checker/test script và docs workflow/Feature template |
| RN ESLint probe qua stdin, không ghi source app | Hai lỗi dự kiến được chặn: import Text trực tiếp và literal màu trong feature; exit 1 là kết quả đúng của ca từ chối |
| `git diff --check` | PASS |

Không chạy lại API E2E/native acceptance vì gói này chỉ đổi hướng dẫn, mẫu và checker.
Remote CI chưa chạy; branch protection chưa xác minh/thay đổi. Checker không kiểm
anchor, URL ngoài, nội dung nghiệp vụ hoặc bảo đảm AI tuân thủ mọi hướng dẫn.

## Phép thử AI mới không có lịch sử chat

Một subagent `fork_turns=none` chỉ nhận vị trí repository và nhiệm vụ: sửa form mẫu
bị xóa tên khi save lỗi, báo success sớm và gửi trùng khi bấm nhanh. Chỉ được ghi
output trong `.tmp/ai-onboarding/`, không truy cập secret/DB/network hoặc sửa app.
Hai câu hỏi phụ: checks của PR docs-only và đề nghị payout Seller từ InTransit.

Kết quả parent đã đọc/đối chiếu:

- Tìm AGENTS → skill UI → UI rules/components/brand và code component thật.
- Dùng AppText/TextField/Button/Notice và token chung; giữ tên khi lỗi, success sau
  await, busy/ref guard chặn hai lần gửi cùng tick; mock được ghi rõ là mẫu.
- Nhận đúng checks docs-only, giữ gate/SRS đối với payout; không tự triển khai thêm.
- Agent báo typecheck snippet với module thật, ESLint feature và harness hooks/JSX
  trong bộ nhớ đều PASS. Harness dùng mock, không mount React/native. Parent đọc
  output, không coi đây là acceptance UI native hay review người thật.
- Agent phát hiện Node terminal 24.12.0 thấp hơn engine >=24.15.0 khi chạy docs:check;
  báo warning trung thực. Workflow được bổ sung bước đối chiếu runtime trước check;
  parent checks dùng runtime phù hợp như bảng trên.

Input/output/RESULT.md được giữ local trong `.tmp/ai-onboarding/` (ignored), không
đưa form mẫu vào sản phẩm. Lần refresh context của parent đã liệt kê đủ ba skill
repository trong catalog Codex: discovery có bằng chứng trên máy này. Chưa chạy
Claude Code để kiểm import/adapter tự nạp, chưa kiểm trên máy teammate hoặc AI khác.

## Tiếp nhận và phần còn mở

Nhóm nhận đúng nhánh có cả dependency docs `19ffb84` và gói này, dùng
[AI_WORKFLOW](../AI_WORKFLOW.md) / [TEAM_WINDOWS](TEAM_WINDOWS.md), xác nhận AI đọc
đúng cửa vào và nhận một issue cụ thể. Tài liệu chưa lên remote thì pull main chưa
nhận được gói này. Owner vẫn cần giao người phụ trách và reviewer theo TEAMWORK.

[READINESS](READINESS.md) giữ các gate hiện có: native đầy đủ, TalkBack/ARM/iOS và
review người thật còn mở. Không mở Delivered/inspection/settlement hoặc đóng gate
chỉ vì phép thử onboarding/CI docs đạt.
