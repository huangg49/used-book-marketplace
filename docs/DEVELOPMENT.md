# Chạy Lật lại để phát triển

Chạy lệnh ở root repo. Node theo `.nvmrc`, pnpm theo `packageManager`; Docker
Desktop dùng Linux containers. `node --version` trong terminal phải đạt yêu cầu,
không chỉ cài một phiên bản mới ở nơi khác.

## Cài lần đầu

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
docker compose --env-file .env -f infra/docker-compose.yml up -d --wait mongo
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed
```

Setup giữ `.env` có sẵn. Bootstrap/migrate/seed là bước rõ ràng, không chạy ngầm
trong lệnh dev. Máy đã có dữ liệu không làm lại setup để chữa lỗi. Khi pull có
migration mới, áp dụng `pnpm db:migrate` có chủ đích trước chạy phiên bản mới.
Nếu migration thêm collection, chạy lại `pnpm db:bootstrap` để cập nhật quyền
app theo ADR/migration; không reset hoặc seed lại để chữa thiếu quyền.
Mỗi teammate dùng database và storage dev riêng theo
[TEAM_WINDOWS](handoff/TEAM_WINDOWS.md).

Android cần Android Studio/SDK, JDK và Ninja theo
[ANDROID_QUALITY](ANDROID_QUALITY.md#build-apk-debug-cục-bộ). Build/cài development
APK một lần cho emulator x86_64:

```powershell
pnpm build:android --emulator
adb install -r apps/mobile-react-native/android/app/build/outputs/apk/debug/app-debug.apk
```

Mở emulator trước `adb install`. APK mới có `expo-dev-client` để Expo mở đúng app
Lật lại bằng phím A. Không dùng APK cũ thiếu module đó. Chỉ rebuild khi đổi native
dependency/plugin/resource; sửa JSX/TypeScript thông thường cập nhật qua Metro.

## Chạy hằng ngày

Mở Docker Desktop. Terminal thứ nhất:

```powershell
pnpm dev:api
```

Lệnh kiểm Node/env/cổng/lock, bật riêng MongoDB bằng đúng cấu hình local, chờ API
ready rồi chạy worker ảnh và worker đơn hàng trong cùng terminal. Chỉ một compiler
Nest; worker dùng bản đã build. Log có nhãn `[api]`, `[media]`, `[orders]`.
Ctrl+C dừng cây tiến trình do launcher tạo; Docker/database và chương trình khác
giữ nguyên. Không tự bootstrap/migrate/seed, giết tiến trình chiếm cổng hoặc đổi `.env`.

Terminal thứ hai cho Android hoặc Member web:

```powershell
pnpm dev:rn
```

Bấm **A** mở emulator/app Android đã cài; **W** mở Expo web. Có thể chạy thẳng
`pnpm dev:rn --android`, `--web`, `--clear` hoặc `--port 8082` khi cần. Lệnh vẫn
giữ terminal tương tác của Expo, không tự khởi động backend hay build APK.

Người làm admin dùng `pnpm dev:admin` ở terminal thứ hai và mở
`http://localhost:5173`. Không cần chạy RN/Flutter khi chỉ làm admin.

Người làm React/Vite user-web dùng `pnpm dev:user` và mở `http://localhost:5174`.
App này khác Expo web. `setup:local` chưa tạo env user-web; nếu thiếu, tạo từ
`apps/user-web/.env.example`, giữ file đã có. `VITE_API_BASE_URL` trỏ API phù hợp;
backend `CORS_ORIGINS` cần đúng origin5174 (preview4174 nếu dùng). Secret backend
không đưa vào biến VITE.

API mặc định `http://localhost:3000/api/v1`. Launcher RN lấy shared URL public
trong `.env`; khi host là `localhost`, Android emulator dùng `10.0.2.2` cùng cổng,
web/iOS giữ shared URL. URL `127.0.0.1` tường minh (ví dụ QA dùng adb reverse)
được giữ nguyên. Có thể cấu hình riêng:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_API_BASE_URL_ANDROID=http://10.0.2.2:3000/api/v1
EXPO_PUBLIC_API_BASE_URL_WEB=http://localhost:3000/api/v1
```

Điện thoại thật dùng URL LAN tin cậy cho Android và chạy Expo với `--lan`:

```powershell
pnpm --filter @used-books/mobile-react-native exec expo start --dev-client --lan
```

Không đưa server secret vào biến public. CORS phải khớp origin web thực tế.
Upload ảnh cần Supabase riêng theo [media setup](features/SUPABASE_MEDIA_SETUP.md).
Thiếu storage thì login/xem dữ liệu vẫn chạy, upload chưa sẵn sàng.

## Khi có lỗi

- Node quá cũ: đổi Node theo repo, mở terminal mới. Launcher báo trước khi bật app.
- Port API/Metro đang được dùng: dừng terminal của chính bạn hoặc chọn cổng khác;
  launcher không tự giết process. Mongo port bị Windows chặn: chọn port trống trong
  root `MONGO_PORT` và đồng bộ port của ba `MONGODB_*` URL API; giữ project/volume/DB.
- API không ready: xem log `[api]`; kiểm cấu hình DB/migration bằng
  `pnpm doctor:local`. Không reset hoặc seed lại để ép chạy.
- Launcher tiếp tục kiểm kết nối HTTP sau khi API ready. Nếu HTTP mất liên tục
  45 giây (kể cả Nest watcher còn sống), launcher dừng cây tiến trình của mình
  rồi khởi động lại API và hai worker, tối đa ba lần trong một phiên. Khoảng
  reload ngắn hoặc HTTP 503 do DB chưa ready không kích hoạt restart. Lỗi build/
  startup và worker thoát vẫn dừng launcher để xem log; không tự migrate/seed.
  Windows dùng tùy chọn Nest `useProcessExit` sau shutdown hooks để tránh
  `kill ENOSYS` khi Node không hỗ trợ gửi lại tín hiệu POSIX.
- Sau khi sửa code worker: Ctrl+C và chạy lại `pnpm dev:api`; API có watch,
  worker hiện không hot reload. Không bật thêm `dev:media`/`dev:orders` khi bundle
  dev đã chạy hai worker này. Các lệnh riêng giữ cho debug có chủ đích.
- QA/remote backend dùng lệnh riêng `pnpm --filter @used-books/api start:dev` và
  cấu hình đúng môi trường; `dev:api` dành cho Mongo local của Docker Compose.

Kiểm thử dùng database `*_test` trên replica set riêng theo
[START_HERE §5](handoff/START_HERE.md#5-chạy-kiểm-thử-mà-không-dùng-database-của-app).
`pnpm test:dev` kiểm launcher bằng fixture process/port, không cần DB/Docker/secret.
Redis/Mailpit là profile tùy chọn, không được bật bởi luồng dev mặc định.
