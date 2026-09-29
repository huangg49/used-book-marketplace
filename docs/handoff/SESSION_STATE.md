# Điểm lưu để tiếp tục — 28/09/2026

## Đọc ngay

Chủ dự án yêu cầu lưu tiến trình, push an toàn và giao kế hoạch dài cho bạn tiếp
nhận dùng Claude. **Chỉ bàn giao nguồn; chưa chứng nhận release hay mua sách hoàn chỉnh.**
Kế hoạch: [CONTINUATION_PLAN](CONTINUATION_PLAN.md). Prompt:
[NEXT_SESSION_PROMPT](NEXT_SESSION_PROMPT.md). Setup: [START_HERE](START_HERE.md).

- Chủ dự án yêu cầu tích hợp nhánh `codex/handoff-roadmap` vào `main` để bàn giao;
  người nhận dùng `main` trên remote
  `https://github.com/huangg49/used-book-marketplace.git`.
- Mốc code UI mới nhất: `7211236`; báo cáo lỗi mở lại cuối: `3808b57`.
- Baseline nguồn F2h: `beea372`; checkpoint cũ
  `checkpoint/f2h-handoff-2026-09-28` được giữ nguyên.
- Commit của tài liệu bàn giao: lấy bằng `git log -1`; xác minh SHA nhánh remote
  theo lệnh dưới. Không suy ra đã push chỉ từ việc file này tồn tại.
- Chủ dự án cho phép merge trực tiếp mốc bàn giao này, thay quy trình PR/reviewer
  thông thường cho đúng lần tích hợp này. Không ghi đó là independent review hoặc
  release acceptance; các gate và review cho thay đổi nghiệp vụ tiếp theo vẫn còn.
- Không force push/sửa tag cũ. Chủ dự án chuyển env qua kênh riêng theo
  [ENV_HANDOFF](ENV_HANDOFF.md), không commit/export secret vào gói Git.

```sh
git ls-remote origin refs/heads/main
git rev-parse HEAD
```

## Phần đã xong

| Phạm vi | Hiện trạng / bằng chứng |
|---|---|
| Backend | F2h/OpenAPI 0.20.0, 17 migration; auth/listing/media/address/quote/Order/ví mô phỏng đến InTransit và review quá hạn. [START_HERE](START_HERE.md) phân biệt từng API/UI |
| Baseline QA | Clone sạch baseline: 127 unit, 480 API E2E, hai suite browser; [REBUILD](REBUILD.md). Đây là kết quả ở mốc đã ghi, không phải vừa chạy lại mọi test |
| Media native | Sửa launcher worker bằng Nest; JPEG qua Supabase thật trên Android đã có bằng chứng; không đồng nghĩa mọi ca native đều qua |
| Mobile vòng 1 | Thanh điều hướng, account/login, kệ và bộ lọc với footer cố định; [MOBILE_EXPERIENCE](MOBILE_EXPERIENCE.md) |
| Mobile vòng 2 | Kệ/chi tiết dùng chung presentation, ảnh dễ mở, thông tin gọn, mẫu riêng có attribution; [SHELF_DETAIL_REVIEW](SHELF_DETAIL_REVIEW.md) |
| QA vòng UI mới nhất | 61 RN unit/9 file, RN lint/typecheck, contract check, preview/normal export và RN browser regression qua; gate route mẫu qua |
| Native vòng UI mới nhất | Pixel_7/Android 15 x86_64: kệ, detail, modal/Back, chữ OS 130%; font đã trả về 1.0. JS qua Metro trên APK sẵn có, không build APK mới |
| Operations | Queue/detail, nhãn giá, retry/conflict/focus đã có evidence; không cần làm lại nếu không đổi code liên quan |

## Cập nhật 29/09/2026 — phiên tiếp nhận trên máy mới

