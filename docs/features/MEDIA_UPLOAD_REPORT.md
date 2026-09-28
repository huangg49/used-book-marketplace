# Báo cáo triển khai ảnh riêng tư và bản nháp

Ngày kiểm tra: 26/09/2026. Contract: **OpenAPI 0.5.0**.

## Phạm vi đã triển khai

- Bảy owner-media operation có handler thật: tạo upload intent, danh sách/chi tiết,
  cấp ticket, nhận binary, finalize và cấp link đọc ảnh đã xử lý.
- NestJS giữ xác thực, phân quyền và DB nghiệp vụ. Supabase Storage là kho object
  private; DB chỉ giữ metadata, trạng thái, quyền sở hữu và reservation.
- Adapter Supabase hỗ trợ server secret/legacy service-role, kiểm tra bucket private,
  giới hạn file và ghi create-only. Thiếu cấu hình trả lỗi, không tự dùng mock.
- Worker Sharp riêng, durable job PostgreSQL, lease/heartbeat, tối đa ba lần thử và
  fencing để worker hết lease không ghi đè kết quả. Xác minh hash/kích thước, giải mã
  JPEG/PNG/WebP, bỏ metadata, xuất WebP tối đa 1600 px và 2 MB.
- Input tối đa 10 MB; tối đa tám media đang hoạt động/bản nháp, 20 intent/giờ/member,
  hai upload đồng thời/API process. Reservation mặc định 800 MB; cleanup giữ ảnh được
  revision tham chiếu và chỉ giải phóng dung lượng sau khi xóa object thành công.
- React Native: Account → **Bản nháp của tôi**, tạo/mở nháp, lưu mô tả, chọn ảnh,
  tải ảnh, theo dõi trạng thái và xem ảnh bằng link ngắn hạn. Dùng session owner,
  TanStack Query và UI library hiện có. Có cảnh báo thay đổi chưa lưu và lỗi tại chỗ.

Chi tiết: [ADR 0008](../adr/0008-free-private-media-storage.md),
[contract](LISTING_DATA_CONTRACT.md), [API index](LISTING_API_INDEX.md).

## Bằng chứng tự động

| Kiểm tra | Kết quả | Giới hạn bằng chứng |
|---|---|---|
| API unit | 14/14 đạt | Gồm Sharp và adapter HTTP mock; không phải Supabase thật |
| API E2E | 55/55 đạt | HTTP + PostgreSQL thật trong DB `_test`; 13 ca media dùng TestStorage |
| React Native unit | 26/26 đạt | Gồm retry upload, response bị mất và kiểm tra ticket path |
| Typecheck toàn workspace | Đạt | Không thay thế chạy trên thiết bị |
| Contract check | Đạt | YAML hợp lệ, generated types đồng bộ |
| Lint toàn workspace | Đạt | Không có lỗi lint |
| Build API/admin | Đạt | Admin còn cảnh báo bundle >500 kB |
| Expo export Android/iOS/web | Đạt | Chỉ bundle, chưa native build/install |
| Business docs check | Đạt | 160 local links; 33 snapshot lịch sử giữ nguyên |

Media E2E kiểm tra quyền sở hữu/role/account/session; ticket gắn phiên; upload bị
thay bytes, quá cỡ, hết hạn; rollback khi audit lỗi; idempotency; quota race;
claim job đồng thời; lease hết hạn và worker cũ; retry có giới hạn; thu hồi quyền
trong lúc storage đang ghi; cleanup retry và giữ media còn được tham chiếu.
Các bài test adapter riêng kiểm tra bucket public bị từ chối, credential header,
create-only, đối chiếu duplicate object, đọc có giới hạn và signed URL.

Kiểm thử đồng thời phát hiện sai lệch lease do timezone phiên PostgreSQL local.
DatabaseService, seed và các pool test được đặt UTC; bài test đo khoảng lease
50–60 giây bằng `now()` trong DB để giữ hồi quy. Không thay timezone của DB dùng chung.
Suite E2E còn cảnh báo deprecation của `pg` về query đồng thời trên cùng client;
không có bài test thất bại. Cần xử lý trước khi nâng major `pg`.

## Kiểm tra giao diện web

Chạy Expo web export trên loopback 8082 với API local 3000 và database `_test`.
Tài khoản, bản nháp và ảnh kỹ thuật 8×8 đều là dữ liệu kiểm thử cục bộ.

- Đăng nhập, mở nháp, sửa mô tả, lưu, trở về danh sách và mở lại: dữ liệu được giữ.
- Chọn ảnh khi không có cấu hình Supabase: hiển thị lỗi và nút thử lại, không mất mô tả.
- Rời khi có sửa đổi: hiện xác nhận; chọn quay lại giữ nguyên phần chưa lưu.
- Kiểm tra bố cục tại 390×844 và 320×740: chữ/nút xuống dòng trong vùng nội dung.

Đây là kiểm tra web; chưa xác minh picker/keyboard/large text trên Android/iOS.

## Xác minh Supabase thật — 26/09/2026

`media:check` và `media:probe` **đã đạt trên Supabase thật**, dùng server secret,
bucket private, không đổi gói dịch vụ. Probe ghi/đọc một ảnh kỹ thuật, đối chiếu
bytes qua signed URL, kiểm tra public read bị từ chối và xóa object probe thành công.

Đã sửa hai cấu hình sai: Project URL chứa đuôi `/rest/v1/` được đổi về origin;
giới hạn bucket 10 MiB (10.485.760 byte) được giảm về 10.000.000 byte theo contract.
CLI được bổ sung tên biến thiếu, bước kiểm tra thất bại và object probe cần dọn
nếu cleanup lỗi; không in credential, signed URL hay lỗi thô từ provider.

