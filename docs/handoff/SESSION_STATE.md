# Điểm lưu hiện tại — 10/10/2026

Snapshot tổng quan: main `da59199`; docs context `d77290a`, docs refresh `2e13f04`.
Checkout/gói Android hiện hành và primary main mới được ghi bên dưới.
OpenAPI0.30.0,15 migration Mongo,113 operation HTTP. Đây là trạng thái theo Git/
source; remote CI hiện tại và human sign-off chưa được xác minh trong hai gói docs.
Tổng quan: [PROJECT_CONTEXT](PROJECT_CONTEXT.md); [inventory](PROJECT_CONTEXT_INVENTORY.md).

## Gói thiết kế web Member — logo mới và tiệm sách nhiều màu

- Sau `4cffb71`, navbar shared Member web đã gọn76px→64px và bo/nổi khi scroll,
  slot ổn định; mobile72px, menu/notification popup không tràn ở320px/130%text.
  Focused7viewport khách + authenticated response fixture PASS: scroll/return/no
  jump, menu/Escape/focus/route/resize, skip/reduced motion/layout consumers.
  CUA desktop/mobile và build/typecheck/16unit/lint6warning cũ/docs/diff PASS;
  detector một lượt có advisory legacy/scale,32px nav radius được duyệt/ghi DESIGN.
  [Brief](../design/WEB_MEMBER_REDESIGN.md) có ảnh/giới hạn; API3048 không chạy,
  không test auth thật/native hay đổi gate. Checkpoint subject
  `feat(web): add compact floating member navigation`. Chưa push/PR/merge/deploy.
- Sau `288a385`, thay headline Home bằng Hero text final.png chủ dự án cung cấp:
  SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI. Giữ pixels RGBA/dấu/minh họa, chỉ bỏ lề
  alpha trống và chừa16px; raw pixel comparison PASS. H1 tương ứng/không đọc lặp,
  CSS giữ ratio/cap responsive. Build/typecheck/16unit/lint6warning cũ/docs/diff
  PASS; CUA laptop/mobile và focused9viewport100/130%text/search PASS, detector0.
  Source/evidence ở brief/brand README. Checkpoint subject
  `feat(web): use owner-designed final hero lettering`. Không đổi API/gate/motion;
  raster typography và thiếu motion stop control chưa là accessibility acceptance.
- Sau `1d9e5c5`, bỏ nút/state pause theo yêu cầu chủ dự án, sway liên tục cả hover;
  giữ offscreen/hidden và OS override. Hạ description/search20px ở laptop, mobile
  description8px; hero469px và kệ đầu vẫn hiện ở1536×730. Focused responsive/motion/
  search PASS, build/typecheck/16unit/lint6warning cũ/docs/diff, detector0findings.
  Ảnh ở brief; thiếu visitor stop control là limitation accessibility, chưa nghiệm
  thu accessibility. Checkpoint subject `feat(web): give hero copy and search more breathing room`.
  Local branch, chưa push/PR/merge/deploy; API/gate giữ nguyên.
- Sau `33f0544`, sửa tỉ lệ hero cho desktop laptop thấp: chỉ Home CSS compact
  width≥1101/height≤850, clamp chữ/bìa theo vh và nén khoảng dọc, không scale/crop.
  CUA1536×730 hero686→497px, thấy search/pause/kệ đầu;1366×650 kệ đầu vừa viewport.
  Focused9viewport100/130%text và search Enter PASS, đủ8bìa/không tràn ngang;
  layout assessment riêng + detector0findings, build/typecheck/16unit/lint6warning
  cũ/docs/diff PASS. Header/mobile/API giữ nguyên, ảnh ở brief. Checkpoint subject
  `fix(web): fit hero proportions to short laptop viewports`. Chưa push/PR/merge.
- Sau `8a871f8`, chủ dự án duyệt trang trí hero: ba SVG gốc giấy lật/sách mở màu
  kem, tĩnh/aria-hidden/pointer-none; responsive ra mép, tâm chữ/search thoáng.
  Bìa có cạnh sáng/contact/cast shadow rõ hơn và bóng hover sâu hơn, giữ sway/pause.
  Build/typecheck/16unit/lint0error6warning cũ/docs/diff PASS; focused browser
  motion và overflow1440/390/320px100/130% PASS, ảnh CUA desktop/mobile ở brief.
  Detector advisory size/màu cũ ngoài diff; proxy API3048 vẫn không chạy, kệ lỗi.
  Checkpoint subject `feat(web): illustrate hero with turning pages and cover depth`.
  Giữ quyền gói hiện tại: local checkpoint, chưa push/PR/merge/deploy.
