# Kiểm chứng hồ sơ, Admin account và giỏ sách — 01/11/2026

Owner duyệt kiểm thực tế sau ba gói local. Nhánh
`codex/member-acceptance-verification`, base/business source
`5e179691c02e1dc17c67458d47bd1fb2877befa4`; subject
`test(qa): verify member schema upgrades and real private avatar storage`.
Không thay API business/contract/dependency/env, không push/PR/merge/deploy.

| Phạm vi | Kết quả | Giới hạn |
|---|---|---|
| Nâng schema tương ứng main → ba gói | PASS1 integration | Dữ liệu legacy synthetic trong QA `_test`, không copy hoặc migrate DB chính |
| Avatar Supabase thật | PASS7 nhóm, cleanup PASS | Ảnh tạo bằng Sharp có nhãn QA, không là ảnh điện thoại hoặc nghiệm thu AI/native |
| Android debug x86_64 build | PASS7m28s | Build không là runtime/native PASS |
| Native runtime mới | BLOCKED | Lệnh bật Metro ở phiên trước bị automatic policy block, không nêu lý do chi tiết. Không thử đi vòng qua chặn |
| Gửi email thật | BLOCKED cấu hình | Chưa bật provider thật, không có recipient QA được nhóm xác nhận. Mail local không là Gmail/Outlook delivery |
| UX người thật/ARM/iOS/release/remote CI | NOT RUN | READINESS và các gate còn mở giữ nguyên |

## Nâng schema và quyền DB

[Test upgrade](../../apps/api/test/mongo/member-account-upgrade.mongo-spec.ts)
tạo database ngẫu nhiên `member_upgrade_*_test` trên Mongo8 QA
`127.0.0.1:57017`, xác nhận `rs-test` trước ghi. Dựng59migration của main,
thêm user RESTRICTED và session synthetic, sau đó chỉ áp dụng0047/0048/0049.

[59checksum của main](../../apps/api/test/fixtures/main-be581aec-migration-checksums.json)
được trích độc lập từ Git object `be581aeca4afaf3a7cea8b4b047281fd78e661de`
bằng `git archive` vào thư mục ignored, transpile TypeScript rồi đọc registry;
không checkout đè workspace hoặc dùng registry hiện tại để tự sinh đáp án.
Test so khớp đủ59checksum trước upgrade; user/session/ledger journal và các dòng
`_migrations` cũ giữ nguyên. Chạy migrate lần nữa trả danh sách rỗng.

Role main chưa có quyền collection mới: app read cart bị code13. Sau
`bootstrapRoles`, app đọc/ghi cart và trường profile được; không được xóa cart,
sửa audit append-only hoặc đổi validator. Điều này kiểm cả bước setup quyền DB,
không chỉ validator. Test tự dọn riêng DB/user/role QA của mình.

PASS với Vitest4.1.11 trên Windows/Node24, source trên; không Postgres import,
DB chính, seed chính, GHN hoặc external provider. Đây là upgrade protocol QA,
không chứng minh dữ liệu trên máy teammate đã được nâng schema.

## Avatar với storage thật

[Runner opt-in](../../scripts/test-member-profile-live.mjs) dùng URL/key local
trong `apps/api/.env` chỉ ở memory, không in/ghi giá trị. Tự tạo bucket riêng
`latlai-profile-qa-<random>` private,2MB, WebP only; không dùng hoặc chỉnh bucket
ứng dụng đã cấu hình. Nest/Mongo/Sharp và `MediaStorage` production class thật;
adapter QA chỉ chặn key ngoài run, đếm I/O và tiêm một lỗi remove có nhãn.

7nhóm PASS:

1. Namespace QA mới, private và giới hạn upload được kiểm qua provider.
2. Upload JPEG qua API, retry cùng key/body trả đúng receipt, không upload blob lần hai.
3. Signed GET thật trả WebP256×256, bỏ EXIF từ ảnh JPEG có orientation metadata.
4. Member khác bị API404; public URL không auth bị storage từ chối.
5. Worker không xóa ảnh Attached còn là pointer hiện tại, kể cả fixture expiry cũ.
6. Thay ảnh: lỗi remove tiêm giữ Deleting; retry worker xóa blob cũ thật, giữ ảnh mới.
7. Bỏ ảnh: worker xóa object cuối, listing bucket rỗng; cleanup xóa chính bucket QA.

Kết quả provider có một khác biệt harness: bucket không tồn tại trả HTTP400 với
`statusCode=404`; lượt đầu dừng trước create. Guard được sửa đọc404 từ hai trường,
không chấp nhận lỗi auth/network làm bằng chứng namespace trống. Lượt sau PASS.
Không sửa nghiệp vụ hoặc bỏ assertion để nhận PASS.

Chạy từ root với `MONGO_TEST_URL` QA theo START_HERE:

```sh
pnpm test:member-profile:live --live
```

