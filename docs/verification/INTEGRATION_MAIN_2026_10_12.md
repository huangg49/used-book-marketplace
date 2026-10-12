# Tích hợp giao diện Member với main — 12/10/2026

## Source và phạm vi

- Nhánh tích hợp: `codex/integration-main`, worktree riêng; candidate
  `codex/catalog-expansion` tại `30953d0`, main `53a2673`.
- WIP Chat/Notifications/MainLayout/Home CSS được checkpoint riêng
  `3dcda7a`; khảo sát `489fc75`; merge main `c8de21e`.
  Checkout chính và cấu hình/runtime/DB chính được bảo toàn.
- PR chứa toàn bộ chuỗi phát triển giao diện/auth/catalog trước đây, không chỉ
  commit catalog cuối. Khảo sát ban đầu: 98 candidate commit, 6 main commit.
  [Khảo sát trước merge](PREMERGE_CATALOG_2026_10_12.md) là báo cáo lịch sử;
  bằng chứng bên dưới là bản đã tích hợp.

## Kết quả tích hợp

Giữ giao diện Member, hero và auth hiện tại; giữ nguyên module exchanges và
ba migration exchanges của Đại so với main. Ghép registry/current schema và
schema tests để cùng giữ catalog, account recovery, OTP và exchanges.
OpenAPI0.34.0/generated types gồm134HTTP operation,23controller;
registry có22migration với ID đầy đủ khác nhau. Không đổi ID/checksum của
migration đã áp dụng. Hai test nâng cấp bắt đầu từ từng nhánh đã kiểm checksum,
schema cuối và chạy lại không tạo migration.

Client trao đổi dùng dữ liệu thật và đúng command contract: chọn một bản sách,
giá trị đổi/tiền bù do server kiểm; accept/reject/cancel/funding/ship/receive
dùng revision thực và Idempotency-Key. Kết quả chưa rõ giữ nguyên key/body
trong bộ nhớ, khóa thao tác khác và có nút thử lại; dữ liệu đọc mất công khai
không chặn việc xác nhận lại intent cũ. Không persist token hoặc intent.
401/403/404 không được thay bằng giao dịch demo. Không bịa rating, số giao dịch,
ngày giao nhận hoặc địa chỉ. Funding/ResolutionPending không bị coi là hoàn tất.

Trang tìm sách/chi tiết có lối vào gửi đề nghị thật, giữ cấu trúc giao diện.
Token màu cũ được ánh xạ trong phạm vi exchange; chat chưa hỗ trợ hiển thị
thông báo gọn. Các khối gợi ý tự động, chat/report/review/đề xuất lại chưa có
API được ghi rõ chưa khả dụng; không báo thành công giả.
Thêm User Web CI: lint/typecheck/unit/session/build và hai harness browser
trên Mongo QA riêng. Khôi phục kiểm tra Node trong launcher API.

## Kiểm tra trên source tích hợp

Windows, Node24.19.0/pnpm11.19.0, Chromium headless; Mongo replica set QA57017
và database `*_test`. Fake storage dùng cho harness browser; không là Supabase
live acceptance. Không seed/reset DB chính.

| Kiểm tra | Kết quả | Giới hạn |
| --- | --- | --- |
| Frozen install; contract generate/check/routes | PASS |134operation/23controller |
| API typecheck/build/unit | PASS |130unit |
| API full HTTP/Mongo E2E | PASS |620test/29file;18phút; gồm denial/replay/race |
| Mongo suite | PASS / SKIP |40PASS,4SKIP do không cấu hình PostgreSQL import/failover |
| Schema sau thêm hai đường upgrade | PASS |19test, gồm2case upgrade mới; trùng các case schema cũ |
| User web build/lint/unit | PASS |119test; lint0error/0warning; bundle warning đã biết |
| Session client | PASS |21test |
| Admin typecheck/unit | PASS |15test |
| RN typecheck/unit | PASS |122test; không là native acceptance |
| Dev launcher tests | PASS |15test |
| Exchange browser1366/390 | PASS |Create/accept/cancel, lost ACK giữ intent, funding rejection giữ dialog,403 ẩn dữ liệu; không overflow mobile |
| Shelf/detail/sell/purchase browser | PASS |Filter/cursor/empty/error/retry, login return/owner guard,5bước/giữ dữ liệu, upload/submit/purchase lost ACK;390px100/130%,320px130% |
| Docs / diff whitespace | PASS |356Markdown/2376relative links; diff check sạch |
| Remote CI / human review | NOT VERIFIED |Chỉ xác nhận khi có evidence từ PR |

Các lỗi selector của harness cũ đã được cập nhật theo nhãn hiện tại, control
radio có mặt nhãn riêng và hai danh mục cùng tên; giữ nguyên assert nghiệp vụ,
giữ kiểm submit/purchase lost-response và số aggregate/conversation thực.

## Giới hạn và bước tiếp

- API main hiện trả tối đa100exchange, chưa có cursor thực; tabs/count của
  web chỉ phản ánh tập trả về này. Không tuyên bố đã đọc toàn bộ lịch sử.
- API exchange chưa cung cấp snapshot sách/người tham gia sau khi listing
  ngừng công khai. UI nói rõ thiếu thông tin; không thay bằng sách mẫu.
- Safari, điện thoại thật/native, performance production, live storage và
  gửi Brevo thật không chạy lại trong gói tích hợp này.
- READINESS không đổi. Full suite PASS không tự đóng các gate nghiệp vụ.
- Push nhánh tích hợp/tạo PR để reviewer xem. Theo
  [TEAMWORK](../TEAMWORK.md), owner review, reviewer thứ hai cho tiền/quyền và
  CI PASS là điều kiện trước squash merge. Chưa merge/deploy.

Ảnh kiểm chứng:
[desktop](../../.impeccable/review/integration-main/exchange-proposal-desktop.png),
[mobile](../../.impeccable/review/integration-main/exchange-funding-mobile.png).