Đã chạy từ giao diện web qua **API thật → Supabase thật → worker riêng → ảnh Ready
→ lưu nháp → mở lại nháp**. Ảnh thử là ô màu kỹ thuật có EXIF, không phải ảnh sách
hay bằng chứng xác thực hàng hóa. Kết quả đối chiếu lúc 21:27 giờ Việt Nam:

| Thuộc tính | Kết quả |
|---|---|
| Input | PNG 2400×1800, 60.957 byte |
| Output | WebP 1600×1200, 3.482 byte |
| Metadata | Không còn EXIF/ICC |
| Worker | Ready ngay lần xử lý đầu; job hoàn tất |
| Bản nháp | Media có trong revision hiện hành; mở lại hiển thị ảnh |
| Reservation | 64.439 byte, đúng tổng input + output |
| Signed read | HTTP 200, hash khớp object đã xử lý |
| API chưa đăng nhập | HTTP 401 |
| Public object URL | HTTP 400, không trả ảnh |

Sau sửa CLI: 14 API unit + 13 media E2E đạt, API lint/typecheck/build và contract
check đạt. Các E2E tự động vẫn dùng TestStorage; bằng chứng provider thật là luồng
riêng ở trên. Một input và một derivative được giữ để xem lại bản nháp kiểm thử.
Xem [setup](SUPABASE_MEDIA_SETUP.md) để lặp lại probe.

Kiểm tra giao diện phát hiện Checkbox hiện dấu tích nhưng web không xuất
`aria-checked`. Đã khai báo trạng thái ARIA trực tiếp bên cạnh accessibilityState,
cập nhật mẫu checked/disabled trong `/ui`. Thay đổi này không đổi lựa chọn media
trong DB. Sau web export mới, DOM bản nháp trả `aria-checked=true` cho ảnh đã chọn
và `false` cho ảnh chưa chọn; accessibility snapshot nhận đúng trạng thái checked.
RN typecheck/lint và 26 unit test đạt. Native accessibility vẫn cần kiểm tra riêng.

## Phần phải xác minh tiếp

**Cập nhật 27/09/2026:** APK Android debug x86_64 đã build thành công, cài và mở
catalog UI trên AVD Pixel_7 / Android 15. Xem [báo cáo Android](../ANDROID_QUALITY.md).
Đây chưa phải kiểm thử upload native: picker, quyền thư viện ảnh, background/
foreground, mạng gián đoạn và khôi phục phiên vẫn cần kiểm tra trên thiết bị thật.
iOS chưa build/chạy. Expo export chỉ xác minh bundle, không thay cho các kiểm tra này.

Runtime kiểm thử hiện tại dùng PostgreSQL cục bộ cổng 55432, DB tên kết thúc `_test`,
thông qua biến môi trường của tiến trình. `DATABASE_URL` trong `.env` không bị đổi;
khởi động demo thông thường vẫn cần PostgreSQL đúng cấu hình đó. Không dùng DB thử
nghiệm này làm môi trường sản phẩm hay lưu dữ liệu thật.

Giới hạn sản phẩm hiện tại:

- Màn hình của mốc media ban đầu chỉ có mô tả/ảnh. Cập nhật 27/09:
  [form RN đầy đủ và gửi duyệt](RN_LISTING_SUBMISSION_REPORT.md) đã triển khai.
- Cập nhật 27/09: [gửi duyệt, moderation và reviewer media read](LISTING_REVIEW_API_REPORT.md)
  đã có API và form RN; public shelf/media tiếp nối ở [báo cáo kệ](PUBLIC_SHELF_REPORT.md).
- Retry upload giữ intent trong bộ nhớ khi màn hình còn mở; chưa có hàng đợi upload
  bền vững qua lần tắt app. Nháp đã lưu vẫn ở DB; ảnh Pending bỏ dở được cleanup.
- Chọn được ảnh Pending/Processing trong nháp không có nghĩa ảnh đã sẵn sàng công khai.
- Xử lý ảnh chỉ kiểm tra dữ liệu kỹ thuật; không chứng minh ảnh chụp thật hay sách thật.
- Ngân sách reservation quản lý object của ứng dụng, không đo egress hay file do người
  vận hành tải trực tiếp. Theo dõi quota Free trên dashboard theo hướng dẫn setup.
- API/worker/database chạy local phù hợp demo miễn phí; chưa phải vận hành 24/7.

Các workflow point/auction/shipping/ledger vẫn planned theo SRS 1.1.

## Bổ sung bàn giao 28/09/2026

Phạm vi planned ở phần lịch sử trên không mô tả toàn bộ backend hiện hành;
xem [mốc F2h](../handoff/START_HERE.md) cho Order/shipment/ledger đã triển khai.
[Vòng Android thực tế](../handoff/NATIVE_RUN_2026_09_28.md) đã kiểm hủy picker,
chọn JPEG → upload Supabase thật → Sharp Ready → preview → lưu/mở lại nháp.
Session restore/API offline/logout cũng đã kiểm trong phạm vi ghi ở báo cáo.
Còn PNG/WebP, lỗi upload/mạng, background và hành trình listing đầy đủ trên native.

Đã sửa `worker:media` từ tsx sang Nest CLI để biên dịch dependency metadata trước
startup; lệnh cũ lỗi tại DatabaseService. API lint/typecheck, 33 unit và contract
check qua; worker đã xử lý ảnh thật. Không sửa API contract hoặc migration.