Không có `--live` trả NOT RUN/exit2 trước đọc env hoặc gọi provider; đã kiểm guard.
Không nối runner này vào CI tự động. Kết quả sanitized ở
`.tmp/member-acceptance/live-profile.json`; cleanup lỗi giữ private journal ignored
để đối soát đúng namespace/key, không xóa theo wildcard. Live7nhóm đã chạy trước
chỉnh metadata/defensive-finally của runner; các chỉnh đó đã kiểm syntax/opt-in.

Hồi quy `test:member-profile:browser` PASS với default storage/mail fake sau thêm
adapter opt-in; entry web/RN-web, OTP, ảnh, mất ACK, Back/remount, responsive.
API/Admin lint/typecheck PASS, warnings API cũ ngoài thay đổi; không rerun toàn
harness hoặc AI vì không đổi business source. Schema test mới được API Mongo CI
thu thập theo config hiện có; remote CI chưa chạy.

## APK và phần chưa thể nghiệm thu

Chạy script repo `node scripts/build-android.mjs --emulator`, JDK21.0.12.1 và
Ninja1.12.1 đã có, chỉ đặt biến cho terminal. Prebuild không đổi tracked source.
Gradle9.3.1 PASS7m28s,475task:443executed/32up-to-date; aapt2 xác nhận package
`com.huangg49.mobilereactnative`, target36 và ABI x86_64.

Artifact:
`apps/mobile-react-native/android/app/build/outputs/apk/debug/app-debug.apk`.
SHA256 `4cbdc04b5abd763009287d1d43be6641c183d44423f8302b0b98ed212161b498`.
Hash trùng APK checkpoint c5c30261; kiểm ZIP xác nhận không có
`assets/index.android.bundle`. APK debug cần Metro để nạp JS mới, nên không lấy
hash/build hoặc ảnh native cũ làm chứng cứ runtime của profile/cart mới.
Phiên này không cài/mở APK/emulator, không thay native permission/cài đặt máy.

Ở lượt preflight trước cấu hình Brevo bên dưới: email đang nói tới OTP6số khi
Member đổi email đăng nhập và cảnh báo gửi về email cũ sau confirm. Backend/local
mailbox đã có evidence riêng; gửi thật chưa kiểm tại mốc đó.
Preflight chỉ báo trạng thái biến: `AUTH_MAIL_ENCRYPTION_KEY` chưa đặt riêng,
`RESEND_API_KEY`/`BREVO_API_KEY` chưa cấu hình; provider thật chưa bật. Không gửi thư
tới địa chỉ cá nhân, không tạo tài khoản provider hoặc yêu cầu key qua chat.

### Bổ sung Brevo QA trên source 3f12fa11

Owner đã duyệt tạo key QA, chỉ scope Transactional email, hạn01/12/2026 và gửi
thư mẫu đến sender đã xác minh. Provider bắt buộc xác minh điện thoại; owner đã
tự hoàn tất bước này. Cấu hình ở `apps/api/.env.brevo.qa` bị Git ignore, độc lập
với `apps/api/.env`; không bật worker hoặc đổi khóa mã hóa của dữ liệu chính.

PASS kiểm cấu hình và AES-GCM roundtrip với dữ liệu giả; production
`AuthMailService.deliver` gọi Brevo thật trả201. Replay cùng UUID job/payload trả400
`duplicate_parameter`, được adapter coi là ACK; không tạo job hoặc mã mới.
Thư có nhãn QA, code giả, không thay tài khoản. Owner xác nhận vào **Inbox**.
Không nối Mongo; không kiểm HTTP email-change/queue/revocation xuyên suốt bằng
mail thật, không nhận provider acceptance thay cho bằng chứng những bước đó.
Evidence sanitized: `.tmp/member-acceptance/brevo-qa.json`; helper riêng ignored,
chỉ cho một recipient đã duyệt và tối đa hai request send/replay, không tự chạy CI.

Credential handling **rotation completed**: khi nối lại tab, output tự động đã
hiển thị key đầu. Đã tắt provider QA tạm thời và báo owner; owner xác nhận thay.
UI Brevo hiện key cũ **Deactivated**, key `LatLai-local-QA-2026-11-01-r2` **Active**,
cùng restricted scope/hạn01/12. Key mới được đọc/lưu trong memory/file private,
không xuất giá trị ra output; đóng màn hiển thị key ngay sau lưu. File QA chỉ giữ
key mới, giữ khóa mã hóa QA và sender, bật lại provider Brevo riêng trong file này.
`apps/api/.env` vẫn local; ứng dụng không tự đọc file QA và không tự gửi thư thật.
Không ghi giá trị key/recipient vào tài liệu/Git.

Rerun bằng key r2: cấu hình/encryption/HTTP201/replay400 đều PASS; không đổi
business source hoặc nối DB. Kết quả mới ở `brevo-qa.json`; kết quả trước rotation
ở `brevo-qa-before-rotation.json` trong cùng thư mục evidence ignored. Owner xác
nhận **Inbox** của thư mẫu trước rotation; không suy thành Inbox PASS riêng cho
thư r2. Key cũ không được kích hoạt hoặc dùng lại.
Sender freemail đang có cảnh báo domain authentication; Inbox mẫu một thư không
chứng minh deliverability production, các nhà cung cấp khác hay gửi quy mô lớn.

