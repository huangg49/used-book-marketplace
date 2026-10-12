# Kiểm chứng dựng lại nguồn F2h

> Báo cáo dựng lại checkpoint ngày 28/09, không là setup runtime main hiện nay.
> Máy nhận mới dùng [START_HERE](START_HERE.md) và [TEAM_WINDOWS](TEAM_WINDOWS.md);
> giữ các lệnh/bằng chứng dưới đây để tái hiện đúng source lịch sử.

Ngày 28/09/2026. Commit nguồn được kiểm tra:
`beea372386b27b4dd9dd4324b6cfbdeb082ce3f1`.
Các cập nhật sau commit này chỉ hoàn thiện hồ sơ bàn giao, không đổi runtime.
Mốc tiếp nhận nguồn: `checkpoint/f2h-handoff-2026-09-28` trên nhánh
`codex/f2h-handoff-audit`. Đây là checkpoint để tiếp tục làm việc, không là release
đã đóng mọi gate native/review. Dùng `git rev-parse checkpoint/f2h-handoff-2026-09-28^{commit}`
để đọc commit chứa hồ sơ cuối.

## Cách dựng lại

Clone bằng `git clone --no-local --single-branch --branch codex/f2h-handoff-audit`
từ Git repository vào thư mục mới `.tmp/handoff-clean`. Clone chứa file đã commit,
không chép `.env`, database, `node_modules`, dist, generated Prisma hoặc `.expo`
từ checkout đang phát triển. Dependency được cài lại; pnpm dùng cache package
trên máy. Đây là kiểm chứng checkout sạch trên **cùng máy Windows**, không phải
claim đã kiểm trên máy của người khác hoặc runner Linux/iOS.

Môi trường: Node 24.19.0 (repo yêu cầu >=24.15.0), pnpm **11.19.0**,
Docker PostgreSQL 17. Lần install đầu tự nhận pnpm 11.25.0 từ PATH; đã chạy lại
install frozen lockfile và toàn bộ chuỗi kiểm tra với đúng pnpm 11.19.0.

- `setup:local` tạo các env local mới và secret ngẫu nhiên; không đưa khóa Supabase
  thật vào clone. Template mật khẩu seed chỉ dành local.
- Compose dùng project riêng `latlai-handoff-clean`, volume mới, loopback port 55435.
  `usedbooks_test` nhận đủ 17 migration từ database rỗng và seed bốn account local.
- API E2E dùng `usedbooks_test`. Browser dùng DB riêng `usedbooks_browser_test`
  trên cùng container, schema ngẫu nhiên mới cho mỗi runner; fixture tự áp dụng
  migration và dọn schema. Vì vậy browser không tranh fixture auth với API suite.
- Browser dùng Nest/PostgreSQL/Sharp thật và storage fake. Không có upload provider
  thật trong kiểm chứng này; không tuyên bố toàn bộ app đã đủ cấu hình production.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Install frozen lockfile, pnpm 11.19.0 | PASS |
| Tạo env mới, generate Prisma, migrate DB rỗng, seed local | PASS |
| OpenAPI generated types + route audit | PASS, 0.20.0 / 72 operations / 14 controllers |
| Workspace lint + typecheck | PASS |
| Unit tests | PASS, 127: API 33 / session 20 / RN 61 / operations 13 |
| API + operations production build | PASS |
| RN web export với fixture URL và design preview | PASS |
| Operations browser | PASS, gồm permissions, conflict/lost-ack, reason/checklist, ảnh private và responsive |
| RN browser | PASS, gồm shelf/listing/address/lifecycle, dirty Back, LOCKED/RESTRICTED và `/ui` chữ lớn |
| Tạo lại PNG icon từ SVG/token bằng `brand:app-icons` | PASS, không tạo Git diff |
| API E2E | PASS, 480/480 trong 22 files, 471,32 giây |

Log cục bộ nằm ở `.tmp/handoff-clean-*.log`, không là dependency của bản bàn giao.
Screenshot của hai browser suite ở thư mục `apps/*/test-results` trong clone.
Các cảnh báo pg query concurrency và Expo force-exit sau export vẫn còn; các
assertion và exit code quyết định pass/fail. Không xóa warnings để làm đẹp báo cáo.
Checkout kiểm thử không có Git diff sau các lệnh. Container QA riêng được dừng
sau khi kiểm xong; không xóa volume và không dừng database/API đang dùng của project.

## Cách nhận nguồn khi chưa push

Một Git bundle chứa branch và checkpoint tag có thể chuyển cho người nhận, không
cần chia sẻ thư mục làm việc hoặc `.env`. Bundle là nguồn đã commit cùng lịch sử,
không bao gồm database, dependency, APK hay credentials local.

```sh
git clone --branch codex/f2h-handoff-audit ./latlai-f2h-source.bundle latlai
cd latlai
git switch -c codex/native-acceptance
```

Sau đó làm theo [START_HERE](START_HERE.md). `origin` của bản clone từ bundle là
đường dẫn bundle local, chưa phải remote GitHub; team tự cấu hình remote được phép.
Không coi bundle hoặc tag local là đã push/merge vào repository chung.

## Gate còn mở

Android debug x86_64 đã build ở workspace gốc với tài nguyên mới; không có build
Android/iOS mới trong clone này. Runtime native bị chặn tại khởi động Metro ở lượt
QA trước. Xem [UI_POLISH](UI_POLISH.md) và [READINESS](READINESS.md).
SQL/money/permissions vẫn cần reviewer độc lập theo TEAMWORK. Không có release
production, luồng mua hàng hoàn chỉnh, hay bằng chứng native acceptance đầy đủ.
