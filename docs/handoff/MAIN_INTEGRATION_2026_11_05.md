# Đồng bộ nhánh phát triển với main —05/11/2026

Owner yêu cầu cập nhật nhánh local theo main mới nhất, giữ thay đổi riêng, hỏi
nếu conflict không rõ ý định và chạy test/build. Thực hiện tại worktree phát triển
`integrate-exchange-main/used-book-marketplace`, nhánh
`codex/member-web-wallet-summary-read-states`. Không cập nhật checkout demo.

## Nguồn và bảo toàn

- Local trước merge: `57dcf7f25d0018ba73221a2ed69bf0e8362f1cb1`, working tree sạch.
- `git ls-remote origin refs/heads/main` và fetch xác minh remote tại
  `ef7091e1e24eeff186eb0db3329a4682aa4f0e63` (PR96). Kiểm lại trước chốt vẫn cùng SHA.
- Local87 commit riêng, incoming24 commit. Merge không rebase/reset/squash, giữ
  toàn bộ ancestry hai phía. Backup ref `codex/backup-before-main-20261105-57dcf7f2`.
- Checkout demo vẫn nhánh `codex/demo-receipt-local-20261103`, HEAD `5bd0b360`,
  40 tracked thay đổi và14 file untracked. Lưu fingerprints trước/sau cho cả54
  file trong evidence ignored; không stash/copy/checkout/pull hoặc chạy build tại đó.
- Không push/PR/merge remote/deploy, migration/seed/DB/provider hoặc bật app demo.
  Incoming migration0060/0061 là source từ main; không thực thi hay sửa checksum.

## Giải9file conflict

| File | Cách ghép và ý định được bảo toàn |
| --- | --- |
| Flutter `app_widgets.dart` | Giữ formatting/main ngoài SearchField; giữ đầy đủ StatefulWidget/State, viền wine,140ms và callback local. So sánh token vùng search với local, chỉ khác whitespace/trailing comma |
| Flutter `auth_screens.dart` | Main format lại; giữ11 focusedBorderColor wine local theo focus policy, không đổi text/auth |
| Member `WalletHistory.tsx` | Giữ numbered pagination/focus/error/cache local; thêm filter rút, mã RÚT, state badge và refund labels từ main |
| Member `WalletPage.module.css` | Giữ responsive geometry local; thêm badge withdrawal và các rule containment không chồng quyết định kích thước. Không sửa animation/keyframes/duration |
| Member `WalletPage.tsx` | Giữ loading/error ký quỹ local và flow rút tiền main. Chỉ hiện Chờ rút khi summary đọc thành công, không show số cache sau lỗi |
| `auction-stage.mjs` | Dùng bản main mở panel filter và assert expanded; giữ assertions hành vi |
| `order-chat-workspace.mjs` | Giữ main GET profile/session fixtures, tương thích shared avatar/session reads |
| `SESSION_STATE.md` | Giữ cả checkpoint local và withdrawal/main, thêm mốc tích hợp rõ source/evidence |
| `openapi.yaml` | Giữ version0.74.1 incoming cùng các route local; regenerate types theo YAML, không sửa generated tay |

Các conflict có ý định rõ từ diff, focus policy, ADR0073 và checkpoint; không có
quyết định nghiệp vụ mới hoặc chỗ cần owner chọn một trong hai hành vi đối nghịch.
OpenAPI sau ghép có257operations/39controllers (bao gồm route lịch sử chat local).

## Kiểm tra thực chạy

PASS:

- `pnpm test`: session151, API419, RN224, Admin229, Member419 =1442 unit tests.
- `pnpm typecheck`: API/Admin/Member/RN.
- `pnpm build`: API/Admin/Member; Admin bundle check đạt. Member còn warning
  chunk login-flight>500kB đã có, không cắt animation để xóa warning.
- `pnpm lint`: exit0, còn advisory React/hooks có trong source hiện có.
- `pnpm contract:generate`, `pnpm contract:check`, `pnpm contract:routes`.
- `test:wallet-summary-read-states:browser`:10profile390/1440, gồm loading,
  initial/cached error, zero/nonzero, Chờ rút15.000, Requested history filter,
 11rows qua trang2/về1. Cached error ẩn cả withdrawalHeld; chỉ synthetic HTTP.
  Bổ sung ca vào harness local hiện có để kiểm đúng giao điểm conflict.
- `test:wallet-layout:browser`:5profile320/390/768/1440, chữ125%, focus/dialog,
  history filter; sheen8000ms và frames0/0.8/1 còn nguyên.
- `test:auction-stage:browser`:390/1440 filter/Back/cache/error/ảnh lỗi.
- `test:order-chat:browser`: exact order room/private details/roles/retry,
  messages/history/shipping/mobile320/390 chữ130%, fixture cô lập.
- `pnpm test:web-motion`:5checks Member/Admin-Staff/Expo web, cả reduce/no-preference;
  không gọi API/DB. `pnpm docs:check`, `git diff --check`.

Evidence ignored `.tmp/main-integration-2026-11-05/` (log từng lệnh và dấu kiểm
demo), wallet captures ở `.tmp/member-web-wallet-summary-read-states/`, layout
ở `.tmp/member-web-wallet-layout/`, chat ở `.tmp/order-chat-workspace-qa/`.
Các harness frontend dựng server fixture tạm và teardown, không dùng DB local.

NOT RUN: Flutter format/analyze/test/build — không có flutter/dart trong PATH,
không tìm thấy SDK ở các thư mục công cụ đã kiểm; không tự cài SDK. Flutter chỉ
đối chiếu source conflict, không claim Dart/native PASS. Không chạy Mongo/E2E
ghi DB, ngân hàng/provider, RN export/native build, nghiệm thu người thật hay
remote CI của merge local. Không suy unit/browser fixture thành nghiệm thu rút
tiền thật, không đổi READINESS. Các gate còn mở vẫn theo tài liệu hiện hành.

Merge commit có subject `merge: integrate latest main while preserving local web improvements`.
Đây là tích hợp local; local main ref và checkout demo không được chuyển nhánh.
