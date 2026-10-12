# Khảo sát trước push/merge — 12/10/2026

**Kết luận: có thể push nhánh để review; chưa nên merge main.** Chỉ khảo sát,
không sửa product code, tích hợp, push, tạo PR, merge, deploy hoặc đổi DB.

## Source và phạm vi

- Candidate: `codex/catalog-expansion`, HEAD `30953d0`.
- Sau `git fetch origin`: main `53a267365f771896b2978c1b8600f84c9f537c92`,
  đã nhận backend đổi sách qua PR32. Base chung `dec19b3`.
- Main có6 commit riêng; candidate có98 commit riêng. Diff candidate so với
  base gồm886 file,43967 dòng thêm/5438 dòng xóa, bao gồm các gói UI/auth/account/
  auction trước catalog. Không phải PR chỉ có64 file của commit catalog cuối.
- Khảo sát tập trung khả năng tích hợp, contract, migration, build và commands;
  không là audit bảo mật/nghiệp vụ toàn bộ98 commit.

## Các điểm chặn tích hợp

### P1 — Bốn conflict thực tế

`git merge-tree --write-tree --name-only --no-messages HEAD origin/main`
trả exit1, không thay checkout:

- `apps/api/src/database/mongo/documents.ts`
- `apps/api/src/database/mongo/migrations/index.ts`
- `apps/api/test/mongo/schema.mongo-spec.ts`
- `docs/handoff/SESSION_STATE.md`

Giữ cả collection/validator/migration auth/catalog và exchanges; không chọn
ours/theirs toàn file. Các prefix0016–0018 trùng số nhưng **full migration ID
khác nhau**, không phải duplicate ID. Giữ ID/checksum đã áp dụng; không sửa hoặc
đổi tên migration cũ để làm đẹp thứ tự. Khi tích hợp, kiểm upgrade từ cả trạng
thái DB của main lẫn nhánh này trên QA riêng. Môi trường tích hợp cần migrate và
bootstrap quyền application role hiện có cho collection mới; không seed/reset.

### P1 — Git tự ghép được web nhưng TypeScript không đạt

Virtual TypeScript host trên clean HEAD, thay đúng ba file web tự merge từ main
(`services/exchange.ts`, `services/exchangeDetail.ts`,
`lib/mock/exchangeCompose.ts`), báo13 lỗi:

- `exchange.ts:54,109` và `exchangeDetail.ts:34`: `SessionClient` không có
  `.session`; API hiện có là `getSnapshot()`.
- `exchangeDetail.ts:94,105,116,127,138`: gọi `z.any()` nhưng không import `z`.
- `exchangeDetail.ts:56,59,60,63,64`: shape partner/book/shipping không khớp UI.

Đây là kiểm tra compatibility của các file tự merge, **không phải build toàn bộ
bản merge**, vì bốn conflict chưa được giải quyết. Sửa hết dấu conflict chưa đủ.

### P1 — Commands đổi sách không đáp ứng contract và che lỗi

Source main `exchangeDetail.ts:92–145`: cancel/accept/reject/ship/receive thiếu
`Idempotency-Key`, cố định version/revision ở1; catch chỉ log rồi resolve.
`exchangeCompose.ts:71` trở đi cũng POST không có command key. API
`command-http.ts:19` bắt buộc UUID header; `SessionClient.request()` không tự
thêm header này. Hiện tại, khi sửa lỗi compile, request vẫn có thể bị từ chối,
nhưng `ActionCard.wrapAction()` đóng modal vì Promise đã resolve.

Phải lấy version/revision thật, giữ command key/body khi retry, parse receipt,
propagate lỗi và chỉ phản hồi thành công sau ACK. Kiểm đường từ chối, replay và
race trước merge. Không tự mở rộng quyền/gate workflow.

Ngoài ra `getExchangeDetail()` bắt mọi lỗi rồi trả mock (kể cả ID không có), và
adapter hardcode rating5/giao dịch10/địa chỉ mẫu. Cần tách preview có nhãn khỏi
dữ liệu thật; 401/403/404/503 không được biến thành giao dịch mẫu trông hợp lệ.

## Phạm vi và kiểm soát cần chốt

- **P2 — CI thiếu user-web:** không thấy workflow chạy build/test/typecheck
  `apps/user-web`; admin/RN/API CI không kiểm chứng web. Thêm kiểm tra web vào
  CI tích hợp. Chưa xác minh remote CI: GitHub checks tool yêu cầu kết nối tài
  khoản. AI survey không thay human review theo TEAMWORK.
- **P2 — WIP chưa commit:** MainLayout, ChatPage, Home CSS, NotificationsPage,
  hai CSS mới và evidence Chat được bảo toàn. Push HEAD không mang các thay đổi
  này; không dùng `git add .` để gom chúng vào gói catalog. Chốt riêng phạm vi
  Chat/Notifications trước khi muốn main giống toàn bộ runtime đang xem.
- Contract YAML tự ghép có0.34.0/134operations và generated types tương ứng;
  chưa phát hiện drift ở phép kiểm này. Chạy generate/check/routes lại sau
  giải quyết conflict. Candidate riêng có125operations.
- Quét các mẫu credential cụ thể trong HEAD/history delta không có match;
  `.env` không tracked. Đây không phải chứng nhận không còn mọi loại secret.
  Không có added blob vượt100MB; lịch sử thêm khoảng75.4MB gồm nhiều UI/evidence.

## Kiểm tra thực chạy trên checkout sạch HEAD30953d0

Node24.19.0/pnpm11.19.0; install offline frozen lockfile PASS. Worktree review
không có tracked changes và không dùng DB chính cho test.

| Kiểm tra | Kết quả |
| --- | --- |
| User-web build (gồm TypeScript) | PASS; cảnh báo bundle lớn |
| User-web unit | PASS111 test |
| User-web lint | PASS0error/6warning có sẵn |
| API/admin/RN typecheck | PASS cả3 |
| Session-client unit | PASS21 test |
| Contract check/routes | PASS0.34.0/125operations/22controllers |
| Docs check trước cập nhật báo cáo | PASS353Markdown/2369links |
| Docs check sau cập nhật báo cáo/điểm lưu | PASS355Markdown/2371links ở checkout chính |
| Git diff whitespace | PASS |
| Virtual merge web compatibility | FAIL13 TypeScript errors |
| Non-mutating merge-tree | CONFLICT4files |

API/Mongo/financial E2E, browser/native và toàn bộ build/test **bản merge**
NOT RUN trong lượt khảo sát này. Evidence catalog trước đó ở
[catalog-v2](../../.impeccable/review/catalog-v2/README.md) chỉ chứng minh source
của gói đó; không chứng minh source sau tích hợp exchanges.

## Thứ tự xử lý đề xuất

1. Tách/chốt WIP; tạo checkpoint có phạm vi rõ trước tích hợp.
2. Tích hợp main trong checkout/nhánh riêng, union bốn conflict và contract.
3. Sửa adapter/commands đổi sách; loại fallback dữ liệu giả khi API lỗi.
4. Bổ sung user-web CI và chạy checks trên **SHA tích hợp cuối**; QA Mongo riêng
   cho migration/schema/auth/catalog/exchange và các invariant bị ảnh hưởng.
5. Push/tạo PR theo quyền được giao, reviewer người thật kiểm diff và CI rồi
   mới merge. Không cherry-pick riêng commit catalog cuối mà bỏ dependencies.
