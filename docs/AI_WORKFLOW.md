# Cùng phát triển Lật lại bằng AI

Mỗi thành viên chịu trách nhiệm về thay đổi mình gửi. Tài liệu giúp AI tìm đúng
quy tắc; test và review kiểm chứng kết quả, không bảo đảm tuyệt đối hết bug.

## Nhận dự án trên máy mới

1. Lấy đúng nhánh/SHA được nhóm bàn giao. Đọc [AGENTS](../AGENTS.md),
   [trạng thái](handoff/SESSION_STATE.md) và [gate](handoff/READINESS.md).
2. Dựng môi trường riêng theo [TEAM_WINDOWS](handoff/TEAM_WINDOWS.md). Không dùng
   đường dẫn, PID, database hoặc credential trong điểm lưu của máy khác làm cấu hình.
3. Mở AI tại root repository. Kiểm tra nó nhận đúng hướng dẫn theo bảng bên dưới.
4. Giao một nhiệm vụ có tiêu chí hoàn thành. AI đọc code/contract hiện tại và phần
   tài liệu liên quan; không cần chép lịch sử chat hoặc đọc mọi báo cáo cũ.

| Công cụ | Cửa vào và cách kiểm tra |
| --- | --- |
| Codex | `AGENTS.md`; ba skill ở `.agents/skills/`. Dùng `$latlai-ui`, `$latlai-api-mongo` hoặc `$latlai-verify-handoff` khi cần gọi rõ tên. Kiểm tra danh sách skill của phiên; mở lại phiên nếu chưa nhận thay đổi. |
| Claude Code | `CLAUDE.md` import `AGENTS.md`; `.claude/skills/` chứa ba adapter cùng tên. Kiểm tra `/context` và danh sách `/`; gọi `/latlai-ui` khi sửa UI. |
| Công cụ khác | Yêu cầu đọc `AGENTS.md`, rồi mở trực tiếp `SKILL.md` liên quan. Không mặc định nó tự nhận tên file hoặc cú pháp của Codex/Claude. |

Chỉ file được commit và có trên nhánh người nhận mới đi theo clone/pull. Skill cá
nhân, memory của AI, `.env` và lịch sử chat không phải tài liệu chung. Nếu có quy
tắc cá nhân làm khác quy tắc dự án, báo xung đột trước phần việc bị ảnh hưởng.
Không tự ghi đè cấu hình AI toàn máy hoặc cài plugin để nhận dự án.

Khi sửa skill, sửa nội dung ở `.agents/skills/<name>/SKILL.md`. Adapter Claude chỉ
giữ name/description và link đến nguồn; đổi tên/mô tả thì cập nhật cả adapter, chạy
`pnpm docs:check` để bắt lệch. Dùng file thường để clone trên Windows không cần symlink.