- Sau `1c68ec3`, chủ dự án yêu cầu ép hero animate dù OS reduce-motion. Scoped CSS
  exception cho bìa, giữ manual pause/hoverpause/offscreen/hidden; không sửa Windows.
  Focused browser reduce/no-preference PASS, IAB reduce=true vẫn running6s/infinite;
  build/typecheck/docs/diff PASS. Checkpoint subject
  `fix(web): keep hero motion enabled per owner preference`.
- Sau `c06a288`, thêm sway hero±3px/±1°,6–7.5s lệch nhịp; pause/resume, hoverpause,
  tự pause offscreen/hidden; giảm chuyển động tắt. Focused Chromium motion/layout
  PASS, build/typecheck/lint0error6warning cũ/docs/diff PASS. Preview5186 khởi động
  lại; proxy API3048 hiện không chạy, kệ báo lỗi; IAB reduced-motion=true giữ ảnh
  tĩnh. Checkpoint subject `feat(web): add gentle pausable hero cover sway`.
- Sau `6c0e266`, thay bìa Gachiakuta→SAO theo ảnh chủ dự án gửi; vị trí/CSS/hover
  giữ nguyên. Build/typecheck, ảnh tải/hiện CUA, docs/diff PASS. Checkpoint subject
  `feat(web): replace Gachiakuta hero cover with SAO`.
- Sau `48e806d`, chủ dự án gửi ba bìa thay thế: Oz→Chúa nhẫn (cả hai vị trí),
  Alice→Alice mới, Pride→Nghìn lẻ một đêm; áp vào hero và ba mục khám phá Home.
  Giữ CSS/hover/API. Build/typecheck, ảnh CUA1440/390px đủ8bìa/mobile không tràn,
  provenance/docs/diff PASS. Checkpoint subject `feat(web): use owner-selected replacement covers`.
- Sau `e0b739f`, chủ dự án yêu cầu thêm bốn bìa và hover hero. Đã giữ bốn vị trí
  cũ thành tám, hai cụm2×2 desktop/4×2 mobile dưới search; hover phóng/nâng/bóng,
  touch tĩnh/reduced-motion không phóng. Focused browser QA1440–320px100/130%
  PASS đủ ảnh/không tràn/hover reset/reduced-motion/search Enter; layout assessor
  xác nhận yêu cầu đạt. Build/typecheck/lint0error6warning cũ/docs/diff PASS;
  chứng cứ và nguồn ảnh ở brief. Checkpoint subject
  `feat(web): arrange eight hero covers and add hover depth`.
- 10/10: chủ dự án báo đã merge PR31; fetch xác nhận main `dec19b3` chứa merge.
  Primary đã fast-forward sạch rồi tạo `codex/web-member-redesign` từ main đó.
  Managed worktree Android/pilot và local config/dataset được giữ.
- Chủ dự án chuyển ưu tiên sang web `apps/user-web`, sau đó đồng bộ Android theo
  thiết kế web đã kiểm chứng. [Brief](../design/WEB_MEMBER_REDESIGN.md): lát cắt
  Trang chủ→Tìm sách→Chi tiết. Chủ dự án đã thay ba sketch xanh bằng logo cú/chữ
  mới đỏ–kem và bản Bookstore Landing Page trên Dribbble. Đã triển khai Home,
  Search, Detail, shared shell/card/dialog và Login nối về đúng sách; chưa đổi API
  hoặc token storage. Giữ ảnh bài đăng thật, ảnh trang trí có nguồn/chú thích.
  Build/16unit/lint0error6warning cũ PASS; browser HTTP/Mongo riêng storage FAKE
  PASS tìm/lọc/sort/cursor/lỗi/login return/owner guard và đăng sách/replay.
  Purchase mất phản hồi→thử lại giữ key/body/version, chỉ một conversation PASS;
  Home/Detail/Search320px130% và search/sell390px100/130% không tràn ngang PASS.
  Finish reviewer chấm cả năm sửa resolved, disposition ship ở phạm vi fix list;
  DESIGN/sidecar đã cập nhật và kiểm schema/parity. Checkpoint subject
  `feat(web): redesign member discovery around new bookstore identity`.
  Scope/checks/ảnh ở brief; preview local5186 dùng dữ liệu [QA].
  Tiếp theo: chủ dự án xem bốn màn mới; form đăng sách/chat/đấu giá còn legacy,
  rồi mới đồng bộ Android theo hướng web. Chưa human usability/native/live storage
  acceptance cho gói này; không push/PR/merge/deploy theo quyền cũ.
  Các checkpoint Android bên dưới là lịch sử trước merge; READINESS giữ nguyên.