| Mục | Trạng thái |
|---|---|
| Nhánh / base | `codex/a00-android-startup` từ `main` `382dda2`; chưa push/merge |
| A00 | **DONE** trên AVD `Medium_Phone` API 37 x86_64: cold start, `/`, deep link `/showcase` (nóng và cold), Back, reopen. Cơ chế: Metro watcher quá hạn khi build song song (`/status` vẫn running, bundle 500) và bundle đầu sau xóa cache ~103 s. Nguyên nhân ở máy cũ không kết luận chắc. [Evidence](A00_ANDROID_STARTUP.md) |
| Sửa kèm | `scripts/build-android.mjs` gọi `.\gradlew.bat` (chạy được khi `NoDefaultCurrentDirectoryInExePath=1`); ANDROID_QUALITY thêm cách kiểm bundle thật |
| Môi trường máy mới | Node 25.0.0 (≠ `.nvmrc` 24.15.0, vẫn thỏa engines), pnpm 11.19.0, JDK 21, Docker, Ninja 1.12.1 `.tmp/`. `.env` đủ biến (không ghi giá trị). DB Compose port 5433 mới, migrate + seed. `doctor:local` PASS |
| Test đã chạy | RN unit 61/61 PASS; `pnpm build:android --emulator` BUILD SUCCESSFUL; API `nest build` OK. Không chạy lại API E2E (backend không đổi) |
| A01 | **DONE** 29/09: kệ Android, login Member `member@latlai.local` trên Android (profile thật), operations `pnpm dev:admin` login Staff → queue listing rỗng đúng DB mới. Bucket Supabase private PASS (doctor, read-only); upload live sẽ chạy trong U02 |
| A02 | BLOCKED — cần reviewer người thật theo TEAMWORK; AI không ký thay |
| U01 | BLOCKED phần DONE — cần phản hồi thẩm mỹ thực tế của user |
| U02 | **DONE** trên `codex/u02-listing-form`: tab bước từ dữ liệu thật, footer lưu/tiếp tục trên bàn phím, cuộn tới lỗi đầu tiên, lỗi tự co khi sửa. RN 64/64, lint/typecheck, contract, browser regression 3 suite PASS; native Android create→upload thật→reject→resubmit, bàn phím, chữ 130% PASS. [Evidence](U02_LISTING_FORM.md) |
| U03 | **DONE** trên `codex/u03-address-book`: form nhóm + footer, mặc định phân biệt, hành động gọn, editor liệt kê mặc định trước. Browser regression 3 suite PASS; Android form/bàn phím số/2 địa chỉ/picker. [Evidence](U03_ADDRESS_BOOK.md) |
| U04 | **DONE** trên `codex/u04-my-books`: dòng sách có trạng thái, ghi chú từ dữ liệu thật và hành động kế tiếp duy nhất. RN 66/66, browser 3 suite PASS, Android list. Phát hiện: tab Sách của tôi theo session lúc login khi bị khóa sau đó (API vẫn chặn). [Evidence](U04_MY_BOOKS.md) |
| U05 | **DONE** trên `codex/u05-action-bar`: `core/ui/ActionBar` (dùng ở editor bài đăng + form địa chỉ, ví dụ trong `/ui`, UI_COMPONENTS cập nhật); `Screen.footer` cùng lề/max width với nội dung. RN 66/66, lint/typecheck, browser 3 suite PASS; Android footer thẳng hàng (`docs/verification/u05-footer-aligned.png`) |
| U06 | **DONE** trên `codex/u06-states-copy`: quét copy không có thuật ngữ backend; `formatVnd` một nguồn (`core/ui/format.ts`), bước Kiểm tra hiện giá như kệ. RN 68/68, browser 3 suite PASS, Android “85.000 ₫”. [Evidence](U06_STATES_COPY.md) |
| Q01 | IN_PROGRESS trên `codex/q01-native`: 29/09 PASS N01/N02/N07/N08/N11(JPEG+PNG)/N12/N13(mất mạng trước gửi)/N14/N15/N17/N18(trừ archive)/N19; PARTIAL N03/N16/N20; NOT_RUN N21 TalkBack, WebP. Sửa lỗi operations mở lại hồ sơ cũ trên `codex/ops-detail-reopen-fresh`. [Phiếu](NATIVE_RUN_2026_09_29.md) |
| Q02 | DONE cho phạm vi JS: không đổi native/tài nguyên nên APK `c5d55846…` (build 28–29/09 trên máy này) vẫn là artifact; Metro JS từ nhánh hiện tại. Export thường (preview=0) + `scripts/test-showcase-gate.mjs` PASS. ARM/iOS: N/A trên máy này (không có thiết bị/Mac), gate còn mở |
| Blocker cần người | U01 phản hồi thẩm mỹ của user; A02/R01–R09 reviewer người thật (tiền/quyền cần reviewer thứ hai); N21 TalkBack (bật dịch vụ trợ năng là thay đổi cài đặt hệ thống của thiết bị, để người thử thực hiện); ARM/iOS cần thiết bị |
| D01 | IN_PROGRESS trên `codex/d01-delivery-design`: ADR 0026 **Proposed** (actor×command, bảng chuyển trạng thái, deadline/time source, wire/dữ liệu dự kiến, ma trận test, 8 câu hỏi mở). Không code/migration. Cần reviewer tiền/quyền và chủ dự án chốt Q1–Q8 |
| Bước tiếp theo | Chờ người: phản hồi U01, review A02/R01–R09, chốt ADR 0026 Q1–Q8, TalkBack N21. Việc agent làm được tiếp khi có quyết định: D02 nháp claim/custody hoặc T01 sau khi ADR 0026 Accepted |