Cơ chế nạp: [Codex AGENTS](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[Codex skills](https://learn.chatgpt.com/docs/build-skills),
[Claude memory](https://code.claude.com/docs/en/memory),
[Claude skills](https://code.claude.com/docs/en/skills). Đối chiếu ngày 30/09/2026;
khả năng tự nạp còn phụ thuộc phiên bản/cấu hình công cụ của thành viên.

## Giao việc đủ rõ

Dùng [issue Feature](../.github/ISSUE_TEMPLATE/feature.yml) hoặc
[issue Bug](../.github/ISSUE_TEMPLATE/bug.yml). Cũng có thể gửi đoạn sau cho AI:

```text
Đọc AGENTS.md và tự khảo sát code/tài liệu liên quan trước khi sửa.
Nhiệm vụ / issue:
Người phụ trách; nhánh và base dự kiến:
Hành vi hiện tại → hành vi mong muốn:
Phạm vi được sửa / ngoài phạm vi:
Tiêu chí hoàn thành có thể quan sát:
Dependency, contract hoặc thiết kế liên quan:
Quyền push / PR / merge / deploy đã được giao:
Làm đến kiểm tra phù hợp và báo kết quả thực chạy. Nếu thiếu thông tin có thể
suy ra từ repo, tự tìm; chỉ hỏi phần quyết định/quyền truy cập thực sự còn thiếu.
```

Không cần người giao việc biết tên mọi file hoặc lệnh test. AI phải tìm chúng và
nêu ngắn gọn phạm vi, nguồn quy tắc, cách kiểm chứng trước khi sửa. Không biến mẫu
trên thành yêu cầu người dùng trả lời lại những điều đã rõ trong phiên.

## Ranh giới các phần

| Phần | Điểm vào / quy tắc |
| --- | --- |
| API | [Code map](handoff/START_HERE.md#3-tìm-đúng-nơi-để-sửa), [quy tắc theo miền](architecture/DOMAIN_RULES.md), OpenAPI; dùng skill API/Mongo. |
| React Native | `apps/mobile-react-native/src/features/`, `src/core/ui/`; UI rules/component/brand là nguồn chung. Dùng skill UI. |
| Member web | Hiện là Expo web của app RN. Kiểm tra responsive và keyboard trong browser; không tự tạo app/framework mới để làm một màn hình. |
| Admin/operations | [README của app](../apps/admin-web/README.md), feature review và core hiện có. Tái sử dụng component/CSS thực tế trong app; không import component RN vào DOM. |
| Flutter | [README](../apps/mobile-flutter/README.md), [kiến trúc đề xuất](../apps/mobile-flutter/ARCHITECTURE.md). Hiện là scaffold, cần xây từng lát cắt API thật; dùng cùng contract/brand, không coi tài liệu kiến trúc là code đã có. |

Không có người phụ trách được chỉ định sẵn cho các phần trên. Khi hai nhiệm vụ
cùng đụng contract, session hoặc component chung, chốt dependency và người tích hợp
trong issue/PR trước; không tự tạo API/token store/component riêng để tránh phối hợp.

## Kiểm tra theo thay đổi

Lệnh từ root, trừ Flutter. `<package>` là tên trong `package.json` của app/package
đang sửa; ví dụ `pnpm --filter @used-books/mobile-react-native lint`. Chỉ chạy
script có thật. Script và workflow trong repo là nguồn lệnh.

Trước chạy check, đối chiếu `node --version`/`pnpm --version` với `.nvmrc` và
root `package.json`. Nếu terminal dùng Node cũ, chọn runtime phù hợp đã cài rồi
chạy lại check bị ảnh hưởng; không bỏ qua engine warning hoặc tự sửa phiên bản
dự án. Ghi runtime thực chạy nếu môi trường vẫn bị chặn.

| Thay đổi | Kiểm tra cần chọn |
| --- | --- |
| Chỉ docs/hướng dẫn AI | `pnpm docs:check`, `git diff --check`; đọc lại đường tiếp nhận. Không chạy lại toàn API/native khi không đổi code. |
| Checker docs/CI docs | Thêm `node --test scripts/check-agent-docs.test.mjs` và kiểm cấu hình workflow; ghi rõ local PASS khác remote CI PASS. |
| API hoặc contract | `pnpm contract:check`, `pnpm contract:routes`; lint/typecheck/test/build của `@used-books/api`; E2E liên quan. Sửa quyền/session/transaction cần ca từ chối, replay và race phù hợp. |
| Mongo validator/index/transaction | Kiểm tra API ở trên và `pnpm test:api:mongo`; migration mới và invariant liên quan. Test import/failover khi thay đổi chạm các cơ chế đó. |
| RN hoặc Expo web | lint/typecheck/test của `@used-books/mobile-react-native`; export khi thay đổi ảnh hưởng bundling. Thao tác màn thật trên nền tảng bị ảnh hưởng. Đổi native dependency/config/resource cần native build. |
| Admin | lint/typecheck/test/build của `@used-books/admin-web`; browser suite khi thay đổi review/session/command và thao tác UI liên quan. |
| Shared session | `pnpm --filter @used-books/session-client test` và kiểm tra consumer bị ảnh hưởng. |
| Flutter | Trong `apps/mobile-flutter`: `dart format --output=none --set-exit-if-changed .`, `flutter analyze`, `flutter test`; chạy trên thiết bị/emulator phù hợp. |

QA database riêng và lệnh E2E theo [START_HERE](handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app).
Không chạy hai suite cùng database; không chạy harness ghi/xóa dữ liệu trên DB/bucket
local chính. Ghi `PASS / FAIL / NOT RUN / BLOCKED` cùng lệnh, source, môi trường và
giới hạn. Test bỏ qua không được tính là PASS.

## Những gì được máy kiểm và những gì còn cần người

- RN ESLint đã chặn một số import control trực tiếp và literal màu trong route/feature;
  không kiểm được mọi kiểu styling hay chất lượng bố cục. Xem
  [config thực tế](../apps/mobile-react-native/eslint.config.js).
- [CI sản phẩm](../.github/workflows/) chạy theo path filter; docs job chạy mọi PR
  để bắt cả việc xóa source còn được docs dẫn đến. RN CI export bundle, không chạy
  nghiệm thu Android. Flutter có workflow nhưng không chứng minh parity.
- `docs:check` kiểm link file Markdown nội bộ và tính đồng bộ cửa vào/skill adapter.
  Không xác nhận nội dung nghiệp vụ, anchor, URL ngoài, UI đẹp hoặc AI luôn tuân thủ.
- PR phải ghi kiểm tra thực chạy, ảnh/video UI khi có thay đổi hiển thị và rủi ro.
  Review theo [TEAMWORK](TEAMWORK.md); AI hỗ trợ không ký thay reviewer người thật.
- Có workflow CI không có nghĩa GitHub đã bắt buộc check trước merge. Chưa xác minh
  branch protection trong gói này; chỉ chủ repo/người được giao cấu hình mới thay nó.

## Điểm lưu khi nhiều người cùng làm

Trạng thái chi tiết của nhiệm vụ nằm ở issue/PR: owner, branch/base, commit, việc
xong, test thực chạy, blocker và bước tiếp. Dùng [mẫu PR](../.github/pull_request_template.md).
Không tạo một báo cáo mới cho mọi lần chạy test hoặc chép log dài vào tài liệu.

[SESSION_STATE](handoff/SESSION_STATE.md) là điểm lưu chung, cập nhật khi kết thúc
gói/phiên có thay đổi đáng kể. Mỗi người chỉ sửa mục thuộc phần việc của mình,
đọc/giữ thay đổi của teammate; không ghi đè cả file từ bản cũ. Máy riêng ghi local
notes trong `.tmp/`, không đưa PID/secret của mỗi máy thành hướng dẫn chung.
READINESS chỉ đổi khi có evidence mới đóng/mở gate; không suy từ một PR merge.