## Gói lưu sách và chuẩn bị pilot Android

- Chủ dự án yêu cầu push/merge ngày10/10. Đã tích hợp main `d71ad3e` vào nhánh
  tại `9d5874a`, giữ web của nhóm; resolve duy nhất `.gitignore` bằng UTF-8,
  giữ cả rule Taste của main và ignore runtime Impeccable. Đã push và mở
  [PR31](https://github.com/huangg49/used-book-marketplace/pull/31) cho toàn bộ
  chuỗi context/docs/design/Android/pilot đã duyệt (không chỉ commit QA cuối).
  PASS23/23 helper/demo/docs units, docs255/1830 links/4 adapters và whitespace
  của PR sau tích hợp. CI phát hiện browser harness còn nhãn/bố cục cũ; đã cập
  nhật hai journey theo UI được duyệt và PASS toàn hành trình local HTTP/Mongo
  thật, storage FAKE (search/detail/paging/lỗi/quyền, địa chỉ, đăng/duyệt sách,
  replay mất phản hồi và showcase list/grid). Giữ các assertion nghiệp vụ.
  Tại checkpoint `ee8a048`, chủ dự án sẽ review PR31; sau đó chủ dự án tự merge,
  remote main đã xác minh ở gói web bên trên. CI/review hiện hành xem PR;
  review AI không thay reviewer người thật theo TEAMWORK.
  Các dòng “không push/PR” bên dưới mô tả
  phạm vi quyền tại checkpoint trước yêu cầu tích hợp này. READINESS giữ nguyên.
- Preflight tiếp: nhánh `codex/android-pilot-qa` từ `684d2ea`, managed worktree
  `android-pilot-preflight`; subject
  `feat(qa): prepare repeatable Android pilot and verify pagination`.
  Primary hiện clean main `d71ad3e`, giữ nguyên; Android chưa tự lên main.
  Không đổi source RN/API/session/contract. Runner `pnpm qa:android` dựng QA
  riêng7 sách hoặc51 mục phân trang qua API, giữ journal/private config ignored.
  PASS native membership50+1 và5 lần Tải thêm tới mục51; pilot mới PASS login
  return/lưu/tìm lại/bỏ lưu/PUT503/GET503 recovery, buyer QA empty sau test.
  PASS12/12 tests helper/journal, syntax/format/docs/diff; không chạy lại gates
  sản phẩm không đổi. [Evidence](../ui/ANDROID_SAVE_USABILITY.md),
  [setup](../ui/ANDROID_PILOT_SETUP.md). P2 còn: danh sách wishlist lỗi đọc chưa
  có retry trực tiếp, Back→mở lại phục hồi được. Paging DB/users/roles đã dọn;
  giữ API3046/media3047/proxy3048/Metro8081/emulator và QA Mongo57017 cho dataset
  `android-pilot-p01-20261010`, fault none, anonymous, buyer wishlist trống.
  Phiếu P01 local chưa điền. Bước tiếp:2–3 thành viên thực hiện protocol trên
  emulator; human usability/TalkBack/ARM/iOS OPEN, READINESS không đổi.
  Không push/PR/merge/deploy. Dependency primary reuse bằng junction;
  xem flag pnpm riêng trong setup nếu chạy ở worktree này.
- Chủ dự án duyệt tìm→xem→lưu và bước chuẩn bị đăng sách; nhóm chưa từng mua/bán
  sách cũ, chỉ có Android Studio. Pilot chuyển thành trong nhóm/emulator, chưa chạy
  với người thật. [Protocol](../design/ANDROID_USABILITY_ROUND_01.md),
  [phiếu](../ui/templates/ANDROID_USABILITY_SESSION.md),
  [brief đăng sách](../design/ANDROID_POSTING_BRIEF.md).
- Nhánh `codex/android-save-usability` từ `2dc069b`, checkpoint subject
  `fix(rn): clarify saved books and preserve login context`. Login trở về đúng
  sách, không tự lưu; lưu/bỏ lưu có nhãn/trạng thái/lỗi rõ và membership đọc cursor.
  Không đổi API/session storage/tokens/web/framework hoặc triển khai form đăng sách.
- PASS RN120/120 test/typecheck; lint0error4warning cũ. Native login→return→lưu→
  tìm lại→bỏ lưu, PUT/DELETE503 và read503/recovery ở320dp130% có evidence.
  Return parameter sai chỉ kiểm unit; native paging bổ sung ở checkpoint trên.
  PASS format9file và export preview0 Android/iOS/web13routes. Fresh reviewer
  verdict ship cho batch bỏ kicker login/wishlist sau recapture; documenter
  không yêu cầu đổi canonical. QA services/database/users/roles đã dọn;9ảnh
  giữ ở [báo cáo](../ui/ANDROID_SAVE_USABILITY.md). Checklist preflight trước
  pilot tại checkpoint đó còn native paging; checkpoint trên đã bổ sung bằng fixture mới.
  Human usability/TalkBack/ARM/iOS còn mở; READINESS giữ nguyên.

## Checkpoint chi tiết sách Android — `2dc069b`

- Chủ dự án duyệt tiếp màn chi tiết Android; nhánh
  `codex/android-book-detail-redesign` từ `2f766ca`, checkpoint subject
  `feat(rn): redesign Android book detail`. [Brief](../design/ANDROID_BOOK_DETAIL.md),
  [checks/ảnh](../ui/ANDROID_BOOK_DETAIL_REDESIGN.md).
- Tên/tác giả toàn chiều ngang, ảnh cạnh hai giá có nhãn, bỏ footer giá; tình trạng
  và thông tin xuất bản dễ đọc. Gallery/Back và stale/retry giữ semantics; anonymous
  mở tài khoản để lưu, authenticated dùng wishlist cũ. Chip thêm disabled tùy chọn,
  showcase cùng recipe. Không đổi API/session/nghiệp vụ hoặc web Vite/Flutter.
- PASS RN108/108 test/typecheck; lint0error8warning cũ; export Android/iOS/web13routes.
  Android35 x86_64:390dp100%,320dp130%, ảnh/Back, tình trạng, metadata, tên/giá dài,
  mất kết nối và retry, lối vào tài khoản. Storage FAKE/QA `*_test` riêng.
  Fresh Impeccable reviewer verdict **ship** phạm vi detail,13 ảnh; không có material fix.
  Standalone QUALITY BAR card chưa cung cấp riêng; dùng direction đã duyệt/brief màn.
  Documenter không yêu cầu đổi DESIGN/sidecar; recipe/components đã cập nhật.
  QA đã dừng/dọn database/users/roles;14 ảnh hợp lệ giữ trong báo cáo.
  Không push/PR/merge/deploy; READINESS giữ nguyên.

## Checkpoint tìm sách — `2f766ca`

- Chủ dự án duyệt redesign Android trước; nhánh `codex/android-search-redesign`
  từ `270acbf`, checkpoint subject `feat(rn): redesign Android book search`.
- RN tìm sách: danh sách dọc, search cố định, Bộ lọc có nhãn, câu chữ trực tiếp;
  Be Vietnam Pro400/700 thay Lora, target48dp và navigation sáng. Hai prototype
  cùng fixture ở showcase; chọn danh sách. Không đổi API/session/nghiệp vụ;
  Vite/Flutter chưa redesign. [Brief](../design/ANDROID_SEARCH.md),
  [checks/ảnh native](../ui/ANDROID_SEARCH_REDESIGN.md).
- PASS RN108/108 test/typecheck; lint0 error,8 warning wishlist có sẵn. Android35
  x86_64: search/detail/Back/filter, chữ130%,320dp, Gboard, rỗng/lỗi/retry được
  thao tác; storage FAKE/database `*_test` riêng. Review độc lập yêu cầu bỏ viền
  lỗi dày; đã sửa/recapture, verdict ship cho fix đã chấm. Token-bearing DESIGN và sidecar được đối chiếu
  bởi documenter. Taste là reference, Impeccable pinned là quy trình.
- PASS export Android/iOS/web13 route, docs248 file/1750 links/4 adapters,
  formatting và diff; QA đã dừng/dọn database/users/roles. Không đóng READINESS,
  không human sign-off/TalkBack/ARM/iOS/release, không push/PR/merge/deploy.
  Stash, nhánh và local work teammate giữ nguyên.

## Checkpoint design tools — `270acbf`

- Chủ dự án duyệt tích hợp Impeccable/brief/critique, nhánh
  `codex/impeccable-ui-workflow` từ `2e13f04`. Checkpoint subject
  `feat(design): pin Impeccable workflow and record UI critique`.
- Vendored Impeccable4.5.2 tại SHA `d631a8827f99414d2b6daba4ef08b7f8701751d7`,
  engine0.1.14/checksums; wrapper `pnpm ui:design`, adapter Claude, context shared
  và native. [DESIGN root](../../DESIGN.md) thay ràng buộc thẩm mỹ UI-1: Lora không
  còn bắt buộc, sans cho tác vụ, ngôn ngữ rõ; runtime UI chưa đổi. Taste chỉ reference.
- [Workflow/evidence](../design/IMPECCABLE_WORKFLOW.md),
  [critique độc lập3 màn](../../.impeccable/critique/2026-10-09T16-53-10Z__apps-user-web-src-pages.md).
  User cho phép chạy lại; A `/root/ui_review_a_fresh` và B `/root/ui_review_b_retry`
  hoàn tất source/browser riêng. Parent đọc B sau A final. Điểm A12/22/22 trên40
  không là usability/human acceptance; source chưa đổi, không nhận chênh điểm là
  regression. [Lượt đầu DEGRADED](../../.impeccable/critique/2026-10-09T16-30-59Z__apps-user-web-src-pages.md)
  giữ lịch sử. Checkpoint lượt chạy lại: `docs(design): complete independent UI critique`.
- PASS: vendor64 file, pinned engine/probe/cache từ chối file hỏng, context web/
  native adaptive, skill validatorUTF8, docs:check bốn adapters, diff whitespace.
  Detector0 findings nhưng browser/source chỉ ra lỗi sort/filter/mobile/câu chữ/
  state/form. API build để dựng QA, không nhận là full API test PASS.
- QA riêng/storage fake đã dừng/dọn DB/users/roles; không native/live Supabase/
  human sign-off/remote CI. Không đổi source sản phẩm/contract/migration, không
  push/PR/merge/deploy; giữ READINESS và stash/nhánh teammate.

## Checkpoint docs trước đó — `2e13f04`

- Dọn tài liệu theo yêu cầu chủ dự án, nhánh `codex/docs-refresh` từ `d77290a`.
  Checkpoint subject `docs: refresh current guides and archive outdated session notes`.
- Cập nhật README/setup/kiến trúc/code map theo source, thêm user-web React/Vite,
  tách DirectDelivery F2h với ViaPoint completion đã có code nhưng chưa đóng gate.
  Nhật ký dài chuyển nguyên nội dung sang [SESSION_HISTORY09/10](SESSION_HISTORY_2026_10_09.md).
  README API cũ chuyển sang [API README history](../../apps/api/README_HISTORY_2026_10_09.md).
- [Audit docs09/10](DOCS_AUDIT_2026_10_09.md) ghi phạm vi, lưu trữ và checks.
  Không đổi code/contract/migration/data, không push/PR/merge/deploy.
- PASS: `pnpm docs:check` (191 Markdown/1572 link local/3 skill-adapter pairs),
  SRS HTML render + `--check` (33 snapshot lịch sử không đổi), `git diff --check`.
  Hai archive giữ nội dung (bỏ khoảng trắng cuối hai dòng history); trạng thái
  gate và các dòng FR/BR/POL không đổi.
  Không chạy lại test sản phẩm vì chỉ sửa docs và renderer tài liệu.

## Phần đã nhập main

| Gói | Git source | Phạm vi / giới hạn |
| --- | --- | --- |
| Mongo và UI/dev workflow | PR5/6, PR15 | Replica set/runtime và UI/dev tooling đã tích hợp; full native/review còn mở |
| Price assist/wishlist | PR18/20, PR19 | Advisory AI/lookup dưới cờ, wishlist thật; eval/search quota và nguồn reviewed còn gap |
| User web + gộp Minh/Nhật | PR21/22/24/25 | React/Vite app, listing/search/detail/sell thật; reload submission recovery chưa hoàn chỉnh |
| Backend auction | PR23 `78c9a8d` | Intake/bid/point Order/pay/code/inspection + completion/claim/return/violation source |
| Purchase conversations | PR26 `070949e` | Sale/Both Reserved24h, participant chat/expiry; không Order/payment/hold |
| Search/auth/nav web | PR27/29 | Search layout, navbar/auth animation/favicon |
| Auction web/live/inbox | PR28 `da59199` | Bidding/Auto/pay, public socket/inbox; post-payment point steps chưa đủ UI |

Bằng chứng test từng gói có trong PROJECT_CONTEXT, feature reports và lịch sử.
Không coi các số PASS từ SHA cũ là kiểm lại toàn main. Exchange web vẫn mock;
register/profile scaffold, admin dashboard mẫu; Flutter scaffold.

## Việc và gate còn mở

- [READINESS](READINESS.md) giữ trạng thái: Android PARTIAL, TalkBack/ARM/iOS OPEN,
  review tiền/quyền/UX người thật OPEN, release/hậu-F2h BLOCKED. Chưa có evidence
  mới đóng gate trong gói docs hoặc critique này.
- DirectDelivery tới F2h; ViaPoint auction có source inspection/claim/return/
  settlement worker. Cần đối chiếu gate và review trước mở rộng; không chạy worker
  trên DB chính để thử mâu thuẫn tài liệu. Point LOCKED handlers còn gap decorator
  đã ghi trong context; không sửa nghiệp vụ/quyền bằng đợt dọn docs.
- Price assist: cờ tắt mặc định; live eval34 ca/nguồn reviewed chưa có, search quota
  429 là blocker theo report05–06/10, chưa probe lại. Không tự bật cho demo.
- Web sell: recovery reload/ảnh lỗi vĩnh viễn còn gap; Exchange mock nhiều-cuốn/
  meetup lệch SRS một-cuốn/DirectDelivery-ViaPoint, không dùng làm contract backend.
- Native OS dark/API35 ba nút có lỗi tương phản đã ghi; TalkBack/ARM/FPS/iOS/
  release và review người thật chưa được đóng từ các lần build/export.
- SCRIPT credential trong lịch sử Git đã được ghi ở PR24; việc rotation chưa
  xác minh. Không chạy script lịch sử hoặc trích secret vào chat/artifact.
- Owner/reviewer/deadline mới cần theo nhiệm vụ thực tế; kế hoạch demo06/10
  là lịch sử, không là lịch hiện hành.

## Công việc local phải bảo toàn

Stash `e9a4e80` trên `codex/openai-price-provider` (adapter WIP), stash `e988200`
trên `codex/system-architecture`; RN UX `codex/listing-ux` head `891e851` chưa nhập
main. Không pop/drop/reset/cherry-pick để tiếp nhận context. `.env`, `.tmp`, backup/
DB/bucket/process của người dùng giữ nguyên. Metadata máy chỉ dùng ở local notes;
không lấy port/PID/account/config trong lịch sử làm cấu hình mặc định máy mới.

## Bước tiếp

Chat mới dùng [prompt](NEXT_SESSION_PROMPT.md), kiểm Git/source thực tế và nhận
gói cụ thể. Setup theo [START_HERE](START_HERE.md)/[DEVELOPMENT](../DEVELOPMENT.md),
QA `*_test` riêng, skill/checks theo [AI_WORKFLOW](../AI_WORKFLOW.md).
Gói Android search/detail và làm rõ lưu đã ở các nhánh ghi trên; bước tiếp là
pilot nhóm theo protocol mới, xử lý P0/P1 rồi thực thi brief đăng sách.
Không coi các màn ngoài phạm vi là đã redesign hoặc đã có quyền merge/release.
[CONTINUATION_PLAN](CONTINUATION_PLAN.md) là backlog có gate, không tự cấp quyền
code tính năng mới/merge/deploy. Cập nhật mục của mình, không nối nhật ký dài lại.

## Lịch sử

[28–30/09](SESSION_HISTORY_2026_09_30.md),
[các checkpoint tới trước đợt dọn09/10](SESSION_HISTORY_2026_10_09.md).
Giữ evidence và ghi nhận teammate ở đó; tình trạng chưa merge/SHA/PID là mốc cũ.