### Bổ sung HTTP/Mongo/queue/Brevo và OTP do owner nhập

Owner duyệt tiếp gói kiểm thật và alias Gmail `+latlaiqa` cùng hộp thư. Source
`2ba4418c` cùng [runner opt-in](../../scripts/test-member-email-live.mjs) đang local;
không thay business API/schema/contract/client. Cấu hình vẫn riêng trong file QA.

- PASS16/16 `member-profile.e2e-spec.ts`: HTTP/Mongo/Sharp thật, mail/storage fake,
  gồm credential/owner,5mã sai/hết hạn/cooldown, queue rollback, unique-email race,
  confirm/replay/revocation. Lỗi500 `QA notification failure` được tiêm để chứng
  minh rollback, không là lỗi runtime mới cần che.
- PASS3 targeted queue tests trong `account-auth.e2e-spec.ts`: failed delivery/
  lease/payload erase, crashed final lease, superseded delivery.21ca khác skip do
  lọc tên test; không cộng thành24PASS hoặc toàn bộ auth PASS của lượt này.
- Live: genuine Nest HTTP/API và Mongo QA random `*_test`; actor tổng hợp với
 2phiên thật. Class production `AuthMailService.drain()` được điều phối thủ công
  trên collection thật; storage fake, AI/carrier không gọi, không timer nhiều process.
- PASS request ACK bị bỏ rồi replay nguyên key/body/version: một challenge/job
  mã hóa, email cũ chưa đổi, resend tức thì429, sai owner404 không tiêu thụ mã.
- PASS Brevo201 OTP thật; lỗi ACK provider tiêm sau201 giữ job Pending/payload.
  Fixture tăng tốc `nextAttemptAt` của đúng job; retry400 duplicate_parameter đưa
  đúng job Sent, attempts2 và xóa encrypted payload. Không tạo mã/job mới.
- PASS owner tự nhận và nhập OTP trực tiếp trên loopback helper, không đọc mã
  từ queue hoặc đưa vào chat/log. Confirm rồi bỏ response/replay cùng intent
  trả receipt cũ; identity/current session giữ nguyên. Access/refresh phiên khác
  401, email cũ login401, email mới200. Mã đã dùng với key mới400.
- PASS một warning job đến email cũ; Brevo nhận và job Sent/xóa payload; audit
  không chứa email/code/password. Owner xác nhận đúng tiêu đề và **Hộp thư đến**
  qua chat. OTP đã được owner nhận/dùng thành công; không ghi nhận riêng folder
  của thư OTP, không suy thành cả hai Inbox.

Lỗi helper đã xác nhận và sửa: native form POST bị Origin không khớp do chính
`Referrer-Policy: no-referrer`; đổi helper thành `same-origin`, giữ kiểm Origin/
Host/CSRF, không sửa auth guard hoặc cấu hình trình duyệt. Form gửi và confirm
thật đã chạy sau sửa; không nhận lỗi helper là lỗi UI web/RN sản phẩm. Probe
Host giả/cross-site GET/POST thiếu Origin/cross-origin POST403 và no-store/CSP
đã kiểm riêng; probe Host đầu bằng fetch không gửi Host override như mong muốn,
đã dùng node:http gửi header thật để đối chiếu, không bỏ assertion.

Kết quả sanitized `.tmp/member-acceptance/member-email-live.json`; hướng dẫn và
giới hạn [ACCOUNT_AUTH](ACCOUNT_AUTH.md#kiểm-luồng-đổi-email-với-brevo-thật-trong-qa).
Không tự chạy live runner trong CI. Đây là backend/queue/mail thật + helper do
owner thao tác, chưa là web/RN product journey với mail thật hoặc native PASS.

Owner xác nhận Inbox qua chat thay vì nút helper tuyên bố cả hai thư đều Inbox.
Operator dùng protected `/stop` để dọn môi trường, giữ raw runner exit
`BLOCKED/operator-stop` trong trường `runnerExit` và bản trước owner confirmation.
Sau đối soát đủ7nhóm, provider201/400/201 và owner report, kết luận nghiệm thu
mail riêng là **PASS**, `completionMethod` ghi rõ đường xác nhận này; không giả
bấm nút hoặc đổi kết quả assertion. Folder của OTP vẫn NOT_SEPARATELY_RECORDED.
Cleanup database/user/role riêng PASS; API/media/helper và replica set QA đã dừng,
không còn port app/QA của lượt. Database/bucket/env chạy chính giữ nguyên.
Không áp migration chính, không push/PR/merge/deploy; READINESS giữ nguyên.

Khi điều kiện chạy native hợp lệ được khôi phục: kiểm entry Account→Profile/
Cart, image picker, keyboard/Back, OTP, chữ lớn/resume, network loss và đổi identity
trên đúng JS source. Kiểm human UX trên client sản phẩm vẫn riêng; không nhận phần
PASS độc lập ở trên thay cho nó.
