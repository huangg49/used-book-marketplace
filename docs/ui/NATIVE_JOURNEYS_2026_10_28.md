# Kiểm chứng hành trình Android native — 28–29/10/2026

Owner duyệt bước tiếp sau [gói browser](JOURNEY_VERIFICATION_2026_10_28.md).
Nhánh `codex/native-journey-verification`, base `990a9a2`. Phạm vi là RN native
từ entry, phiên/SecureStore, focus hồ sơ, Back/keyboard/chữ lớn và TalkBack.
Không mở GHN/carrier/Driver, delivery/settlement hoặc ghi DB/bucket chính.
Không push/PR/merge/deploy. Các gate đã đạt không tự chạy lại nếu source không đổi.

## Nguồn kiểm và remote

Fetch đầu gói: remote main đã chuyển từ7d92012 tới `aed674f`, gồm Exchange RN và
GHN của nhóm; local còn chuỗi chưa tích hợp. Không reset/pull hoặc trộn phần GHN
vào gói này. APK/Metro kiểm source RN tại990a9a2 cùng bản vá dependency bên dưới;
không nhận là kiểm RN của main
mới. Khi tích hợp cần review cả migration registry và hai gói Exchange/review;
không tự sửa migration đã áp dụng. Nhận xét về main ở đây dựa trên log/diff,
không là chứng nhận chạy hoặc CI của main mới.

## Môi trường và cách tách bằng chứng

- Android Emulator x86_64, Android17/API37, 1080×2400,420dpi; AVD phone.
  Không suy ra thiết bị ARM hoặc iOS. Debug APK/Metro khác release/store artifact.
- JDK21, Gradle9.3.1, Ninja1.12.1, Android compile/target36, NDK27.1.12297006;
  tải công cụ từ upstream chính thức, kiểm checksum JDK/Android CLI. Java/PATH
  chỉ đặt trong terminal build; không đổi cấu hình hệ thống hoặc env của app.
- QA Mongo57017/rs-test, từng database `*_test`; API/storage fake tách khỏi local
  chính. Native participant đăng nhập qua UI/API thật, chỉ refresh token vào
  SecureStore theo implementation; không dump SecureStore/token để làm evidence.
- Dataset tìm/lưu: `qa:android serve native-journey-r2-20261028`, API3046/media3047/
  proxy3048; Metro8081, device reverse3009→3048. Credential/journal nằm local
  ignored, không chụp form login đã điền hoặc in nội dung env.
- Dataset đơn: `demo:orders init native-orders-20261028 --fixture-storage --port 3020`
  rồi `run`/`serve`; **không** `--in-transit`. Ba trạng thái AwaitingPayment,
  PendingSellerConfirmation, Preparing được tạo bằng command API thật và giữ
  tiền qua ledger/simulator QA. Không thực hiện shipment/carrier/Delivered.
- TalkBack17.0 có sẵn. Focus/nhãn/điều khiển quan sát được là evidence riêng;
  hierarchy hoặc cờ feedback-spoken không chứng minh đã nghe và hiểu âm thanh.
  Không tự đóng gate TalkBack khi phần audio/human chưa được kiểm.

## Finding chặn native: crash ở mounting delegate

APK đầu cài thành công nhưng một cold launch chết sau nạp JS: SIGSEGV trên
`mqt_v_js`, `MountingCoordinator::pullTransaction+706`; mở lại có lúc vào được
Home. Không gọi đây là lỗi Android17 riêng hoặc lỗi nghiệp vụ khi chưa tách được.
Expo SDK57 đang khuyến nghị đúng screens~4.26.0; source4.26.2 còn lazy init chưa
đồng bộ và callback giữ raw `this`.

