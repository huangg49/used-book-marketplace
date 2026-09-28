# Sổ địa chỉ và vùng phục vụ demo

27/09/2026 · OpenAPI0.9.0 · working tree `codex/member-address-book`, chưa commit.
[ADR0014](../adr/0014-member-address-book.md) · F0 của [nền giao dịch](TRANSACTION_FOUNDATION_PLAN.md).

## Đã triển khai

- Account → **Sổ địa chỉ** trên RN: xem/thêm/sửa, chọn mặc định, xác nhận xóa,
  loading/rỗng/lỗi, lỗi từng ô, nội dung dài, cảnh báo rời form chưa lưu.
- Sáu endpoint: GET `/service-areas`, GET/POST `/me/addresses`, PUT
  `/me/addresses/{addressId}`, POST hậu tố `/default` và `/archive`.
- Tối đa10 địa chỉ, một mặc định khi còn dữ liệu. Địa chỉ đầu tự mặc định; xóa
  mặc định chọn địa chỉ lưu sớm nhất còn lại. Xóa cuối giữ version của sổ.
- Member chỉ đọc/ghi sổ mình. Restricted được quản lý sổ; role vận hành không đọc hộ.
  Receipt/audit chỉ lưu ID/version, không sao chép tên/điện thoại/chi tiết.
- Contract-first và generated types; migration thứ7 có FK, partial unique index,
  deferred quota/default constraints, owner lock. Không đổi lịch sử migration cũ.
- Retry giữ key/body; sau acknowledged chỉ GET; conflict giữ nội dung nhập cho tới
  khi người dùng chủ động bỏ để xem dữ liệu server, không tự ghi đè phiên bản mới.

HCM-DEMO-v1 và DEMO-A/B có nhãn mô phỏng. **Không phải danh mục phường/xã thật**,
không chứng minh địa chỉ ngoài đời, không là hai điểm giao sách. Chưa có admin
quản lý địa bàn, bản đồ, geocoding hoặc giao hàng. Chưa nối address với listing.

## Bằng chứng chạy

Windows, Node24.19.0/pnpm11.19.0, PostgreSQL local55432, DB `_test`, schema riêng,
full migration. Đã khởi động lại DB kiểm thử riêng đang tắt; không reset DB chung,
đổi credential/.env hoặc ghi bucket thật. Fixture tự dọn schema của mình.

| Kiểm tra | Kết quả |
|---|---|
| Unit workspace |105pass: API18, session14, RN60, operations13;9ca RN mới |
| API E2E |Full127pass; sau đó thêm1ca delete/default race và suite address14/14pass. Tổng coverage128ca, phân biệt hai lần chạy |
| Address HTTP/DB |CRUD/quota/default, quyền, Restricted, validation/region, replay sau delete, SQL constraints, audit rollback, role/session/Locked sau lock wait |
| RN browser |Create lost-ack replay, default, conflict giữ form, delete lost-ack/promote, mở lại;320px chữ lớn và tên dài không tràn ngang |
| Browser hồi quy |Listing journey/shelf/lifecycle và operations review qua; Nest/PostgreSQL thật, storage ảnh giả |
| Checks/build |Contract check, lint, typecheck, build API/operations; JS export web/Android/iOS |
| Android debug |Build x86_64 thành công3phút34giây,338tasks; chưa là kiểm thử runtime |
| DB/API ứng dụng local |PostgreSQL17 Docker tại5433;7migration/checksum khớp; login demo, directory, sổ rỗng, no-store,401/403 và readiness qua |
| Preflight local sau triển khai |`pnpm doctor:local` qua; Supabase bucket private/size-bounded xác minh read-only, không phải upload mới |

APK SHA256: `046FA8C3B1B8F85CA376C29008724F56CF3160417EF6074297B88642E1140BE8`.
Debug binary không chứa JS bundle; cùng hash với build trước là bình thường khi
chỉ thay TypeScript, không chứng minh giao diện mới đã chạy trên thiết bị.

Race xác nhận wait chain bằng `pg_blocking_pids` trước khi mở gate, không chỉ hai
Promise. Kiểm book version, số địa chỉ/default, receipt/audit sau commit. Trigger
failpoint cố tình trả500 để chứng minh rollback. Cảnh báo pg concurrent query và
dependency Android deprecated/path vẫn xuất hiện; build/test không thất bại vì chúng.