Process đang chạy (metadata): Postgres Compose app 5433 và test 55434 (`pnpm infra:test:stop` khi xong); API/worker từ `dist` qua
`start:prod`/`worker:*:prod`; Metro `pnpm dev:rn` port 8081; AVD emulator-5554
với reverse 8081/3000. Khảo sát lại trước khi dừng; không giết toàn bộ node/java.

## Lịch sử: phần dở trước phiên 29/09

**A00 — Android dừng splash sau lượt export cuối** (đã xử lý, xem trên). Trước đó cùng code đã chạy
và có ảnh QA. Sau force-stop/mở lại bằng `mobilereactnative:///showcase`, app đứng
ở logo. Metro port 8081 trả running; `adb reverse` 8081/3000 đúng. Log được đọc
không có ReactNativeJS/AndroidRuntime error; chưa biết nguyên nhân.

Một lệnh tiếp theo mở lại MainActivity và đọc bundle HTTP bị bộ duyệt tự động
chặn với lý do chung “blocked by policy”. Không thực thi và không lách chặn.
Người tiếp nhận kiểm môi trường/quyền của mình trước khi tiếp tục; không coi việc
đổi công cụ là cách vượt một chặn còn hiệu lực. Nếu vẫn bị chặn, ghi blocker và
chuyển sang công việc không phụ thuộc thao tác đó; không đánh dấu A00 hoàn thành.

Thông tin máy trước chỉ để chẩn đoán, **không hard-code khi chuyển máy**:

- Repo Windows: `C:\Users\ASUS\Documents\LaiLai\used-book-marketplace`.
- Android package: `com.huangg49.mobilereactnative`; AVD Pixel_7, emulator-5554.
- API 3000, Metro 8081; QA API 3009/media 3010/web 8087; Postgres test 55434.
- Metro/API/worker là process local đang có. Khảo sát lại owner/command trước khi
  dừng/restart; PID trong chat cũ không còn là căn cứ. Không giết toàn bộ node/java.
- Secret nằm ở `.env` local, không gửi trong chat/Git. Máy mới tạo `.env` từ setup
  và nhập key riêng qua kênh an toàn; chưa có key thì ghi rõ media test bị giới hạn.

## Chưa làm / không được hiểu nhầm

- Form đăng sách và địa chỉ vẫn cần chỉnh nhịp mobile; chưa hoàn tất thẩm mỹ toàn app.
- Native N01–N21 còn ca chưa chạy, TalkBack/iOS/ARM và independent R01–R09 còn mở.
- Chưa có wallet/checkout/Order/shipment/report UI; backend có không nghĩa là UI có.
- Chưa Delivered/Buyer receipt/inspection 72h, xử lý claim/review, trả sách,
  quyết toán Seller, rút tiền, reconciliation hằng ngày hay account lock/unlock UI.
- Chưa workflow Exchange/ViaPoint/auction; DEMO-A/B là mã vùng mẫu, không là hai điểm.
- Chưa đăng ký/email verification/password recovery hoàn chỉnh; không demo login
  bằng tài khoản seed như đã có onboarding người dùng mới.
- Kệ `/` có thể rỗng đúng dữ liệu. `/showcase` là ảnh tư liệu và dữ liệu mẫu có nhãn,
  không phải hàng đang bán; đừng publish các ảnh này để lấp kệ.

## Quy trình cập nhật điểm lưu

Sau mỗi gói: ghi ID, commit, file chính, test đã chạy/kết quả, bằng chứng native
nếu có, lỗi còn mở và đúng một bước tiếp theo. Không ghi test chưa chạy là PASS.
Không lặp full suite để tiêu thời gian; chỉ lặp gate khi có thay đổi/rủi ro liên quan.
Trước khi kết thúc phiên: `git status`, commit việc đã hoàn chỉnh và push nhánh đã
được chủ dự án cho phép; đối chiếu remote SHA. Việc chưa xong ghi rõ working tree.
