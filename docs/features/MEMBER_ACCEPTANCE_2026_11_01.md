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

Email đang nói tới OTP6số khi Member đổi email đăng nhập và cảnh báo gửi về email
cũ sau confirm. Backend/local mailbox đã có evidence riêng; gửi thật chưa kiểm.
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

Khi điều kiện chạy native hợp lệ được khôi phục: kiểm entry Account→Profile/
Cart, image picker, keyboard/Back, OTP, chữ lớn/resume, network loss và đổi identity
trên đúng JS source. Bước mail tiếp theo: kiểm journey email-change và mail cảnh báo
thật trên dữ liệu QA riêng khi được duyệt. Hai việc này còn mở; không nhận phần
PASS độc lập ở trên thay cho chúng.