Ảnh dữ liệu thử: [sổ320px](../verification/addresses-320.png),
[form](../verification/addresses-form.png). Đã xem ảnh thực tế; shared controls không
đổi API nên `/ui` không cần component mới. Test browser nằm trong
[address journey](../../scripts/test-address-journey.mjs), gọi từ suite public shelf.

## Cài đặt và chạy lại

Không cần dịch vụ cloud/khóa mới. Chạy `pnpm db:generate` và `pnpm db:migrate` trên môi
trường cần nâng cấp, dùng DATABASE_URL đúng của môi trường đó. Migration mới
`20260927000000_member_address_book` thêm dataset demo, không tự tạo địa chỉ cá nhân
hay gán sách cũ vào TP.HCM. Không dùng `db push` hoặc reset để thay migration.

Lượt tiếp tục ngày27/09 đã xử lý môi trường ứng dụng: lúc đầu Docker tắt nên5432
trả ECONNREFUSED; sau khi mở Docker, container của dự án khác chiếm5432 và cấu hình
Lật lại trả28P01. Không dừng hay sửa database dự án đó. Đã tạo container
`used-book-marketplace-postgres-1` và volume riêng `used-book-marketplace_postgres_data`
tại5433, áp đủ7migration và đối chiếu checksum thành công.

Compose hỗ trợ `POSTGRES_PORT` tùy chọn (mặc định5432). Máy này dùng5433 trong root
`.env`; chỉ đổi port của DATABASE_URL ở root và `apps/api/.env`, giữ credential và
khóa cloud. Scripts/hướng dẫn dùng `--env-file .env` để Compose đọc đúng cấu hình.
Bản cấu hình trước đổi port nằm trong `.tmp` bị Git ignore. Đây là database phát
triển mới, **không nhập dữ liệu từ các database preview/test cũ**. Đã chạy seed bốn
tài khoản demo bằng DEV_SEED_PASSWORD đã cấu hình; không đổi mật khẩu tài khoản cũ.
Sổ địa chỉ và dữ liệu sách trong database mới chưa có dữ liệu người dùng.

Build API mới và khởi chạy tại3000. Smoke HTTP với DB ứng dụng xác nhận readiness,
login member, danh mục demo, sổ rỗng version0, no-store, khách401 và staff403; logout
các session kiểm tra, không ghi địa chỉ thử vào sổ demo. `pnpm doctor:local` qua cả
checksum và kiểm bucket Supabase read-only. Media worker chưa được khởi chạy trong
lượt này. Contract check và `git diff --check` cũng qua sau thay cấu hình.

```powershell
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
# TEST_DATABASE_URL trỏ DB riêng có hậu tố _test.
pnpm test:api:e2e
pnpm build
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3009/api/v1'
pnpm --filter @used-books/mobile-react-native export:all
pnpm test:public:browser
pnpm --filter @used-books/admin-web test:browser
Remove-Item Env:EXPO_PUBLIC_API_BASE_URL
pnpm build:android --emulator
```

Hai browser suites chạy tuần tự (cùng3009/3010); Edge dùng PLAYWRIGHT_CHANNEL=msedge.
CI đã thêm path script mới, chưa xác nhận GitHub Actions từ xa. Android script chỉ
build, không mở emulator/Metro; debug APK cần Metro. Không coi export iOS là native build.

## Giới hạn và tiếp theo

Chưa kiểm sổ địa chỉ với bàn phím/Back/font scale/TalkBack trên Android. Metro từng
bị automatic approval review chặn ở lượt trước; đợt này không thử vượt chặn. iOS
native chưa build/test. Không lấy QA `/ui` trước đây thay QA feature này.

Form/intent chỉ trong bộ nhớ; kill app mất phần chưa lưu. Địa chỉ đã lưu ở PostgreSQL;
web reload cần login lại vì token memory-only. `/archive` xóa khỏi sổ live, giữ
receipt ID/version để retry; Order snapshot thực chưa có vì giao dịch chưa triển khai.
Các CM-AC reservation vẫn Planned, không được đánh đạt từ address tests.

Tiếp theo: **fulfillment của listing** — nơi gửi, version/vùng và phương thức giao
nhận gắn revision; kiểm tra khi address đổi/xóa, duyệt lại khi điều kiện đổi. Sau đó
mới quote và Order giữ/hủy/hết hạn; chưa thanh toán/ship/đổi/đấu giá ở increment này.