Đã backport đúng bốn file từ [upstream PR4413](https://github.com/software-mansion/react-native-screens/pull/4413),
head `204d36b45f2a718c6f86e00cfc70765cbde06565`, merged `b3badd012f83679b12f4e29f2e28eceaa4830efd`.
Chỉ map đường dẫn `cpp/legacy/`→`cpp/`, apply check qua trước khi ghi.
[Patch pnpm](../../patches/react-native-screens@4.26.2.patch) giữ version4.26.2,
không tắt animation hoặc nâng SDK. Singleton/callback được đồng bộ và giữ JNI
reference có ownership token. Lockfile chỉ đổi hash patch/peer liên quan.

Đây là bản vá cho một race đã xác định ở upstream, phù hợp signature quan sát;
chưa chứng minh mọi crash tại cùng hàm đều có cùng nguyên nhân. Rebuild sau vá
PASS7m17s; cài APK mới rồi20/20cold launch có Home native, không fatal signal mới
của app. [Ma trận/hash APK](native-journeys-2026-10-29/startup-result.json),
[signature trước vá](native-journeys-2026-10-29/unpatched-crash-summary.txt).
Các duration của runner gồm adb/hierarchy, không phải chỉ số hiệu năng launch.
Old APK không dùng để kiểm patch C++; hot reload JS không thay native binary.
Khi Expo nâng screens đã có fix, review để bỏ patch cùng native checks, không
giữ patch chồng vào version mới một cách tự động. iOS/ARM chưa kiểm bản vá này.

## Finding: dataset QA không còn theo quota hiện hành

[listing-quota.ts](../../apps/api/src/modules/listings/listing-quota.ts) giới hạn
5bài PendingReview/Approved visible chưa được giải phóng. Dataset pilot cũ tạo
7bài cho một seller, bị409 tại `alice.submit`; không được đổi key, bỏ quota hoặc
gán Approved trực tiếp để ép chạy. Journal lượt lỗi được giữ local.

[Fixture runner](../../scripts/android-pilot/fixtures.mjs) nay phân bổ tối đa5bài
mỗi owner, giữ giới hạn upload. Provision identity/session của seller bổ sung
chỉ trong DB QA đã guard, token HS256 issuer/audience đúng AuthModule và chỉ giữ
trong memory. Đây là fixture tạo dữ liệu, không phải evidence login native.
Không tắt limiter để seed nhiều seller; native buyer/seller chính vẫn login thật.
Catalog/media/submission/review tiếp tục qua API command có version/key/receipt.
Kiểm lại public projection đúng owner, không sửa guard hay nghiệp vụ.

API đã dựng7bài cho2owner và51bài cho11owner, max5/owner; unit reset3ca PASS.
Mode paging đọc đúng50+1 và target trên trang2. Lượt đầu có EPERM khi replace
journal file; resume cùng journal/intent sau lỗi đã hoàn tất, không đổi key/body
hoặc xóa counters. Đây là kiểm API/setup, không phải native paging PASS.
Không tái sử dụng lượt cũ đã bị command rejection để đổi owner/body của intent;
dùng dataset mới và giữ journal lỗi. Manifest cũ hợp lệ vẫn được tái sử dụng.

## Hai lỗi UI native tìm được và đã sửa

- **Account không phân biệt unavailable với anonymous.** Force-stop khi chỉ API
  offline (Metro còn chạy), SessionClient giữ refresh token nhưng route account
  rơi vào LoginScreen. [Account route](../../apps/mobile-react-native/src/app/account.tsx)
  nay hiện trạng thái chưa phục hồi và nút gọi lại `client.restore()`. Khôi phục
  reverse API rồi bấm thử lại vào đúng buyer, không nhập mật khẩu. Không đổi
  storage hoặc semantics phiên; không trích xuất token để làm evidence.
  [Màn offline](native-journeys-2026-10-29/offline-session.png).
- **Selected navigation tab bị vô hiệu từ màn con.** OrderFocus tô Account đang
  chọn, nhưng NavigationBar chỉ dispatch tab chưa selected. Người dùng bị buộc
  vòng qua Home hoặc Back. [NavigationBar](../../apps/mobile-react-native/src/core/ui/navigation-bar.tsx)
  nay chuyển ý định chọn lại cho owner route, nên từ Order bấm Account về hub;
  route owner vẫn quyết định đích. Không bypass dirty-form guard. Native đã
  thử và browser work-inbox thêm assertion cho đường này.

Helper [nhập credential QA](../../scripts/android-pilot/native.mjs) trước đó
khóa theo câu chào/placeholder cũ. Nay nhận diện đúng hai field Email/Mật khẩu
và nút Đăng nhập của package; vẫn từ chối field đã nhập. Unit kiểm placeholder
hợp lệ, identity/password/bullets không được ghi đè. Credential không vào log/ảnh.

## Ma trận thực chạy

| Ca | Kết quả hiện tại | Evidence/giới hạn |
| --- | --- | --- |
| Debug APK build/install | PASS | Gradle28m6s,475tasks, exit0; APK96.7MB x86_64 cài Success; không là release/ARM |
| Cold launch trước vá | FAIL | Có một SIGSEGV trong crash buffer; launch khác vào Home. Không đo tỷ lệ lỗi từ các lần mở không đồng nhất |
| Rebuild/cold launch sau patch | PASS phạm vi |20/20, hash APK cài khớp artifact; screenshot Home thật. Không chứng minh hết race hoặc native toàn dự án |
| Guest: Trang chủ → tìm → chi tiết → Back | PASS phạm vi | Tìm Gatsby, đúng bản65.000đ; mở gallery/Back đóng gallery; ảnh storage QA fake |
| Login validation → return book → save → account/Guide/Back | PASS phạm vi | Submit thiếu ô có field errors; login qua UI/API; quay lại sách đúng; save rồi Wishlist có sách; Guide và Back dùng được |
| Work inbox → đúng Order → trạng thái/bước tiếp | PASS phạm vi | Seller đăng nhập thật, entry hub mở exact ID của đơn paid; xem tiền/hạn và command hiện tại |
| Mất ACK/retry sau server commit | PASS phạm vi | Proxy local bỏ response200 đầu sau accept; native tự retry cùng key/body; Mongo có1accept receipt và1OrderPayment, statePreparing. [Kết quả](native-journeys-2026-10-29/order-replay-result.json), [màn](native-journeys-2026-10-29/order-after-lost-ack.png). Không kiểm persistence intent qua force-stop |
| Force-stop/resume và offline API, giữ Metro | PASS sau fix | Buyer phục hồi từ phiên native; offline không ép login; nối API/retry trở lại cùng buyer không mật khẩu |
| Logout/mở lại/đổi account | PASS phạm vi | Buyer logout→force-stop→anonymous; đổi sang seller của QA dataset khác qua UI, hub chỉ ra seller/đơn của seller. Chưa audit mọi cache/ảnh private |
| Chữ OS1.3, keyboard, Back và modal | PASS phạm vi | [Account130](native-journeys-2026-10-29/account-font130.png)/Guide đọc và scroll; [form keyboard docked](native-journeys-2026-10-29/address-keyboard.png) và footer còn dùng được; Back đóng keyboard trước, Back tiếp hiện leave dialog, hủy giữ QA-Native, đồng ý mới rời form |
| TalkBack focus/traversal/activation | PARTIAL | Service thực bound, touch exploration bật; [focus xanh tại Back](native-journeys-2026-10-29/talkback-focus-partial.png), hierarchy có nhãn/selected chip; keyboard Tab/Enter chọn được chip. Chuỗi vuốt đọc tiếp/doubletap/dialog focus và audio chưa có evidence đủ để PASS |
| TalkBack tiếng nói/human usability/ARM/iOS | NOT_RUN | Không có evidence nghe/người thử độc lập |

## Checks, evidence và giới hạn

- RN161unit/lint/typecheck PASS sau source fix; export web PASS. Hồi quy
  `test:journey-gate --only=member-rn-web,work-inbox` PASS2suite, tổng **PARTIAL**
  đúng vì sáu suite khác NOT_RUN trong lượt này. Không chạy lại toàn bộ gói8suite
  khi không đổi source liên quan. Browser không cộng thành native evidence.
- 15ca runner/journal/native-helper PASS: preserve replay, fail closed, target
  QA, không ghi đè credential, launcher/splash không là business UI.
  Unit không thay C++ race;20launch chỉ là hồi quy quan sát trên emulator này.
- `pnpm install --frozen-lockfile --ignore-scripts` PASS với patch hash hiện tại;
  docs:check và diff check PASS. Không bỏ qua peer/patch mismatch hoặc nâng
  dependency khác để đạt build. Các warning Gradle/C++/Expo cũ không là lỗi
  exit-code; Metro/hot reload không được dùng thay rebuild C++.
- Không đổi API/contract0.59/migration. Không chạy lại gate import/failover/schema
  hoặc carrier. UI dùng Pro Max/Impeccable native; web Taste không áp thành native
  redesign. Theo native audit playbook, detector DOM/CSS không là native a11y test.
- File/ảnh được chọn ở [thư mục evidence](native-journeys-2026-10-29/startup-result.json)
  không chứa token, config riêng hoặc form login đã điền. Screenshot debug có
  overlay dev-tools; không coi là release UI. Phần account/nav JS được Metro nạp
  sau APK patch;20coldstarts chạy trước hai UI fix này, cùng native binary/hash.
- Night mode được bật thử nhưng sau đó emulator host-renderer báo ColorBuffer/
  context errors và adb chờ; chưa tách nguyên nhân, **không nhận dark-mode hoặc
  độ ổn định toàn emulator PASS**. Sau kiểm khởi động lại cùng AVD software GPU
  chỉ để restore font1.0/nightno/IME0/accessibility0/servicesnull, thu hồi quyền
  notification TalkBack cấp cho QA và bỏ reverse. Không suy lỗi renderer là lỗi
  app; một crash app Fabric trước vá là finding riêng có log.
- Native upload/picker/live Supabase, deep-link intake ngoài50, fulfillment,
  toàn bộ Exchange/review trên thiết bị, session mọi race, ARM/iOS và TalkBack
  audio/human **NOT_RUN** trong gói. Giữ evidence native cũ theo đúng source/ngày,
  không mở lại gate đã đạt hoặc coi chuỗi browser là native parity.

## Git, CI và điểm lưu

00:26 giờVN29/10: main `aed674fdd06c11b136b2ea9e42aeaf5736a9eb2f`, PR mở0.
[RN CI](https://github.com/huangg49/used-book-marketplace/actions/runs/40717566211/job/122919296143)
**FAIL ở lint**: annotations của source main chỉ tới quote JSX trong reviews/
shipping card, import TextInput trực tiếp ở chat-box và literal màu ở actions-card.
Các file main mới chưa tích hợp vào nhánh này; local lint PASS không sửa được
remote failure. Không tự sửa hoặc cherry-pick phần GHN trong gói này.
Docs/Admin/Demo/Operations+public-shelf là4workflow main vừa đọc completed/success;
không nhận toàn CI main hoặc remote CI nhánh local đều xanh.

QA/Metro/API/proxy đã dừng, emulator do phiên tạo đã tắt sau restore; Gradle
daemon build đã dừng. Mongo chính giữ Exited từ trước phiên, không reset/seed/
migrate. Chỉ commit local. [SESSION_STATE](../handoff/SESSION_STATE.md) giữ điểm
tiếp nhận; READINESS vẫn PARTIAL/OPEN theo phạm vi evidence.

Bước tiếp ưu tiên: (1) review/tích hợp chuỗi local với main mới và giải quyết
lint/migration registry có chủ đích, giữ GHN ngoài quyền của gói này; (2) human
pilot và TalkBack audio/focus đầy đủ trên máy phù hợp, theo N21; (3) browser đấu
giá API thật xuyên Seller/Staff/Buyer trước khi suy luồng UI đã nối hết. Không
tự mở delivery/settlement hoặc thay người review tiền/quyền theo TEAMWORK.
