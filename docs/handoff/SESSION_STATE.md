# Điểm lưu hiện tại — 13/10/2026

Source tích hợp: `feat/rn-ui-redesign-navbar-auctions`, PR #37.
OpenAPI 0.34.0 trên `main` (nhánh N4-05: 0.35.0), 22 migration Mongo, 134 HTTP operation / 23 controller.

## N4 Phase 2 — vận hành điểm — 14/10/2026

Người giao việc duyệt Phase 2 ngày 14/10/2026. Gate READINESS không đổi; chỉ có source
và evidence trên `*_test`. Chi tiết quyết định: ADR 0030 amendment 2026-10-14.

| Gói | Nhánh (base) | Nội dung |
| --- | --- | --- |
| N4-10/11 | `feature/n4-10-11-points-assignments` (từ N4-05) | OpenAPI 0.36.0, migration 0022: Admin tạo/sửa điểm, trạng thái, sức chứa, phân công/kết thúc phân công; `/me/point-assignments`; admin-web trang Điểm giao nhận |
| N4-12 | `feature/n4-12-inspection-evidence` → RN `feature/n4-12-rn-evidence` (từ N4-09) | 0.37.0, migration 0023: bảng kiểm, NeedsEvidence, người bán bổ sung một lần trong 48 giờ, nhân viên khác quyết định, biên bản bất biến; admin-web, user-web, RN |
| N4-13 | `feature/n4-13-incidents` | 0.38.0, migration 0024: sự cố có/không có đơn, đóng khẩn cấp, quỹ mô phỏng 2.000.000đ; Admin độc lập quyết định; không chi vào ví |
| N4-14 | `feature/n4-14-deadlines` | 0.39.0: hạn kiểm tra/nhận lại và `/operations/escalations` tính khi đọc, không worker tự hành động |

- Kiểm tra: API typecheck, contract check/routes (150 operation), `auctions.e2e-spec.ts`
  54/54 trên QA replica set; admin-web typecheck/lint/28 unit; user-web
  typecheck/lint/119 unit; RN typecheck/lint/142 unit PASS. Browser admin-web trên API
  thật + DB `ops_browser_*_test` (fixture tạm): bảng kiểm, NeedsEvidence, quyết định
  bằng chứng, báo/quyết định sự cố và quỹ, việc quá hạn, tạo/phân công/mở điểm, từ chối
  đóng điểm còn sách, 375 px không tràn.
- Nhánh tích hợp `feature/n4-auction-operations` (main `7a52d08` + mọi nhánh N4): full
  API E2E 626/626, `schema.mongo-spec` PASS sau khi thêm 3 collection Mongo-native vào
  phép đếm; admin-web `test:browser`, user-web `test:browser`/`test:exchange:browser`,
  RN export web PASS. Hai lệnh tạo (điểm, sự cố) trả 200 như contract test yêu cầu.
  RN/user-web browser cho bằng chứng, native, human review NOT RUN.
- Giới hạn: chưa thông báo thành viên khi đóng khẩn cấp; bằng chứng chỉ là văn bản;
  bồi thường chỉ ghi duyệt, chưa chi ví; giờ mở cửa vẫn cố định.

## N4 Phase 1 — đấu giá & vận hành trên client — 13/10/2026

Kế hoạch: nhánh `docs/n4-auction-operations-plan`. Mỗi gói một nhánh, commit local,
**chưa push/PR**. Phase 2 (N4-10…14: CRUD điểm, phân công, NeedsEvidence, incident,
quá hạn) chưa làm: READINESS vẫn chặn mở rộng nghiệp vụ, cần chủ dự án duyệt.

| Gói | Nhánh (base) | Nội dung |
| --- | --- | --- |
| N4-01…05 | `feature/n4-01-operations-shell` → `-02-intake-desk` → `-03-collection-desk` → `-04-resolution-desk` → `-05-auction-cancel` (chuỗi từ `main` `7be68a4`) | admin-web "Điểm và đấu giá": Staff nhận/kiểm tra/mở phiên/trả sách, giao sách bằng mã và nhận lại sách trả; Admin quyết định đơn tại điểm theo ma trận API, hủy phiên. `core/command.ts` dùng chung với review (body/key cố định, retry cùng request) |
| N4-05 API | cùng nhánh N4-05 | OpenAPI **0.35.0**: `GET /operations/auctions` (ADMIN, chỉ đọc) trả version cho lệnh hủy, gồm OnHold, loại phiên Admin bán/trả giá. ADR 0030 có amendment |
| N4-06 | `feature/n4-06-web-after-win` (từ `main`) | user-web: xem biên bản, đồng ý/từ chối, lấy mã nhận (hiện một lần), khiếu nại; toast bị vượt giá theo luật hòa FR-AU04 |
| N4-07…09 | `feature/n4-07-rn-auctions` (từ `fix/rn-auction-card-listing-id`) → `-08-rn-after-win` → `-09-rn-seller-intake` | RN: danh sách/chi tiết phiên, trả giá/Auto/mua ngay, trạng thái dẫn/hòa/bị vượt; Phiên của tôi và các bước người thắng; gửi sách đấu giá và rút |

- Kiểm tra: admin-web typecheck/lint/28 unit, user-web typecheck/lint/119 unit, RN
  lint/typecheck/142 unit PASS; API typecheck/lint/130 unit, contract check/routes
  (137 operation) và `auctions.e2e-spec.ts` 50/50 trên QA replica set PASS. Full API
  E2E/Mongo suite NOT RUN cho thay đổi này.
- Browser trên API thật + DB `ops_browser_*_test` (fixture tạm, storage fake): mọi thao
  tác Staff/Admin, các bước người mua web, RN web 375 (kể cả ca 300k hòa: người đặt
  sau thấy "trả bằng người dẫn giá"). Fixture **dời AuctionClock tới 10:00** khi điểm
  đóng cửa (như e2e pin clock), không đổi luật server. Native Android/iOS, 320 px,
  `test:browser` mở rộng, human review NOT RUN.
- Sửa thêm khi kiểm: mã nhận dán "436 147" mất số (maxLength trước khi lọc); cỡ chữ mã
  ở web; RN không hiện giá khởi điểm như giá đã trả cho đơn mua ngay.
- Ghi nhận ngoài phạm vi: màn tài khoản RN có huy hiệu "Bạn đọc uy tín ★ 4.9" và nội
  dung mock (AGENTS cấm bịa rating/trust badge) — chưa sửa.

## Mobile React Native CI Lint & Design Token Remediation — 13/10/2026

- PR #37 (`feat/rn-ui-redesign-navbar-auctions`): Khắc phục lỗi CI `react-native-ci.yml`
  khiến `pnpm --filter @used-books/mobile-react-native lint` thất bại (535 problems: 496 errors, 39 warnings),
  và lỗi `operations-ci.yml` tại `pnpm test:public:browser` (`test-public-shelf.mjs` báo `6 !== 12`).
- Nguyên nhân:
  1. `eslint.config.js` chặn hardcoded hex/rgba string literals trong `src/features/**` và `src/app/**`.
  2. Chặn import trực tiếp `Modal` và `TextInput` từ `"react-native"` trong routes/features.
  3. Lỗi unescaped quotes `"` trong JSX text ở `account-screen.tsx`.
  4. Các biến/import dư thừa chưa dùng.
  5. `shelf-screen.tsx` trước đó giới hạn hiển thị `slice(0, 6)` và lược bỏ các components của contract browser test (`ShelfSearchHeader`, `ShelfFilterSheet`, pagination buttons `Trang tiếp`/`Trang trước`).
- Khắc phục:
  1. Mở rộng `stitchTokens` trong `apps/mobile-react-native/src/core/ui/theme.ts` với đầy đủ bộ token màu dùng chung cho giao diện Stitch.
  2. Tạo component dùng chung `AppModal` (`src/core/ui/modal.tsx`) và `AppTextInput` (`src/core/ui/field.tsx`), export qua `src/core/ui`.
  3. Thay thế toàn bộ color literals trong 19 files feature bằng `stitchTokens.*`.
  4. Thay thế `Modal` bằng `AppModal`, `TextInput` bằng `AppTextInput` trong các modals và forms.
  5. Xử lý escape quotes `&quot;` và dọn dẹp toàn bộ unused imports/vars.
  6. Khôi phục `ShelfResults` (hiển thị đầy đủ 12 kết quả trang đầu), `ShelfSearchHeader`, `ShelfFilterSheet` (`src/features/shelf/shelf-filter-sheet.tsx`), phân trang `Trang tiếp`/`Trang trước` phục vụ contract `test-public-shelf.mjs`, đồng thời bảo toàn mục đấu giá sách trực tiếp (`HomeFlashDeals`) trên trang chủ.
- Kiểm tra cục bộ:
  - `pnpm contract:check` PASS (OpenAPI types current).
  - `pnpm --filter @used-books/mobile-react-native lint` PASS (0 errors, 0 warnings).
  - `pnpm --filter @used-books/mobile-react-native typecheck` PASS (0 errors).
  - `pnpm --filter @used-books/session-client test` PASS (2 files, 21 tests passed).
  - `pnpm --filter @used-books/mobile-react-native test` PASS (20 files, 133 tests passed).
  - `pnpm --filter @used-books/mobile-react-native export:all` PASS (iOS, Android, Web static routes bundled successfully).

Checkout/gói Android và WIP của các thành viên được ghi bên dưới.
Remote CI và human sign-off phải kiểm riêng trên PR trước merge.
Tổng quan: [PROJECT_CONTEXT](PROJECT_CONTEXT.md); [inventory](PROJECT_CONTEXT_INVENTORY.md).

## Web mở phiên đấu giá từ sách — 12/10/2026

- Nhánh `feature/auction-create-from-book`, [PR35](https://github.com/huangg49/used-book-marketplace/pull/35)
  (#34 đóng, thay bằng #35): `apps/user-web` thêm `/auctions/new` gọi
  `POST /auction-intakes` (contract có sẵn, không đổi OpenAPI/API). Chọn sách
  Bán đã duyệt/hiển thị/Sẵn sàng, điểm từ `/handover-points`, lưới giá
  start/step/mua ngay theo POL-39; giữ expectedListingVersion, khóa body/key
  khi mất phản hồi. Khối so sánh bài đăng bán và phiên đấu giá dùng giấy
  vàng bơ của bookmark đấu giá; phiếu xem trước và biên nhận hạn gửi 72 giờ.
- Lối vào: nút "Đưa lên đấu giá" trên Kệ sách (chỉ sách đủ điều kiện), CTA
  ở danh sách đấu giá; Đấu giá của tôi có "Sách chờ mở phiên" với rút sách.
- Web typecheck/lint/119unit PASS. Browser 1366/390 chỉ chạy trên mock API
  QA cục bộ (API thật cần cấu hình riêng): chọn sách/điểm, lỗi lưới giá,
  xác nhận, biên nhận, intake list, preselect từ kệ, không tràn ngang. Luồng
  với API/Mongo thật, rút sách thật, 200% zoom và human review NOT RUN.
- Thêm: báo hòa giá (FR-AU04, người cam kết trước dẫn) thay cho "bị vượt giá";
  bố cục lại "Về bản sách này"/"Thông tin phiên". Kiểm trên API+Mongo local thật
  (Mongo Docker cổng 27019 vì mongod Windows giữ 27017). Chưa merge/deploy.

## Tích hợp Member/main — 12/10/2026

- Theo kế hoạch được duyệt, tích hợp trong managed worktree riêng trên
  `codex/integration-main`; candidate `30953d0`, main `53a2673`.
  WIP checkpoint `3dcda7a`, merge `c8de21e`; subject phần nối cuối
  `fix(exchange): connect member UI to integrated main backend`.
- Giữ giao diện Member và module/ba migration exchange của Đại; union
  registry/schema/catalog/auth/OTP, checksum cũ không đổi. Client command
  dùng contract thật, revision/key/body; bỏ fallback mock và thống kê giả.
  Chọn một sách, tiền bù/cọc/state thật; xác nhận intent cũ khi mất phản hồi,
  kể cả đọc listing không còn công khai. Chi tiết sách có CTA đổi thật.
  Chat/report/review/đề xuất lại/gợi ý tự động vẫn ghi chưa khả dụng.
- API620E2E/130unit; Mongo40PASS/4SKIP, schema recheck19PASS gồm2upgrade
  mới; web119unit/build/lint0error,21session; Admin15/RN122unit và
  typecheck PASS; dev15PASS. Browser shelf/detail/sell/purchase và exchange
  desktop/mobile PASS, gồm denied read, mất ACK, lỗi ví, dữ liệu form.
  Thêm User Web CI lint/build/unit/session và browser QA riêng.
- [Bằng chứng và giới hạn](../verification/INTEGRATION_MAIN_2026_10_12.md).
  Primary WIP/runtime/DB không sửa/reset/seed; READINESS không đổi.
  Native/Safari/live storage/Brevo thật NOT RUN. Đã push và tạo
  [PR nháp33](https://github.com/huangg49/used-book-marketplace/pull/33),
  code checkpoint `2de87d6`. Công cụ CI yêu cầu kết nối GitHub nên chưa
  xác minh remote checks; owner review và reviewer thứ hai cho tiền/quyền
  còn chờ. Chưa merge/deploy.
- Theo ảnh log CI chủ dự án gửi, User Web CI lượt đầu FAIL ở
  `tests/integration.mjs`: selector toàn trang cho “Đăng sách của bạn” khớp
  cả CTA cuối Home và footer. Sửa trong cùng nhánh bằng scope region có tên,
  chờ footer xuất hiện để kiểm trang render đầy đủ và xác nhận URL `/sell`.
  Browser QA riêng chạy hai lượt với `CI=true` PASS; lint PASS; không đổi UI,
  API hoặc giảm assert. Remote rerun sau push vẫn cần xác minh.

## Khảo sát trước tích hợp — 12/10/2026

- Candidate `codex/catalog-expansion`/`30953d0`; fetched main `53a2673` có
  backend exchanges. Chênh6main/98candidate commit;4conflict Mongo/docs và
  virtual merge web báo13TypeScript errors. Commands exchanges từ main thiếu
  command key, cố định version và nuốt lỗi; chưa nên merge.
- Clean HEAD: build/111unit/lint web,21session tests, API/admin/RN typecheck,
  contract/routes và docs PASS; chưa kiểm bản merge/browser/Mongo tích hợp/
  remote CI/human. WIP teammate và runtime giữ nguyên; chỉ thêm tài liệu review,
  chưa push/PR/merge/deploy. [Kết quả và bước tiếp](../verification/PREMERGE_CATALOG_2026_10_12.md).

## Runtime local — 12/10/2026

- Theo yêu cầu bật backend để đăng nhập, chạy `pnpm dev:api` trên
  `codex/search-compact-dropdowns` (`884a30e`). API3000 và worker ảnh/đơn hàng
  đang chạy; Mongo27017/Vite5186 giữ nguyên. Readiness HTTP200 và login CORS
  preflight HTTP204 cho `http://127.0.0.1:5186` PASS. Không thử đăng nhập,
  seed/reset DB, đổi tài khoản hoặc cấu hình; WIP teammate/READINESS giữ nguyên.

## Danh mục / thể loại — mở rộng v2 ngày12/10/2026

- Nhánh `codex/catalog-expansion`, base `c8456df`; gói lõi1–5 trong
  [kế hoạch được duyệt](../design/CATALOG_EXPANSION_PLAN.md) đã triển khai.
  Vocabulary cộng thêm17gốc/55con/72mã,25facet/234lựa chọn; tách metadata
  chính xác khỏi context query cha, giữ OR/AND, dependency và cursor version.
  OpenAPI0.34.0/generated, migration0019 đóng băng;0016/revision cũ giữ nguyên.
  Navbar/Home khám phá toàn hệ thống; Search/Sell/Detail/Admin cùng registry,
  RN parse/gửi lại giữ classification. Preview118ấn bản có nguồn, phân loại/
  giá/tình trạng là mẫu;16gốc có sách, Sách khác trống đúng trạng thái.
- API130unit, web111unit, Admin15unit, RN2unit;93HTTP/Mongo E2E và17schema
  PASS. Final classification7test kiểm nhánh âm nhạc sau cập nhật rule.
  Build API/Web/Admin, typecheck4app, RN exportAndroid/iOS/web và contract
  check/routes125operation/22controller PASS. Lint0error,5warning Exchange
  và4warning wishlist cũ. Bundle warning đã biết; export không là native PASS.
- Chromium1366/390/320 trên QA riêng: query cha N3|TOEIC ANDgrammar, pruning,
  chip/Back, menu tìm không dấu/Escape, dialog mobile/Apply, Sell bước2→1,
  Detail→liveSearch và Admin Confirm đã kiểm.14ảnh cuối đã được finish
  reviewer độc lập kiểm, verdict **ship** phạm vi UI, không thay human review.
  Detector một lượt `[]`. [Evidence và giới hạn](../../.impeccable/review/catalog-v2/README.md),
  [ADR0035](../adr/0035-catalog-vocabulary-v2.md). Native/Safari/phone thật/
  200%zoom/load production/remote CI/human NOT RUN; READINESS không đổi.
- Local DB đã có0016–0018, áp dụng đúng0019 qua `pnpm db:migrate`, không seed/
  reset/backfill. API trước đó mất listener nên bật lại bằng `pnpm dev:api`;
  taxonomy3000 HTTP200/v2/72node, web5186 HTTP200. QA DB/users/roles đã dọn,
  container QA đã dừng; runtime chính giữ chạy. Admin CRUD, sửa Confirmed,
  RN UI đầy đủ, facet counts và auction filter vẫn deferred. WIP teammate
  Chat/Notifications/MainLayout/Home CSS bảo toàn. Chưa push/PR/merge/deploy;
  checkpoint subject `feat(catalog): expand categories and contextual classification`.

## Đấu giá web —12/10/2026

- Motion follow-up: `codex/auction-motion`, base `9479303`, checkpoint subject
  `feat(web): add meaningful auction motion`. Giá/lượt lịch sử mới nhấn màu giấy,
  trạng thái dẫn/bị vượt có phản hồi; phiếu và một nhịp Gavel chỉ sau ACK thành công.
  Card dùng snapshot/WAAPI220ms khi lọc/sắp xếp, ngắt từ vị trí đang hiển thị;
  auto dialog220ms/chuyển bước200ms, giữ input/focus/Escape, nút mobile không cắt giá.
  Không animation đồng hồ mỗi giây, không optimistic win/receipt, không đổi
  API/auth/validation/key/body hoặc thêm dependency. Giữ chính sách ép animation.
- Build(TS)/109unit/lint0errors PASS (5warning Exchange/bundle cũ). Chromium desktop
  1280/1366 và mobile390, actual reduced-motion=true: giá/Gavel/card có chuyển động,
  auto rejection giữ input, gateway503 sau commit không báo success, retry trả
  receipt cũ;503 read giữ cache và khôi phục. [Evidence motion](../../.impeccable/review/auction-motion/README.md).
  AI full finish review **ship**, no material fixes; không thay human/FPS proof.
  Detector một lượt2 advisory màu trạng thái cũ, không chạy lại. Native/phone thật/
  Safari/speech/fullzoom/continuous FPS/remote CI NOT RUN; API tests không chạy lại
  vì source API không đổi. READINESS/gate giữ nguyên; WIP teammate được bảo toàn.
  Hai surface brief đã cập nhật, giữ DESIGN/sidecar và ghi nhận prose cũ.
  QA đã dọn0 database/user/role, dừng QA runtime/Mongo; API chính mất listener
  dù watcher còn sống nên restart nhóm process sở hữu với config/data giữ nguyên.
  API readiness3000/web auctions5186 HTTP200; web giữ chạy. Chưa push/PR/merge/deploy;
  bước tiếp xem phiên đang mở để
  trải nghiệm phản hồi giá, human review/tích hợp theo TEAMWORK.

- `codex/auction-web-refine`, base `f0c3115`, checkpoint subject
  `feat(web): refine auction browsing and personal sessions`: giữ luồng giá/
  auto/mua ngay/thanh toán; đổi list/detail theo brand, ảnh và tình trạng từ
  revision đã duyệt/kiểm tra. `/my-auctions` có bốn view và phân trang cursor
  gắn actor/view, sidebar/menu dùng chung cấu hình. Không N+1 participation ở
  public list; không công khai mức trần hoặc danh tính bidder.
- Contract bổ sung read metadata/photo đấu giá và member page; photo kiểm quyền
  trước/sau ký URL. Không sửa migration hoặc write workflow. Unknown payment
  retry giữ order/version/key. Lỗi auto giữ số tiền, lỗi refresh giữ cache kèm
  cảnh báo;401/403 không hiển thị cache riêng bị từ chối. Mobile dropdown rõ chữ.
-49 auction HTTP/Mongo tests và102 web unit PASS; API typecheck/build/lint,
  web build/lint, contract generate/check/routes125operations/22controllers PASS.
  Có5 warning Exchange và cảnh báo bundle Vite có sẵn. Browser1366×900/390×844
  trên QA Mongo riêng/fake storage, gồm bid/auto/gallery/filter/private tabs,
  auto rejection đồng thời,503 giữ nội dung và403 ẩn rows riêng.
  [Evidence và giới hạn](../../.impeccable/review/auctions/README.md).
- AI finish review yêu cầu3 sửa; verdict pass **ship**,3/3 resolved, không là
  human review hay whole-surface re-review. Detector một lần1primary/22advisory;
  bỏ thumb giả/stripe cũ, đồng bộ token cục bộ; không chạy detector lần hai.
  READINESS và gate nhận sách/inspection/settlement không đổi. Không seed DB chính.
- Ba surface brief đấu giá đã đồng bộ; giữ DESIGN/sidecar, ghi nhận prose đấu giá
  cũ chưa phản ánh bản mới. Các vai trò màu có sẵn được bind trong phạm vi component.
  QA đã dọn database/users/roles,0 browser DB còn lại; dừng runtime/container QA.
- Chưa push/PR/merge/deploy. WIP Chat/Notifications/MainLayout/Home của teammate
  giữ nguyên. Backend3000/web5186 chính tiếp tục chạy. Native/điện thoại thật/
  Safari/speech screen reader/full browser zoom/live Supabase/remote CI và ca
  unknown-payment mất mạng ở browser NOT RUN. Bước tiếp: chủ dự án xem
  `/auctions` và `/my-auctions`, human review/tích hợp theo TEAMWORK.

## Tổng quan tài khoản, pha trộn profile Minh —12/10/2026

- Refinement theo phản hồi "hơi thường": `codex/account-overview-refine`, base
  `5350059`, checkpoint subject `feat(web): personalize overview shelf guidance`.
  Chủ dự án chốt Tổng quan trước, Hồ sơ sau. Greeting đỏ rượu/kem, tên thật và
  asset chim cánh cụt hiện có; thêm gợi ý việc trên kệ với3 query riêng limit1 theo
  owner/filter. Ưu tiên Rejected → Draft → PendingReview, không suy từ4 bài gần
  đây hoặc tạo số tổng. Kiểm lại khi vào trang; loading/error/403 và retry cục bộ.
  Link vào filter kệ có thật; không hứa sửa tiếp nháp chưa có UI.
- Build/102 unit tests/lint PASS (5 warning Exchange cũ),11 nhóm browser PASS
  trên QA Mongo riêng/fake storage, gồm bài bị từ chối nằm ngoài4 bài mới nhất.
  [Evidence refinement](../../.impeccable/review/account-overview-refined/README.md).
  Detector một lần:1 advisory cỡ chữ tên max22px ngoài ramp, lựa chọn local có
  chủ đích; không đổi DESIGN/token toàn cục. Giới hạn native/Safari/speech/full
  browser zoom/live Supabase/human/CI như bản đầu bên dưới. Profile/API/DB/auth/
  Home/READINESS và WIP teammate giữ nguyên. Backend/web chính vẫn chạy.
  Full AI review yêu cầu bỏ eyebrow/Library ở vùng gợi ý; đã sửa và recapture11
  ảnh. Verdict pass ship: P2 duy nhất resolved, không là whole-surface/human
  review mới. QA đã xóa database/users/roles riêng, xác nhận0 database browser
  còn lại, dừng API/Vite/images và Mongo QA của lượt này.
  Chưa push/PR/merge; bước tiếp xem `/account`, đồng bộ Hồ sơ là gói sau.

- `codex/account-overview`, base `2b4e557`, checkpoint subject
  `feat(web): add personal account overview`: triển khai giai đoạn1 của
  [kế hoạch đã duyệt](../design/WEB_PROFILE_BLEND_PROPOSAL.md), dựa trên nghiên
  cứu profile Minh (`36cb0c0`). `/account` có greeting, ví thật chỉ đọc kèm nhãn
  mô phỏng,4 bài gần đây,3 thông báo đấu giá và lối filter kệ. Menu/sidebar dùng
  chung cấu hình; Profile/MyBooks giữ trang riêng. Tách OwnerListingRow dùng
  chung, giữ ba trục moderation/visibility/trade, query theo owner và limit.
- Loading/empty/error/retry cục bộ;403 khác kệ trống, không hiển thị cache bị
  từ chối. Chuyển tài khoản không lẫn dữ liệu; chỉ thông báo được mở mới đánh
  dấu đã đọc. Không đổi API/DB/auth/Home/token toàn cục hoặc READINESS.
- Build PASS;99 tests PASS; lint PASS với5 warning Exchange có sẵn; detector
  một lượt `[]`.9 nhóm browser PASS trên API/Mongo QA riêng,8 ảnh desktop/mobile/
  empty/error/locked hợp lệ; [evidence và giới hạn](../../.impeccable/review/account-overview/README.md).
  Independent AI finish-review: ship, không material fixes; không thay human review.
- NOT RUN: native/điện thoại thật/Safari/speech screen reader/full browser zoom
  125% hoặc200%/live Supabase/remote CI. Chỉ main-content CSS zoom200% đã kiểm.
  Fixture dùng fake storage và database `*_test`; đã xóa database QA, dừng runtime
  và container QA của lượt này. Backend3000/web5186 chính vẫn chạy, không ghi DB chính.
- Giai đoạn2 orders/wishlist và giai đoạn3 đấu giá cá nhân/aggregate vẫn là
  đề xuất cần contract/projection; không tự mở rộng. WIP teammate được giữ nguyên.
  Bước tiếp: chủ dự án xem `/account`; human review/tích hợp theo TEAMWORK.
  Chưa push/PR/merge.

## Navbar — đồng bộ khi chuyển trang —12/10/2026

- `codex/navbar-route-sync`, base `884a30e`, checkpoint subject
  `fix(web): synchronize navbar with route scroll resets`: sửa trạng thái thu gọn
  còn sót sau khi về đầu trang. Header đồng bộ lúc mount/đổi pathname trước paint,
  kiểm thêm frame kế tiếp và dọn listener/frame khi rời trang. Giữ48/16px hysteresis,
  CSS morph/viền sáng; không sửa MainLayout hoặc WIP teammate.
  Web84tests/build(TS)/lint PASS (5warning Exchange cũ); Chromium1280/390px
  Home/Search scroll, chuyển trang/mobile menu, scrollY0/floatingfalse và không
  overflow PASS. Authenticated Sell→Home/account runtime chưa chạy vì tab anonymous;
  lifecycle reset không scroll event/mount/cleanup có unit regression. Safari/
  physical mobile/speech/human/CI NOT RUN. [Evidence](../../.impeccable/review/navbar-route-sync/README.md).
  QA riêng dọn; API/Vite/Mongo giữ chạy, READINESS giữ nguyên, chưa push/PR.

## Đăng sách — phiếu thông tin sách —12/10/2026

- Follow-up `codex/posting-field-focus`, base `30f6df3`, checkpoint subject
  `refactor(web): simplify posting field focus`: chỉ CSS Sell, bỏ outline ngoài
  ở text input/textarea/select; viền liền nét và nhãn đỏ rượu, title chỉ dòng dưới.
  Focus-visible thêm inset1px sát viền; lỗi giữ rust role chuẩn gắn local, motion
  màu170ms theo chính sách chủ dự án. API/validation/dữ liệu giữ nguyên.
  Build(TS)/format/docs/diff PASS; CUA1440/390/320px, keyboard/title/select/error
  focus/sửa lỗi/giữ dữ liệu PASS. Independent AI review **ship**, docs comparison
  khớp source. [Evidence](../../.impeccable/review/posting-field-focus/README.md).
  CSS-only không chạy lại unit/lint/detector; forced-colors runtime/Safari/speech/
  physical mobile/native/actual125%zoom/fullsubmit/replay/human/CI NOT RUN.
  QA riêng đã dọn, runtime chính/WIP teammate/READINESS giữ nguyên; chưa push/PR.
- Follow-up `codex/posting-choice-clear`, base `7675dec`, checkpoint subject
  `fix(web): allow clearing condition answers and remove duplicate rule`:
  bấm lại đáp án hoặc Space khi đang chọn trả về null/chưa trả lời; mũi tên vẫn
  chọn native. Hint chung có describedby; validation bắt buộc trả lời giữ nguyên.
  Bỏ border cuối câu hỏi, giữ một separator của hàng action; mode không bỏ chọn.
  Web78tests/build(TS)/lint PASS (5warning Exchange cũ); CUA1440/390/320px,
  click/Space/arrow/clear-error-focus/reanswer/Back giữ dữ liệu PASS.
  Docs/diff PASS; independent full AI review **ship**, không material fix;
  document comparison khớp source.
  [Evidence](../../.impeccable/review/posting-choice-clear/README.md). QA riêng
  dọn, API3000/Vite5186/Mongo chính giữ chạy; không fullsubmit/replay/Safari/speech/
  physical mobile/native/actual125%zoom/human/CI/push/PR/READINESS change.
- Follow-up `codex/posting-choice-rows`, base `dfe5f57`, checkpoint subject
  `refactor(web): clarify posting choices and eligibility rows`: chủ dự án yêu
  cầu sửa nhóm Có/Không quá trống. Ba câu hỏi thành dòng kẻ gọn, câu trái/đáp án
  phải desktop, xếp trên/dưới ở600px; ô48px, đỏ rượu/chữ kem/dấu tích khi chọn.
  Bán/Đổi/Cả hai dùng chung mặt chọn52px. Native radio/phím mũi tên/Space/focus,
  dữ liệu và validation giữ nguyên; không đổi API/token/raster/motion.
  Web78tests/build(TS)/lint PASS (5warning Exchange cũ), CUA1440/1280/390/320px:
  keyboard/error-summary focus/chặn đáp án sai/tiến-lùi giữ dữ liệu PASS. Docs/diff
  PASS; independent AI full review **ship**, không material fix trong nhóm chọn.
  [Evidence](../../.impeccable/review/posting-choice-rows/README.md).
  QA riêng đã dọn; runtime chính giữ chạy. Không fullsubmit/replay/Safari/speech/
  physical mobile/native/actual125%zoom/human/CI; không push/PR/READINESS change.
- `codex/posting-book-slip`, base `34f2cc4`, checkpoint subject
  `feat(web): give book entry a library slip hierarchy`. Chủ dự án duyệt hướng
  phiếu sách: hai lối tìm catalog/tự nhập, tên sách lớn trên dòng kẻ, tác giả dưới,
  danh mục/ngôn ngữ cùng hàng desktop, logo gốc/dấu Bản nháp/một ghi chú Melody.
  Preview trống nhẹ, tình trạng/giá hiện theo bước hoặc dữ liệu đã nhập; giữ nền
  Minh/5bước/validation/session/API/payload/exit/submission attempt/retry.
- Web78tests/build(TS)/lint PASS;5warning Exchange cũ/chunk advisory. CUA trên
  Nest/Mongo `*_test` riêng/fake storage:1440×900/1280×720/390×844/320×740,
  giữ dữ liệu qua cách nhập/đổi bước, lỗi tên mở manual+focus summary/trường,
  chọn catalog đã xác nhận/chọn lại, Search consumer mặc định PASS. Một P2 focus
  khi control bị thay đã sửa; Enter QA và ảnh focus PASS. Full AI review thấy
  một finding đó; verdict pass **ship**, scored resolved, không là full audit mới.
  [Evidence](../../.impeccable/review/posting-book-slip/README.md). DESIGN/sidecar/
  surface đã cập nhật, không đổi token/raster/dependency. Drift Auth/motion docs
  có sẵn được ghi nhận, không sửa ngoài scope. READINESS/WIP teammate giữ nguyên.
- Không chạy lại gửi duyệt/lost-response/retry browser của extension giao diện;
  Safari/speech/physical mobile/native/actual125%zoom/human/CI NOT RUN. Detector
  một lần ở phần blend trước trong cùng phiên là `[]`; không scan extension lần2.
  QA tab/viewport/API5191-3009/Mongo57017 disposable được dọn; API3000 và Vite5186
  local chính giữ chạy. Local commit, chưa push/PR; chủ dự án xem trước human
  review/tích hợp.

## Giao diện Đăng sách kết hợp hai bản — 11/10/2026

- `codex/posting-blend-plan`, base đề xuất `dd1dfa4`, checkpoint subject
  `feat(web): blend archival posting desk with guided review`. Chủ dự án đã
  duyệt [phương án](../design/WEB_POSTING_BLEND_PROPOSAL.md). Giữ nền Minh
  (WebP188KB), một thanh5bước ngang, preview trái240px/disclosure dưới1200px,
  form giấy đặc, review đủ metadata/ảnh/tình trạng/giá và Chỉnh sửa từng phần.
  Completion theo validation, lỗi gần trường/liên kết focus từ summary;
  giữ taxonomy/API/session/exit/submission attempt/retry. Motion220/240ms vẫn
  chạy theo chính sách chủ dự án. DESIGN/sidecar/surface/provenance đã cập nhật.
- Web78tests/build(TS)/lint PASS;5warning Exchange cũ/chunk warning. Detector
  một lần `[]`; independent AI finish review **ship**, không thay human review.
  CUA Chromium1440×1000/1280×720/1024×640/390×844/320×740: validation/focus,
  dữ liệu qua lại/exit-cancel,8ảnh/xóa,giá,ownership,reviewedit,gửi duyệt/reset
  PASS trên Nest/Mongo `*_test` riêng/fake storage. [Evidence](../../.impeccable/review/posting-blend/README.md).
  Không email/DB local chính. Browser mất phản hồi/retry, actual125%zoom,
  Safari/speech/physical mobile/human/remote CI NOT RUN. READINESS/WIP khác giữ
  nguyên; QA tab/viewport/runtime/database đã dọn, Vite5186 giữ nguyên. Local
  chưa push; bước tiếp chủ dự án xem giao diện trước human review/tích hợp.
  Follow-up23:48: chủ dự án không login được vì API3000 chưa chạy. Đã bật
  `pnpm dev:api` (API/media/order workers), giữ Mongo hiện có; readiness200 và
  CORS login preflight cho `http://127.0.0.1:5186` PASS. Không reset/seed/đổi
  credential; chưa submit đăng nhập thay chủ dự án. Runtime được giữ chạy.
  Follow-up nền: `codex/posting-background-cover`, base `8f15c76`, checkpoint
  subject `fix(web): cover posting viewport throughout long forms`. Nền fixed
  route-owned/center cover thay ảnh cao theo width và mobile900px; giữ tỉ lệ,
  phủ viewport khi cuộn form, không lan Home. CUA1440×900/390×844 đầu/cuối bước
  Tình trạng1730/2155px PASS, không tràn ngang; build(TS)/docs/diff PASS. Chỉ CSS,
  không đổi form/API; [evidence](../../.impeccable/review/posting-background-cover/README.md).
  QA riêng đã dọn, API3000/Vite5186 giữ chạy; Safari/physical mobile NOT RUN.

## Search — nhóm lọc và xóa riêng — 11/10/2026

- Follow-up12/10 `codex/search-compact-dropdowns`, base `66a79bb`, checkpoint
  subject `feat(web): add compact searchable filter dropdowns`: Search-only
  renderer cho danh mục/nhóm/ngôn ngữ; >900px combobox tìm không dấu, portal cố
  định theo ô44px, hàng36px/max288px, đủ12mục; tự mở trên khi thiếu chỗ. <=900px
  giữ native44px/chevron. Default Đăng sách native; taxonomy/pruning/draft/URL/API
  giữ nguyên. Build(TS)/80unit/lint PASS (5warning Exchange cũ);2SSR regression
  native/injected callback. CUA1280/390/320 mouse/keyboard/search/empty/Escape/
  End/active-descendant/outside/Tab/ApplyURL/mobile draft/nooverflow PASS.
  Detector một lần8advisory cũ ngoài diff, không scan lại.
  Format/docs/diff PASS; independent AI review **ship**; follow-up native label
  focus đã sửa và scored resolved,390px label/viền wine/inset1px/44px/170ms PASS.
  [Evidence](../../.impeccable/review/search-compact-dropdowns/README.md).
  Sell browser auth/fullharness/liveAPI/Safari/speech/physicalmobile/native/
  forcedcolors/human/CI NOT RUN. Tab đóng/viewport reset; Vite5186 giữ chạy;
  không ghi DB/login/email, WIP teammate/READINESS giữ nguyên; chưa push/PR.
- Follow-up12/10 `codex/search-sort-dropdown`, base `a3f4d13`, checkpoint subject
  `feat(web): refine catalog sorting dropdown`: CatalogSort controlled thay native
  desktop bằng menu giấy/dấu tích/44px targets/focus liền; <=600px giữ native.
  Giữ5sort values/nhãn preview-live/update URL/API/filter. Keyboard arrows/Home/
  End/Enter/Escape/typeahead/outside/Tab/Back/resizefocus native PASS trên CUA
  1280/768/390/320px, không tràn ngang; motion140ms theo chính sách chủ dự án.
  Build(TS)/78unit/lint PASS (5warning Exchange cũ); detector một lần9advisory,
  shadow mới chuyển token,8drift cũ ngoài scope; không scan lại.
  Format/docs/diff PASS; independent AI review **ship**, không material fix; docs
  comparison khớp. Ảnh JPEG sửa lỗi capture320, không suy raster là CSSviewport.
  [Evidence](../../.impeccable/review/search-sort-dropdown/README.md).
  Fullharness/liveAPI/forcedcolors/Safari/speech/physicalmobile/native/human/CI
  NOT RUN; không ghi DB/login/email. Tab đóng/viewport reset, Vite5186 giữ chạy;
  WIP teammate/READINESS giữ nguyên; local chưa push/PR.
- Follow-up12/10 `codex/search-filter-focus`, base `2672532`, checkpoint subject
  `refactor(web): simplify search filter field focus`: CSS-only filter desktop/
  dialog, bỏ outline ngoài; viền hiện có + inset liền nét, label/prefix đỏ rượu,
  lỗi giá rust, màu170ms theo chính sách motion. Select giữ dòng dưới, series giữ
  frame cũ; checkbox/radio/nút/search/sort/shared consumers/API không đổi.
  Build(TS)/format/docs/diff PASS; CUA1280/390/320 keyboard/category/series/price/
  exchange/language/error/ApplyURL/draftEscape-reopen/nooverflow PASS.
  Detector một lần9advisory màu/radius cũ ngoài diff; CSS-only không chạy lại unit/
  lint. Independent AI review **ship**, không material fix; docs comparison khớp.
  [Evidence](../../.impeccable/review/search-filter-focus/README.md).
  Forced-colors runtime/Safari/speech/physical mobile/native/actual125%zoom/full
  live API/human/CI NOT RUN. Tab đóng/viewport reset; Vite5186 bật lại và giữ chạy;
  không ghi DB/email/login, WIP teammate/READINESS giữ nguyên; chưa push/PR.
- `codex/search-filter-group-controls`, base `cce99af`, checkpoint subject
  `feat(web): clarify search filter groups and resets`. Áp dụng phần UX/UI từ
  đối chiếu bản Tuấn Minh: bốn tình trạng + tất cả bằng native radio; trạng thái
  chọn rõ hơn; xóa riêng danh mục/facet/bộ truyện/tình trạng/khoảng tiền/ngôn ngữ.
  Xóa thay draft, Áp dụng mới commit URL; giữ các nhóm tương thích và focus.
  Không thêm facet count API/NXB/năm xuất bản, không đổi taxonomy/contract/DB.
- CUA Chromium1280×800/390×844 preview: reset từng nhóm, giữ nhóm còn lại,
  prune JLPT sau bỏ Luyện thi, category reset giữ condition, radio phím mũi tên,
  Apply URL/kết quả/focus, mobile Escape/reopen giữ draft/footer/body unlock PASS.
  [Evidence](../../.impeccable/review/search-filter-groups/README.md).
- Web78tests/build(TS)/lint PASS;5warning Exchange và chunk warning có sẵn.
  Detector một lần9advisory ở radius/màu cũ ngoài diff. Live API/DB, Safari,
  screen-reader speech, physical mobile, human/remote CI NOT RUN. Không gửi thư/
  ghi DB. Tab QA đóng/viewport reset; Vite5186 chạy để xem UI. WIP teammate và
  READINESS giữ nguyên. Local chưa push; chủ dự án xem lại giao diện.

## Auth — phản hồi khi nhập — 11/10/2026

- `codex/auth-inline-feedback`, base `0224170`, checkpoint subject
  `feat(web): add accessible inline auth form feedback`. AuthForm/AuthInput chung
  hiện lỗi sau blur/submit, cập nhật khi sửa; focus ô lỗi đầu sau khi gắn mô tả.
  Password10–128/khớp xác nhận theo ràng buộc cũ; không thêm strength score.
  OTP-specific errors ở ô mã, lỗi mạng/gửi thư/rate vẫn ở form. Chữ lỗi dùng font
  body, ghi chú vẫn viết tay. Giữ API/session/draft/motion và Google disabled.
- CUA Chromium1280×720: Register ban đầu không scroll; lỗi tên/email/password/
  consent, email sửa đúng, password mismatch/sửa gốc, focus/aria PASS.
  390×844: lỗi không tràn ngang, nội dung dài cuộn tự nhiên. OTP thiếu số/dán có
  dấu cách/giữ0 đầu, recovery submit trống PASS. Chỉ synthetic/invalid forms;
  không gửi email/tạo user/đổi mật khẩu hoặc ghi DB. [Evidence](../../.impeccable/review/auth-inline-feedback/README.md).
- Web78tests/build(TS)/lint PASS;5warning Exchange và chunk warning có sẵn.
  Detector một lần chỉ3advisory màu Google chủ ý. Browser server-error responses,
  Safari/screen-reader speech/physical mobile/human/remote CI NOT RUN. Tab QA đóng,
  viewport reset; runtime chính/WIP khác/READINESS giữ nguyên. Local chưa push.

## Login — giao diện Google, chưa bật tính năng — 11/10/2026

- `codex/auth-google-entry-ui`, base `254c600`, checkpoint subject
  `feat(web): add unavailable Google sign-in entry to login paper`. Login có
  divider/nút Google48px/full-width và ghi Sắp có; native disabled/type=button,
  mô tả khả dụng cho AT. Không SDK/OAuth/API/session/validation mới. Google G
  chính thức local có provenance; font/branding cần kiểm lại khi bật chức năng.
  CUA1280×720 không thêm scroll,390×844/320×740 không tràn ngang; bàn phím bỏ qua
  nút disabled đến Đăng ký, logo tải đúng; [laptop](../../.impeccable/review/auth-google-entry-ui/login-laptop.png),
  [mobile](../../.impeccable/review/auth-google-entry-ui/login-mobile.png).
  Web69unit/build(TS)/lint PASS với5warning Exchange cũ/chunk warning. Detector
  một lần:3advisory màu Google chủ ý, ghi brief. Không submit/ghi DB; Safari,
  physical mobile/NVDA/human/CI/OAuth NOT RUN. WIP khác/READINESS giữ nguyên.
  Local chưa push; phát triển tính năng Google là gói sau.

## Auth giữ cảm giác chữ trên giấy khi nhập — 11/10/2026

- `codex/auth-paper-focus`, base `e2c2f0a`, checkpoint subject
  `fix(web): use ink underline focus on auth paper fields`. Chỉ sửa CSS field
  chung Auth: bỏ outline chữ nhật/nền highlight, dùng underline đỏ đậm thêm1px
  không đổi kích thước; focus checkbox/button/link và API/validation giữ nguyên.
  CUA login/register/forgot keyboard focus, laptop1280×720/mobile390×844 PASS;
  [ảnh login](../../.impeccable/review/auth-paper-focus/login-desktop.png).
  Không submit form/ghi DB. Web69unit/build(TS)/lint PASS với5warning Exchange
  cũ/chunk warning. Autofill thật/Safari/NVDA/physical mobile/human/CI NOT RUN.
  READINESS/WIP khác giữ nguyên; tab QA/viewport đã dọn. Local chưa push.

## Bỏ viền focus xanh chồng lên viền thương hiệu — 11/10/2026

- `codex/form-focus-ring`, base `39a36ea`, checkpoint subject
  `fix(web): remove duplicate blue form focus ring`. Chỉ sửa global CSS:
  tắt ring Tailwind Forms, trả border text/select/textarea về control token;
  giữ focus-visible đỏ, style lỗi/component và trạng thái checked. CUA Chromium
  1280×720/390×844: danh mục/tình trạng/giá/drawer/email login không còn ring xanh,
  keyboard focus còn rõ; không submit form hoặc ghi DB. [Desktop](../../.impeccable/review/form-focus-ring/desktop.png),
  [mobile](../../.impeccable/review/form-focus-ring/mobile.png).
  Web69unit/build(TS)/lint PASS với5warning Exchange cũ/chunk warning;
  Safari/physical mobile/NVDA/human/remote CI NOT RUN. READINESS/WIP khác giữ
  nguyên; tab QA/viewport đã dọn. Local chưa push; chủ dự án kiểm lại field.

## Giữ bố cục khi đổi thanh cuộn/tab — 11/10/2026

- `codex/stable-page-scroll`, base `b304d13`, checkpoint subject
  `fix(web): preserve page geometry across scrollbars and overlays`. Root gutter
  stable + overflow-y scroll fallback; shared scroll lock cho gallery/filter/auth
  tránh bù padding hai lần, giữ gutter/cleanup/nested locks. Kệ sách và tab đổi
  sách giữ chỗ280–420px cho loading/error/empty/results; không đổi màu/copy/API.
  User-web69unit/TS/build PASS, lint0error5warning Exchange cũ/chunk warning.
  CUA1280×720/390×844 trên Nest/Mongo `_test` riêng/local mail/fake storage:
  5filter dài/ngắn giữ nguyên vị trí ngang/navbar, modal ảnh/Escape, drawer/
  breakpoint cleanup và login transition PASS; [evidence](../../.impeccable/review/stable-page-scroll/README.md).
  Fallback chỉ unit-tested; physical mobile/Safari/NVDA/full browser harness/
  slow-network/human/remote CI NOT RUN. QA runtime/DB/users/roles/tab đã dọn;
  READINESS và Chat/Thông báo/MainLayout/Home CSS WIP giữ nguyên. Local checkpoint
  chưa push; bước tiếp chủ dự án thử các tab trên laptop rồi review trước tích hợp.

## Menu tài khoản, Hồ sơ và Kệ sách — 11/10/2026

- `codex/account-menu-profile`, base `96e75c9`, checkpoint subject
  `feat(web): separate account profile and book shelf navigation`. Chủ dự án
  duyệt menu bấm Tài khoản, không thêm Kệ sách ở nav cấp đầu. `/profile` đọc
  SessionClient name/email/status, link đặt lại mật khẩu; `/my-books` giữ owner
  query/ảnh/filter/cursor/state. Menu desktop/mobile/sidebar dùng chung điểm đến;
  legacy profile query giữ filter, guest returnUrl giữ pathname/query. H1 focus,
  title, Escape/Tab/ArrowDown/outside close và logout sau auth unmount được xử lý.
  API/auth/session không đổi; sửa tên/avatar/email còn thiếu contract, không làm
  nút giả. Web65unit/TS/build PASS; lint0error5warning Exchange cũ/chunk warning.
  Một detector[]; CUA1280×720/390×844 trên Nest/Mongo `_test` riêng, fake storage,
  local mail kiểm menu/route/filter/guest/login/logout; [evidence](../../.impeccable/review/account-menu/README.md).
  AI full review mộtP2 focus collision; verdict pass ship chấm lỗi đó resolved,
  không là audit mới/nghiệm thu người thật. DESIGN/brief cập nhật; QA tab/runtime
  và đúng DB/users/roles của fixture đã dọn. Docs311Markdown/2159links/diffcheck PASS.
  Browser harness/NVDA/native/physical mobile/network-failure logout/human/CI
  NOT RUN; READINESS giữ nguyên. Chat/Thông báo/MainLayout WIP bảo toàn. Local
  checkpoint chưa push; bước tiếp chủ dự án thử menu/Hồ sơ/Kệ sách và review.

## Auth — tập giấy thư viện — 11/10/2026

- OTP/Brevo: codex/auth-brevo-otp, base79f006d, checkpoint subject
  feat(auth): add email OTP verification and Brevo delivery. OpenAPI0.33.0,
  123operations/22controllers; migration0018 auth_otp_challenges/HMAC/TTL. Web
  mặc định OTP6số5phút/5lầnsai/cooldown60giây cho đăng ký và reset; link cũ giữ.
  Decoy/cross-channel invalidation/DBtime/user→challenge lock, audit/mail/session
  atomic; reset thu hồi mọi phiên, không gỡ hạn chế/không auto-login. Brevo sender
  HTTP200/active, một thư mẫu được chủ dự án cho phép HTTP201; chủ dự án đã xác
  nhận nhận thư11/10/2026. Feature commit2d3607d; không gửi thêm thư mẫu.
  Key/env riêng không Git; QA luôn local trên replica set/DB _test. API127unit,
  Auth51E2E, web65 PASS; Mongo39PASS/4SKIP; TS/lint/build/contract/routes PASS,
  detector một lần0finding; web5warning Exchange cũ/chunk warning. CUA1536×700,
  390×844/320×740 OTP/paste/error/resend/reload/focus/nohorizontaloverflow PASS.
  [Evidence](../../.impeccable/review/auth-otp/README.md),
  [setup](../features/ACCOUNT_AUTH.md), [ADR0034](../adr/0034-email-otp-authentication.md).
  MainDB chỉ forward migration/bootstrap, zeroqueuedmail trước restart Brevo.
  APIhealth200/Registerweb200, docs310Markdown/2150links và diffcheck PASS;
  motion/session không đổi. RN/Flutter UI,
  physical mobile/NVDA/human/full business E2E NOT RUN; READINESS giữ nguyên.
  Chat/Thông báo/MainLayout WIP bảo toàn; local commit chưa push. Bước tiếp chủ
  dự án thử đăng ký/quên mật khẩu trong inbox thật và review trước tích hợp.

- Account Auth: `codex/auth-registration-recovery`, base `a300397`, checkpoint
  subject `feat(auth): implement registration and password recovery`. OpenAPI0.32.0,
  119 operations/22 controllers; migration0017 thêm token hash, encrypted mail
  queue và append-only Auth audit. Register→verify/resend và forgot→reset thật;
  token30/15phút, cooldown60giây, reset thu hồi mọi phiên/không gỡ hạn chế. Local
  mailbox3186 được chủ dự án duyệt; origin/CORS5186 đã cấu hình local, API restart.
  Giữ ba tờ giấy/login/session/motion; pending/error/status, mobile/laptop và
  fragment reload được kiểm tra. API124unit, Auth32E2E, session21, web62 PASS;
  Mongo39PASS/4SKIP(import/failover); contract/routes/TS/lint/build PASS, web có
  5warning Exchange cũ và chunk warning. Detector một lần0finding. [Evidence](../../.impeccable/review/auth-registration/README.md),
  [setup/behavior](../features/ACCOUNT_AUTH.md). QA replica set/DB `_test` riêng;
  DB local chỉ forward migration/bootstrap, không reset/seed. Resend thật,
  RN/Flutter UI, physical mobile/NVDA/human và full business E2E NOT RUN;
  READINESS giữ nguyên. Chat/Thông báo/MainLayout WIP bảo toàn. Local commit,
  chưa push; bước tiếp chủ dự án tự đăng ký/thử hộp thư, review trước tích hợp.

- Performance follow-up: `codex/auth-paper-performance`, base `27203fb`, checkpoint
  subject `perf(web): compose login paper flights outside the frame loop`. Giữ
  look/30–18 mảnh/texture, thay Canvas vẽ mỗi frame bằng SVG tĩnh+WAAPI; native
  drift đã lên lịch trước route, opaque paint→DOM commit→paint→exit. Sửa focus
  sau React bỏ inert. Build QA riêng/all API intercepted/no DB: laptop p95 JS
  callback gap33.5→5.7ms; mobile16.7→5.7ms (DPR1, không là GPU/physical FPS).
  CUA desktop1366×768/mobile390×844 actual reduce=true, delayed readiness2s,
  resize1024×600, H1/scroll cleanup,401/no storm, Back khi entry PASS. Native
  coordinator/cancellation/geometry55test8file, build/TS PASS; lint0error5warning
  Exchange cũ; detector một lần0finding. [Evidence](../../.impeccable/review/auth-performance/README.md).
  Physical mobile/GPU memory/NVDA/native/human/hidden-tab/no-WAAPI/reveal-Back
  runtime NOT RUN; API không đổi/READINESS giữ nguyên. Chat/Thông báo/MainLayout
  WIP bảo toàn; local commit, chưa push. Chủ dự án thử Login trên laptop thật.

- Continuous paper flow: `codex/auth-paper-flow`, base `8f02bdf`, subject
  `feat(web): carry login paper flow continuously through navigation`. Bỏ pause
  rAF/plateau; đồng hồ bay độc lập đồng hồ mở cảnh. Ba tờ lớn che bằng geometry,
  đợi React commit DOM+paint mới mở; giấy cuốn chéo/cream/ít vàng/bóng nhẹ,
  30 mảnh desktop 1600ms / 18 mảnh mobile 1500ms kể cả giảm motion. Giữ API/session,
  safe returnUrl/focus/Back; sửa copy visibility để form cũ không lộ trên đích.
  CUA 1280×720/390×844 actual reduce=true, QA riêng 700ms chờ route/no freeze
  clock/DOM-ready/returnUrl/401/Back/cleanup PASS. Build/TS và 45 test / 8 file PASS,
  lint 0 error / 5 warning cũ; detector một lần 0 finding. [Evidence](../../.impeccable/review/auth-flow/README.md).
  Physical mobile FPS/NVDA/native/human/hidden-tab/no-Canvas NOT RUN; READINESS
  giữ nguyên. Chat/Thông báo/MainLayout WIP bảo toàn; chủ dự án thử Login local.

- Login success storm: `codex/auth-paper-storm`, base `bae53e3`, subject
  `feat(web): reveal login destination through a paper storm`. Canvas2D68/36mảnh,
  desktop1850ms/mobile1600ms. Follow-up `codex/auth-motion-preference`, base
  `b54f0e4`, subject `fix(web): preserve login animation under motion reduction`:
  theo quy tắc mới trong AGENTS, OS reduction vẫn chạy đầy đủ/stamp280ms;
  cover440ms chỉ còn fallback kỹ thuật khi thiếu Canvas. CUA actual reduce=true
  1280×720/68mảnh/stamp280ms/Home focus/scroll cleanup PASS. Chỉ đổi safe
  returnUrl sau khi đã vẽ/phủ kín, overlay sống qua route; focus/scroll/Back cleanup.
  Không đổi API/session/validation;850ms chuyển form giữ nguyên. Web build/TS,
  40test8file PASS;lint0error5warning Exchange cũ;detector một lần0finding.
  CUA desktop1366×768/mobile390×844 QA riêng401/200/returnUrl/Back PASS,
  reduced-motion thật=true PASS. [Evidence](../../.impeccable/review/auth-storm/README.md).
  Physical mobile FPS/hidden-tab/no-Canvas/NVDA/native/human NOT RUN;READINESS giữ nguyên.
  Chat/Thông báo/MainLayout WIP bảo toàn; bước tiếp chủ dự án tự thử Login local.

- Laptop layout: `codex/auth-laptop-layout`, base `3a25036`, subject
  `fix(web): align auth paper layouts on laptop screens`. Ba thẻ cùng minimum
  theo chiều cao viewport; gọn khoảng cách ở height≤800, giữ input16px/46px,
  button48px. Status ra ngoài flow; note giữ bên cạnh từ1000px. CUA1536×700
  ba thẻ480×596 cùng vị trí/không scroll;1024×700 PASS; màn thấp/mobile vẫn
  scroll tự nhiên, keyboard shuffle/focus PASS. Build/TS/lint PASS (5warning
  Exchange cũ), detector một advisory viền giấy cũ. [Evidence](../../.impeccable/review/auth-laptop/README.md).
  Không đổi API/auth/motion/READINESS; actual browser zoom/native NOT RUN.


- Crisp-rest refinement: branch `codex/auth-crisp-rest`, base `f63d8b0`, commit
  subject `fix(web): keep auth form text crisp at rest`. Form trước nằm phẳng
  khi nghỉ; perspective/3D chỉ bật lúc shuffle, hai tờ sau vẫn nghiêng2D.
  Build/TypeScript PASS, lint0error5warning Exchange cũ; CUA desktop/mobile
  và keyboard chuyển ba thẻ/focus PASS. Detector một lần: advisory6px edge/3px
  radius có từ trước, giữ theo concept. [Evidence](../../.impeccable/review/auth-crisp/README.md).
  Không đổi API/validation/session/READINESS; không chạy lại backend/native.


- Card-shuffle follow-up: `codex/auth-solid-paper`, base `8ed4b22`, checkpoint
  subject `feat(web): shuffle auth cards and build account forms`. Chủ dự án
  đổi từ lật gáy sang rút tờ trên sang phải, hạ xuống rồi xếp vào đáy850ms.
  Giấy đặc/hai mặt, form thật nằm dưới, bóng/ánh sáng theo chuyển động; không
  fade carrier hoặc filter làm phẳng3D. Theo yêu cầu mới, chuyển thẻ Auth vẫn
  chạy khi giảm chuyển động; dấu thành công giảm về tĩnh. Register/recovery
  có form đầy đủ/draft memory, nút gửi native-disabled vì API chưa có. Giữ
  Login API/validation/session/safe returnUrl. Web build/TS/34unit PASS,
  lint0error5warning Exchange cũ; CUA laptop/mobile/keyboard/draft/Back và
  synthetic401/200→returnUrl PASS. [Evidence](../../.impeccable/review/auth-shuffle/README.md),
  [independent scoped SHIP](../../.impeccable/review/auth-shuffle/review.md).
  Không đổi READINESS; chưa nghiệm thu native/backend mới hoặc người thật.
- Turn follow-up: `codex/auth-paper-turn`, base `fd05a77`, checkpoint subject
  `feat(web): clarify auth paper turns and remove visible photo credit`.
  Bỏ credit theo yêu cầu mới, giữ nguồn ảnh ở asset README. Lật WAAPI320/380ms,
  quay lại Login đảo chiều, không animation lúc tải đầu; reduced-motion fade140/160ms.
  Handle riêng tránh cleanup tờ rời hủy tờ đến; clip projection không tạo scroll
  tạm thời. IAB normal-motion QA riêng và production reduced/mobile/keyboard PASS;
  build/34unit PASS, lint0error5warning Exchange cũ. Detector một warning viền giấy
  vốn có/được giữ theo concept, không nhận detector PASS. [Evidence](../../.impeccable/review/auth-turn/README.md).
  API/session/native/full human review không chạy lại; READINESS không đổi.
- Font follow-up: `codex/auth-vietnamese-handwriting`, base `41fda2b`, checkpoint
  `fix(web): use Fancy Melody for Vietnamese auth notes`. Theo lựa chọn mới nhất
  của chủ dự án, dùng file MTD Fancy Melody Regular400 nguyên bản cho ghi chú/lỗi;
  bỏ Caveat, không giữ ứng viên Athena. Glyph tiếng Việt đầy đủ; IAB1366×768,
  mobile320×1000 và lỗi401 giả lập riêng PASS về font/đọc/không tràn ngang.
  TypeScript/build PASS; scoped type detector không có finding. Không đổi logic
  auth, không chạy lại API/native hoặc full finish review cho thay font nhỏ.
  [Evidence font](../../.impeccable/review/auth-melody/README.md). READINESS không đổi.
- Nhánh `codex/auth-library-papers`, base `d20c43a`; checkpoint subject
  `feat(web): redesign auth as library paper sheets`. Thay split-screen bằng
  AuthLayout chung: ba tờ giấy giữa nền ảnh Davit Margaryan/Unsplash đỏ rượu,
  font Bricolage/Caveat local OFL, ghi chú ngẫu nhiên, underline inputs.
- Giữ SessionClient/API/native required/email/error/safe returnUrl. Đăng ký và
  khôi phục vốn chưa có API: tờ riêng nói rõ chưa hỗ trợ, không nhận credential
  hoặc giả gửi email. Draft chỉ trong memory khi còn ở Auth. Chỉ login thành
  công mới đóng dấu ĐÃ MƯỢN; inert tờ rời, focus heading tờ tới. Auth tôn trọng
  reduced-motion, khác ngoại lệ Home/nav/card: không lật không gian khi reduce.
- Build/TypeScript PASS,34unit7files PASS (suite hiện có), lint0error5warning
  Exchange cũ; docs/diff checks ghi trong evidence. IAB desktop/laptop/mobile/
  actual572/320, native validation/focus/query PASS. Isolated UI fixture5187:
  401/retained inputs/no stamp,200/stamp/safe internal return và chặn //external
  PASS; không ghi DB chính. Normal-motion live/NVDA/200%/native/main-DB login
  NOT RUN. Một detector: paper-edge warning được reviewer chấp nhận theo brief;
  font/token additions được documenter đồng bộ, không nhận detector PASS.
- Full finish review **ship** trên source/capture được cấp, không thay human
  sign-off. [Evidence](../../.impeccable/review/auth-papers/README.md),
  [review](../../.impeccable/review/auth-papers/review.md). READINESS không đổi.
  Chat/Thông báo/MainLayout WIP giữ riêng. Bước tiếp: chủ dự án xem `/login`
  và tự thử tài khoản local; API đăng ký/reset thuộc gói nghiệp vụ riêng.

## Khôi phục API local để đăng nhập — 11/10/2026

- Nhánh `codex/local-db-login-recovery`, base `e3bcbba`; checkpoint subject
  `docs(local): record Mongo upgrade and API login readiness`. Chủ dự án duyệt
  nâng DB local đang cấu hình sau lỗi startup thiếu migration0008–0016.
  Đã áp dụng đúng9migration hiện có, bootstrap quyền theo source;16checksum
  hiện hành khớp. Không sửa migration/API/UI, không reset/reseed DB.
- Trước thao tác đã chụp logic EJSON53collection/807document và index/options
  vào `.tmp` cục bộ bị ignore; chưa kiểm phục hồi, không gửi/commit snapshot.
  App/migrator credentials cũ xác thực được trước bootstrap. Đối chiếu sau
  nâng cấp: toàn bộ ID cũ và password hash giữ nguyên; mọi record ví/ledger/
  topup/payment cũ khớp. Có đúng1wallet account mới, khớp reference tài khoản
  phí của migration0012; không thêm ledger/payment record.
- API3000 và proxy Vite5186 `/api/v1/health/ready`200; taxonomy200,
  guest `/auth/me`401, trang `/login`200. Tài khoản Member demo ACTIVE và
  hash xác minh khớp cấu hình local. Chỉ kiểm đọc; POST login/full authenticated
  workflow NOT RUN trên DB chính, chủ dự án sẽ đăng nhập trực tiếp.
- `pnpm dev:api` bị Docker subprocess exit3221225794; Mongo đang chạy sẵn.
  API được khởi động bằng `node dist/main.js` sau compile0error. API/Vite giữ
  chạy; worker ảnh/đơn hàng chưa bật. Chưa sửa launcher Docker.
  READINESS/human/native gates không đổi; Chat/Thông báo/MainLayout WIP giữ
  riêng. Bước tiếp: chủ dự án thử login; bật worker khi cần kiểm luồng tương ứng.

## Gói thiết kế web Member — logo mới và tiệm sách nhiều màu

- Chiều sâu card11/10: nhánh `codex/book-card-depth`, base `62f4df7`, checkpoint
  subject `feat(web): add layered book card hover motion`. HomeBookCard dùng
  BookCardMotion chung cho preview/live trên Home và Tìm sách: nghiêng theo chuột,
  bìa/tên/tác giả/giá/link nổi theo từng lớp, giữ kích thước và dữ liệu gốc.
  Hit area đứng yên, một RAF khi pointer di chuyển; reset khi rời/cancel/cuộn/
  resize/blur/ẩn trang và hủy listener khi unmount. Trên600px/fine mouse mới
  nghiêng; màn hình nhỏ/coarse pointer tĩnh. Keyboard giữ focus/link gốc.
  Theo yêu cầu chủ dự án, reduced-motion vẫn có phản hồi hữu hạn150ms nhưng
  giảm nửa góc/độ sâu; không thêm loop. Build/TypeScript/34unit7files PASS;
  lint0error5warning cũ, detector một lượt `[]`, docs/diff PASS. IAB guest
  Home1535×735/Search1280×720 reduced-motion=true xác nhận nghiêng hai hướng,
  depth bìa18px/tên13px, exit reset và focus bàn phím. Home/Search390×844,
  Search320×700 tĩnh/không tràn ngang; [sáu capture JPEG](../../.impeccable/review/card-depth/).
  Normal-motion runtime/hardware touch/populated-live/FPS/zoom200%/native/human
  NOT RUN; READINESS không đổi. Không thêm dependency/API/DB writes; WIP Chat/
  Thông báo/MainLayout giữ riêng, không push. Bước tiếp: chủ dự án thử rê chuột
  lên card Home hoặc `/books?data=preview` trên Vite5186.
  Follow-up từ `58a1075`, cùng nhánh: chủ dự án yêu cầu 3D rõ hơn. CSS tăng
  perspective720px/góc tối đa12°/cover72px/title56px, bóng đổ theo chuột;
  reduced-motion tối đa10°/80% depth/150ms. Build/TypeScript PASS; IAB Home1535/
  Search1280 reduced=true đo cover57.6px/title44.8px, exit reset; Search390 tĩnh/
  không tràn. [Home mới](../../.impeccable/review/card-depth/home-strong.jpg),
  [Search mới](../../.impeccable/review/card-depth/search-strong.jpg),
  [mobile](../../.impeccable/review/card-depth/search-strong-mobile.jpg).
  Unit không chạy lại cho CSS-only; docs/diff PASS, giới hạn NOT RUN giữ trên.
  Checkpoint subject `refactor(web): emphasize book card depth`; không push.

- Danh mục navbar11/10: nhánh `codex/navbar-category-menu`, base `7283045`,
  checkpoint subject `feat(web): add navbar category directory`. Nút bốn ô cạnh
  logo mở directory giấy ba cột, dùng11danh mục/18nhóm con từ catalog-v1;
  giữ Tìm sách riêng, hero và navbar morph. Chọn mục tạo URL categoryId mới,
  giữ data=live/preview khi được chọn rõ, bỏ tiêu chí cũ không tương thích.
  Đổi danh mục ngay trong Search cũng trở về đầu trang/focus heading; click
  modifier mở tab mới giữ hành vi Link gốc. Escape/outside click/Tab exit/route
  change đóng menu; mobile dùng disclosure trong menu với cuộn giới hạn màn hình.
  Build gồm TypeScript/34unit PASS, lint0error5warning cũ, detector một lượt `[]`,
  diff check PASS. CUA guest1366/1535/1024/390/320: URL/select/chip/reload,
  keyboard/focus/đóng menu/không tràn PASS; query-only từ scroll1536 về0 PASS.
  GET listings categoryId=manga200 chỉ chứng minh route đọc, không chứng minh
  danh sách live có dữ liệu. Reviewer đầy đủ SHIP sau chụp lại ảnh desktop.
  Documenter phát hiện hai role màu chưa bind cục bộ; đã bind đúng màu hiện có,
  build lại PASS, chụp lại sáu viewport; reviewer chấm fix resolved/SHIP.
  DESIGN/sidecar/brief đồng bộ recipe và giữ token/overview; docs check PASS;
  [sáu ảnh JPEG](../../.impeccable/review/navbar-categories/) và
  [evidence](../design/WEB_MEMBER_REDESIGN.md). Authenticated/populated-live/
  zoom200%/native/human NOT RUN; READINESS không đổi. Không push; WIP Chat/
  Thông báo/MainLayout.tsx giữ riêng. Bước tiếp: chủ dự án thử Danh mục tại Vite5186.

- Minh họa trạng thái11/10: nhánh `codex/member-story-illustrations`, base `2b861a5`,
  checkpoint subject `feat(web): add penguin story illustrations to member pages`.
  Ba WebP alpha cùng bộ chim cánh cụt cho Đã gửi duyệt/kệ đầu trống/intro Auction;
  shared component giữ pending/reset và filter/cursor; Home/hero/API/session giữ.
  Build/typecheck/34unit PASS, lint0error5warning cũ; detector một lượt `[]`,
  provenance3/3 PASS. CUA1366/390/320/chữ dài/callback/focus/không tràn PASS,
  pending/kệ là component QA có nhãn (đã xóa), Auction route thật với APIoffline.
  Reviewer mới SHIP cho source/13capture; hai role hover được bind cục bộ,
  build lại PASS và reviewer chấm binding resolved/SHIP qua source.
  Documenter đồng bộ recipe/canonical DESIGN, sidecar và ba surface briefs;
  JSON/token preservation/overview parity/contract blocks PASS.
  [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Full authenticated submission/Profile/populatedAuction/backend/native/200%/
  human NOT RUN; READINESS không đổi. Chưa push. Chat/Thông báo/MainLayout WIP
  giữ riêng. Bước tiếp: chủ dự án xem ba minh họa; Vite5186 tiếp tục chạy.

- Navbar emphasis11/10: nhánh `codex/navbar-shrink-emphasis`, base `7274a2c`,
  checkpoint subject `feat(web): emphasize navbar collapse motion`. Co560ms,
  viền vàng/nét kem chạy một lượt680ms rồi tắt; floating/spacing/shadow rõ hơn.
  Giữ hero/menu/routes và ngoại lệ reduced-motion hữu hạn của Header. Build/
  typecheck PASS, lint0error5warning cũ; CUA4viewport/reduced=true/cuộn đảo chiều/
  menu/Escape/focus/links/không tràn PASS. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Detector output bị truncate, không có clean verdict; không chạy lại theo budget.
  Reviewer mới SHIP cho refinement navbar/source/9capture; documenter đồng bộ
  Navbar canonical/sidecar/surface, scoped preservation/JSON/docs/diff PASS; không nhận FPS/
  usability/toàn sản phẩm PASS. Backend/native/200%/Safari/human NOT RUN;
  READINESS không đổi. Chưa push.
  MainLayout/Chat/Thông báo WIP giữ riêng. Vite5186 tiếp tục chạy, bước tiếp:
  chủ dự án xem chuyển động ở Home; Chat vẫn là gói mở.

- Chủ dự án đã duyệt [kế hoạch](../design/WEB_MEMBER_NEXT_PAGES_PLAN.md) sau
  `6d6b6a8`: Tìm sách → Chi tiết → Đăng sách, sau đó tài khoản/chat/đấu giá.
  Nhóm Tìm sách11/10 đã triển khai đầu trang gọn/sidebar/kệ4–5cột/2mobile,
  panel native Apply/Reset,20cuốn/trang; preview91ấn bản tách nhánh API thật.
  Build/typecheck/25unit PASS; lint0error/6warning cũ. CUA desktop/mobile/filter/
  cursorpreview/Back/error/retry PASS; QA Nest/Mongo13bài storagefake đã dọn.
  Review độc lập FIX docs/nút40px; đã merge canonical/tăng44px, verdict SHIP
  cho hai fix. docs/diff PASS. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Full integration/native/200%/human NOT RUN; READINESS không đổi.
  Checkpoint subject `feat(web): refine catalog search and mobile filters`;
  local, chưa push. Chi tiết tiếp nối đã hoàn thiện gallery thumbnail/native
  viewer, metadata hai cột và giữ query kệ khi quay lại. Build/typecheck25unit
  PASS; lint0error/6warning cũ. CUA4viewport không tràn, viewer/keyboard/Escape/
  focus/body-scroll, guest return và Back PASS; QA riêng đã dọn. Review SHIP,
  canonical scoped merge; owner/held/ảnh lỗi/200%/native/human NOT RUN lượt này.
  Checkpoint subject `feat(web): refine book detail photo gallery`; local chưa
  push. Đăng sách tiếp nối đã thay form legacy bằng bàn soạn5bước/preview,
  condition/ownership rõ, bảo vệ thoát và giữ closure retry. Build/typecheck/
  25unit PASS; lint0error/6warning cũ. CUA4viewport/validation/giữ dữ liệu/
  ảnh/thoát-hủy/gửi/reset PASS. Nest/Mongo *_test storagefake xác nhận đúng1bài
  PendingReview với1ảnh và hai giá. Reviewer FIX viền, đã đổi token tương phản,
  closure SHIP; canonical merge. Fullintegration/browser lost-response/200%/
  native/human/beforeunload UI NOT RUN. READINESS không đổi; local chưa push.
  Checkpoint subject `feat(web): redesign book posting workspace`.
  Kệ Tài khoản tiếp nối đã dùng owner API/cursor/trạng thái và hai giá thật;
  bỏ dashboard demo, mobile dùng menu có nhãn. Register hiển thị chưa mở theo
  contract, không nhận đăng ký. Build/typecheck/28unit PASS; lint0error/6warning
  cũ. CUA4viewport/filter/Back/metadata-retry/menu/logout/guest-return/error PASS;
  QA riêng đã dọn. Review độc lập SHIP; canonical scoped merge/docs/diff PASS.
  Browser>20pagination/200%/native/human và mọi trạng thái populated NOT RUN.
  Checkpoint subject `feat(web): replace account mock dashboard with owner shelf`;
  local chưa push, READINESS không đổi. Account checkpoint `8d9cdf0`.
  Chủ dự án đã duyệt [plan Tìm sách/bộ lọc](../design/WEB_SEARCH_FILTER_REFINEMENT_PLAN.md).
  Đã triển khai panel264px ghim dưới navbar, tình trạng hai cột, giá và action
  nằm ngang, native select khi viewport thấp/giá sai. Mobile cuộn thân dialog,
  action đáy luôn hiện. CUA1366×768/1535×735 đủ control tại scrollY0 kể cả lỗi;
  320px đọc đủ giá sáu chữ số. Sticky/draft/Apply/reset/Back/cursor/rỗng/lỗi/retry
  PASS; build/typecheck/28unit PASS, lint0error5warning cũ. Review độc lập SHIP
  cho hai material fixes; canonical scoped merge/preservation/docs/diff PASS.
  200%/OS keyboard/native/live-success/fullintegration/human NOT RUN. READINESS
  không đổi. Checkpoint subject `feat(web): pin compact catalog filters`;
  local chưa push. Vite5186 giữ chạy để chủ dự án xem preview.
  Sau checkpoint `aadbd88` (preview8thể loại), chủ dự án duyệt mở rộng bộ lọc
  theo danh mục trên nhánh `codex/catalog-contextual-filters`:10 nhóm chính+
  Sách khác,29nút/16facet; OR trong nhóm/AND giữa nhóm, phụ thuộc chứng chỉ/lớp.
  Search URL/Apply/chip/Back/giá trị đổi và sidebar dài tự nhiên; chỉ ghim khi
  vừa vùng nhìn. Form tái dùng đầu sách Confirmed hoặc đề nghị metadata mới;
  API lọc trước cursor, Admin đọc nhãn, optional fields/legacy giữ tương thích.
  OpenAPI0.31.0/migration0016 (chỉ QA)/shared vocabulary catalog-v1; chưa có
  Admin CRUD vocabulary. Preview97ấn bản, thuộc tính/giá/tình trạng là mẫu.
  API119/Web34/Admin15unit,105E2E,Mongo39PASS4SKIP; build/typecheckAPI/Web/Admin,
  RNtypecheck,contract/routes PASS; lint0error/Web5warning cũ. CUA2laptop,
  390/320px/màn thấp,context prune/picker thật/form/Admin PASS. QA riêng Mongo8.0
  và storagefake; [chi tiết/giới hạn](../design/CATALOG_CONTEXTUAL_FILTERS.md).
  Browser200%/OSkeyboard/native runtime/Supabase/mainDB migration/fullintegration/
  human NOT RUN. Review SHIP cho2materialfixes (URLmalformed/draftmobile),
  QA riêng đã dọn, Vite5186 preview giữ chạy/proxy trảAPI3000 (đang tắt).
  Finish documenter đồng bộ Search canonical/surface, parity/preservation PASS;
  tokens/surface khác giữ nguyên. Chi tiết trong báo cáo; READINESS không đổi.
  Checkpoint subject `feat(catalog): add contextual classification and search filters`;
  local chưa push. Bước tiếp: chủ dự án xem preview và chạy migration theo setup
  trước khi sử dụng metadata mới trên DB chính.
  Sau `2e42f0c`, chủ dự án chê panel lọc; đã chỉnh riêng Search trên nhánh
  `codex/search-filter-visual-refinement`: rail bỏ khung, giá xếp dọc đủ rộng,
  preset chia đều/focus một lớp, Apply rõ/reset nhẹ; giữ nghiệp vụ và form Sell.
  Web34unit/typecheck/build PASS, lint0error5warning cũ; CUA2laptop/390/320px,
  lỗi giá/draft/Apply PASS; detector1lượt0finding. Reviewer mới SHIP cho5fix.
  [Báo cáo](../design/CATALOG_CONTEXTUAL_FILTERS.md); backend/native/200% không
  chạy lại, READINESS giữ nguyên. Checkpoint subject
  `fix(web): refine contextual search filter layout`; local chưa push.
  Chat/Thông báo còn source UI uncommitted; QA/reviewer/documenter chưa hoàn tất.
  Browser phát hiện race join trước auth socket hoàn tất (Unauthorized); chưa
  sửa API hoặc nhận Chat PASS. QA5190/API3009 disposable đã dừng, không đụng
  dữ liệu chính. Bước tiếp: chủ dự án xem Search, Chat vẫn là gói còn mở.
- Sau `1101fac`, chủ dự án báo OS giảm chuyển động làm mất hiệu ứng mới.
  Home nay giữ đầy đủ animation cả khi reduced-motion=true: tán lá12s,
  sáu lá nền16–19s, card lift240ms/banner320ms, filter180ms/card thêm220ms,
  cáo settle650ms một lần. Override chỉ trong Home; giữ observer/visibility/
  cleanup, hero/bookmark/navbar và layout. Không đổi API/routes/data/dependency.
  Build/typecheck PASS; lint0error/6warning cũ; docs/diff PASS. CUA1535×900
  reduced=true xác nhận tán lá đổi matrix theo thời gian, lá dịch chuyển,
  card focus scale1.025/lift5px/240ms; vùng khuất pause, không tràn ngang.
  Reviewer độc lập SHIP. Fox timing/document-hidden simulation/FPS/backend/
  native/human NOT RUN; 22unit đã PASS ở1101fac, không chạy lại cho fix preference.
  [Evidence](../design/WEB_MEMBER_REDESIGN.md). DESIGN/canonical/surface đồng bộ.
  READINESS giữ nguyên. Checkpoint subject
  `fix(web): retain home motion with OS reduction enabled`; local, chưa push.
  Bước tiếp: chủ dự án tải lại Home để xem hiệu ứng trên máy đang giảm motion.
- Sau `ed24784`, thay Chúa nhẫn thứ hai ở hero bằng Truyện Kiều — Nguyễn Du
  do chủ dự án gửi; giữ một Chúa nhẫn và đủ tám bìa, bố cục/hiệu ứng không đổi.
  Asset WebP363×560/~50KB có provenance/hash. Build/typecheck PASS;
  browser1535×735 tải đủ tám ảnh, không tràn ngang. [Ảnh](../../.impeccable/review/web-member/home-truyen-kieu.jpg).
  Backend/native/200% NOT RUN; READINESS giữ nguyên.
  Checkpoint subject `fix(web): replace duplicate hero cover with Truyen Kieu`; local, chưa push.
  Bước tiếp: chủ dự án xem hero với bìa mới.
- Sau `a860408`, gộp nguyên lời mời đăng sách/link /sell vào cảnh mùa thu:
  đồi z0, wine card z1, cáo alpha z2 chồng nhẹ mép card; desktop trái/phải,
  mobile trên/dưới. Wrapper accessible, chỉ art hidden/pointer-inert. Giữ hero/
  bookmarks/tán lá/24 motif/kệ/footer/API. Hai asset ImageGen có full provenance.
  Build/typecheck/lint PASS (0error/6warning cũ; bundle warning đã biết).
  CUA1535/1000/390/320px không tràn, action rõ, footer gap0; mobile capture
  chỉ CTA/đầu cáo. Detector một lượt8advisory; reviewer độc lập SHIP/không fix.
  Canonical scoped merge; docs/diff PASS. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Backend/native/human/200% NOT RUN; READINESS giữ nguyên.
  Checkpoint subject `style(web): layer posting invitation over autumn hills`; local, chưa push.
  Bước tiếp: chủ dự án duyệt tổng thể Home.
- Sau `912ecec`, giữ hero y nguyên; bookmark desktop144px/chim88px/padding đáy24px.
  Mobile152px/88px không đổi. Build/typecheck PASS; CUA1535×735/1366×768 hàng
  đủ trong khung đầu,390px vẫn2×2; không tràn ngang. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Actual hover/200%/backend/native/human NOT RUN; READINESS giữ nguyên.
  Reviewer độc lập ship, không material fix; docs/diff PASS.
  Checkpoint subject `fix(web): compact bookmarks without shrinking hero`;
  local, chưa push. Bước tiếp: chủ dự án xem trên laptop.
- Sau `7af062d`, dấu sách880px/gap32px, chim104/88px, góc8px/khía sâu hơn,
  viền nhẹ/texture giấy login và nét chỉ wine. Hover bóng theo giấy; focus không
  clip. Giữ hero/routes/API/session. Build/lint PASS (6 warning cũ); CUA5width
  không tràn,4ảnh/label/notch/focus PASS; actual hover/200%/native/backend/human
  NOT RUN. Reviewer độc lập ship, không material fix; docs/diff PASS.
  [Evidence](../design/WEB_MEMBER_REDESIGN.md). READINESS giữ nguyên.
  Checkpoint subject `feat(web): soften paper bookmark shortcuts`; local, chưa
  push. Bước tiếp: chủ dự án xem bản thử.
- Sau `6beee98`, thử bốn dấu sách kem/vàng thay hộp pastel theo duyệt chủ dự án.
  Chim88/72px trên nhãn ngắn, khía SVG/viền1px, nối hero12px, không clip focus.
  Hero đáy32px giữ caption cách20px; thêm chim cầm búa alpha256px/51KB, ba ảnh
  cũ giữ nguyên. Bốn route/kệ/logo/session/API không đổi. Build/typecheck/lint
  PASS (6 warning cũ); CUA6width không tràn, laptop hàng trọn khung mở đầu,
  keyboard4route/focus/4ảnh PASS. Scan trước sửa0finding;200%/actual mouse hover/
  native/backend giao dịch/human NOT RUN. [Evidence](../design/WEB_MEMBER_REDESIGN.md).
  Reviewer độc lập ship, không material fix; docs/diff PASS. READINESS giữ nguyên;
  checkpoint subject `feat(web): refine home bookmark shortcuts`;
  local, chưa push. Bước tiếp: chủ dự án xem bản thử.
- Sau `708f8da`, ô khám phá thứ ba đổi từ “Đến 100.000₫” thành “Đấu giá”, dùng
  ROUTES.auctions (/auctions). Giữ màu đào/chim ôm ví; bộ lọc ngân sách trong kệ
  và banner giá giữ nguyên. Build/typecheck/lint PASS (6 warning cũ), CUA Enter
  mở đúng “Phiên đấu giá đang mở”; [ảnh](../../.impeccable/review/web-member/home-auction-shortcut.jpg).
  Docs/diff PASS; không kiểm backend đấu giá/native hoặc đóng gate READINESS.
  Checkpoint subject `fix(web): link home shortcut to auctions`; local, chưa push.
- Sau `6196b88`, ẩn dải thông báo preview và link “Xem bài đăng thật” theo yêu
  cầu chủ dự án; bốn ô khám phá theo ngay hero. Bỏ CSS không dùng; caption hero,
  heading/nhãn mẫu trên card, preview source và data=live giữ nguyên.
  Build/typecheck/lint PASS (6 warning cũ); CUA1366/390 không có banner/tràn ngang,
  bốn link còn đủ. [Ảnh](../../.impeccable/review/web-member/home-notice-hidden-desktop.jpg).
  Docs/diff PASS; backend/native/200% NOT RUN, READINESS giữ nguyên.
  Checkpoint subject `fix(web): hide home preview notice`; local, chưa push.
- Sau `a704bdf`, Home có bốn ô mua/đổi/ngân sách/đăng màu vàng kem/mint/đào/tím,
  kèm bộ4 chim cánh cụt image_gen local alpha,256px/~50KB. Desktop4/mobile2×2;
  hình72/56px, full-link, hover lift2px/viền wine, focus/reduce motion giữ rõ.
  Không đổi hero/logo/kệ/API/session. Build/lint0error6warning cũ PASS; CUA5width
  không tràn,4ảnh và keyboard/four-route checks PASS;200%/actual hover NOT RUN.
  Scan layout trước sửa0finding; native/backend thành công/DB/human NOT RUN,
  READINESS giữ nguyên. Evidence/provenance ở [brief](../design/WEB_MEMBER_REDESIGN.md).
  Reviewer độc lập disposition ship, không material fix; docs/diff PASS.
  Checkpoint subject `feat(web): add penguin discovery shortcuts`; local, chưa push.
- Sau `10358bb`, thu gọn card riêng Home theo duyệt của chủ dự án:5 cột laptop,
  6 desktop rộng,4/3/2 ở mốc1100/850/600px; khung bìa200/180/160px, title hai dòng
  vẫn giữ tên đầy đủ/tooltip, nguồn44px. Kệ chính10/thêm10, chủ đề10/kệ, đổi4.
  Hero/Search mặc định/API/session/91edition và nhãn mẫu giữ nguyên. Build22unit
  PASS/lint0error6warning cũ; CUA6width không tràn, expansion/filter/reset/title
  PASS. Scan layout một lượt0finding;200%/ảnh lỗi chưa chạy lại, backend thành công/
  DB/native/human NOT RUN. READINESS giữ nguyên; ảnh/giới hạn ở [brief](../design/WEB_MEMBER_REDESIGN.md).
  Reviewer độc lập disposition ship, không material fix; docs/diff PASS.
  Checkpoint subject `feat(web): compact home book shelves`; local, chưa push.
- Sau `100f872`, mở rộng Home preview lên91 Open Library editions/tám thể loại:
  15văn học/6kỹ năng/7kinh doanh/8khoa học/6lịch sử/8thiếu nhi/25manga/16LN.
  Kệ đầu xen tám nhóm; thêm ba kệ chủ đề4sách/kệ và link lọc/đường về toàn bộ.
  Giữ nguyên hero, cache metadata+remote covers, không dùng sách
  hero cho kệ/banner. Giá/tình trạng/mua-đổi mẫu có nhãn; card chỉ mở nguồn,
  không tạo người bán/media/giao dịch hoặc ghi DB. Env/query bật preview;
  data=live ưu tiên, production tắt; backend lỗi không fallback. Search/filter/
  budget hoạt động trong Home preview; Header/Search/Detail vẫn API thật.
  Build/typecheck22unit PASS/lint0error6warning cũ; CUA4width/filter/expansion/
  topic/live-error isolation PASS, chữ200% chưa chạy lại. Detector4advisory hero
  legacy; metadata/bìa upstream
  đã dùng thật, backend thành công/DB/native/human NOT RUN, READINESS giữ nguyên.
  Reviewer độc lập3capture disposition ship, không material fix. Preview bật ở
  config local riêng máy, không commit env. Hướng dẫn và evidence ở
  [brief](../design/WEB_MEMBER_REDESIGN.md).
  Checkpoint subject `feat(web): broaden preview catalog and home subjects`. Local, chưa push.
- Sau `973e3c4`, Home giữ nguyên hero, body theo yêu cầu tham khảo Fahasa và
  kết hợp thể loại + mua/đổi + giá: lối vào nhanh, kệ mới đăng, banner ngân sách,
  kệ đổi và CTA đăng sách. API chỉ hỗ trợ mode/giá; thể loại lọc cục bộ tối đa24
  bài trong kệ, ghi rõ phạm vi; không mở rộng contract/backend. BookCard compact
  là tùy chọn riêng Home, Search/AuctionCard giữ hành vi cũ. Build/typecheck16unit
  PASS/lint0error6warning cũ;7width100/130/200% fixture và CUA desktop/cửa sổ thật
  PASS layout/filter/link/states. API3048 không chạy; API thật/native/human NOT RUN,
  READINESS giữ nguyên. Detector một lượt12advisory (8legacy ngoài diff,4role mới
  ghi canonical), provenance11raster0missing. Documenter cập nhật canonical/parity
  PASS; reviewer độc lập8capture disposition ship, không có material fix;
  docs/diff PASS. Ảnh và giới hạn ở [brief](../design/WEB_MEMBER_REDESIGN.md).
  Checkpoint subject `feat(web): redesign home discovery shelves`. Local, chưa push.
- Sau `f79e81f`, bỏ viền focus đỏ bên trong input tìm sách Home theo ảnh chủ dự
  án; focus chuyển ra mép ngoài thanh search màu vàng2px/offset4px, không đổi
  submit/query hoặc CSS global. CUA xác nhận input border0/outline none khi focus,
  outer focus còn hiện; build/typecheck PASS. Ảnh `home-search-focus.jpg` trong
  `.impeccable/review/web-member`. Checkpoint local, chưa push.
- Sau `1e569eb`, Login thêm texture giấy kem local512px/85%, gạch vàng headline;
  theo correction chủ dự án đã bỏ hình sách, “Lại gặp nhau rồi.” một hàng bình
  thường và wrap khi chữ lớn. Ánh sáng nền2400ms một lượt rồi tắt, reduce-motion
  bỏ hiệu ứng. Không đổi ảnh/logo trái hoặc auth. Build/typecheck PASS, lint0error
  6warning cũ;9viewport100/130/200% fixture/material QA và CUA PASS, tương phản
  muted tối thiểu4.73:1. Provenance1raster0missing; canonical được documenter cập
  nhật; reviewer độc lập8capture disposition ship, docs/diff PASS.
  API thật/native/human NOT RUN, READINESS giữ nguyên; ảnh ở brief.
  Checkpoint subject `feat(web): add subtle paper material to login`. Local, chưa push.
- Sau `5c88499`, Login bỏ masthead đỏ riêng, logo gốc được key nền thành alpha
  bằng SVG filter trên ảnh; mobile có vùng ảnh logo gọn, home trên nền giấy.
  Form400px/title2.5rem/input trắng52px, thêm Quên mật khẩu/Đăng ký dạng disclosure
  thông báo chưa hỗ trợ vì API chưa có register/reset; không request giả hoặc
  đổi session/handler/Register. Build16unit PASS/lint0error6warning cũ;
  9viewport100/130/200% response fixture và CUA desktop/mobile PASS, ảnh ở brief.
  Docs/diff PASS; documenter cập nhật canonical, reviewer chấm persistence resolved.
  API thật/native/human NOT RUN, READINESS giữ nguyên. Checkpoint subject
  `feat(web): overlay login branding and refine account actions`. Local, chưa push.
- Sau `6de0289`, Login dùng ảnh bookstore Unsplash local, blur2px/tint đỏ64%,
  desktop45/55 và form400px/52px control, logo/home riêng; <=900px chỉ form.
  Handler/session/returnUrl/Register giữ nguyên. Build/typecheck16unit/lint0error
  6warning cũ PASS;9viewport100/130% response fixture và CUA PASS, ảnh ở brief.
  Docs/diff PASS. Detector2advisory credit/footer; canonical Login được documenter cập nhật và
  reviewer kiểm finding persistence. API thật/native/human gate NOT RUN, không
  đổi READINESS. Checkpoint subject `feat(web): frame login with a warm bookshop photograph`.
  Local, chưa push/PR/merge/deploy.
- Sau `29ff82e`, navbar morph360ms + viền kem sáng nhẹ trong collapse rồi tắt;
  expand hủy ngay, lần thu sau replay. Chủ dự án yêu cầu hiệu ứng thấy được trên
  laptop reduce-motion, nên giữ360ms riêng navbar, không sửa preference/global.
  Focused desktop/390/320 reduce/no-preference PASS width/edge/replay/reversal/
  no jump; CUA xác nhận sáng rồi về0. Build/typecheck/16unit/lint6warning cũ/docs/
  diff PASS; detector6advisory legacy ngoài diff. Ảnh ở brief; API/native/gate
  giữ nguyên. Checkpoint subject `feat(web): illuminate navbar edge during compact transition`.
  Local, chưa push/PR/merge/deploy.
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
- **12/10 — Hoàn thiện toàn diện Backend Trao Đổi Sách (Exchange Backend)**: Đã audit và xử lý triệt để toàn bộ kiến trúc, schema, invariants, ledger escrow, worker tự động hủy quá hạn cọc và đề xuất cho luồng trao đổi sách trên nhánh `feature/exchange-backend`:
  - **Migration 0016, 0017, 0018 (`0016-exchanges.ts`, `0017-exchanges-phase2.ts`, `0018-exchanges-proposal-expiry.ts`)**:
    - Chuẩn hóa validator schema cho `exchanges`: bổ sung `lockSeq`, `initiatorOrderId`, `recipientOrderId`, `fundingDeadline`, `initiatorFundedAt`, `recipientFundedAt`, `proposalExpiresAt`, `rejectionReason`, `cancelReason`, `cancelledBy`, `cancelledAt`, `initiatorShippedAt`, `recipientShippedAt`, `initiatorReceivedAt`, `recipientReceivedAt`.
    - Bảo toàn biểu thức `$expr` nguyên thủy và bổ sung unique index trên `initiatorOrderId`, `recipientOrderId` và index deadline `(status, fundingDeadline)`, `(status, proposalExpiresAt)`.
    - Đã khấu trừ `exchangeCollectionSpecs.length` trong `schema.mongo-spec.ts` bảo toàn kiểm tra model count.
  - **Sửa lỗi đích danh (Target constraint crash code 121)**:
    - Trong `mongo-command.service.ts`: bổ sung `initiatorListingId` vào `ExchangeChange` và gán `targets.listingId = change.initiatorListingId` để thỏa mãn bất biến `eq(nonNullCount(...TARGETS), 1)` của `mutation_receipts` và `audit_events`.
  - **Cam kết & Trạng thái Listing (Listing trade projection)**:
    - Mở rộng `checkListing` trong `listing-projection.ts`: nhận diện các exchange đang hoạt động (`AcceptedAwaitingFunding`, `Preparing`, `InTransit`, `Delivered`) bảo đảm đúng duy nhất 1 workflow giữ chỗ `Reserved`.
    - Cập nhật `ListingCommitmentPolicy.project`: cho phép chuyển đổi hợp lệ sang `Exchanged` khi hoàn tất trao đổi.
  - **Sổ cái & Escrow (Ledger Escrow, Collision & Reconciliation)**:
    - Tách biệt `initiatorOrderId` và `recipientOrderId` tránh va chạm unique key `{ orderId: 1, type: 1 }` trên `ledger_journals`.
    - Cập nhật `checkJournal` trong `ledger.service.ts` hỗ trợ xác thực `OrderPayment`, `OrderRefund`, và `OrderSettlement` cho các đơn trao đổi.
    - Bổ sung `checkExchange` kiểm tra các hold tài khoản đã giải phóng khi `Completed`.
    - Cập nhật `orphanHold` trong `reconcile()` để nhận diện `exchanges`.
    - Thêm `settleExchange` (phân bổ cọc và tiền bù Δ) và `refundExchange` (hoàn cọc khi hủy).
  - **Worker Hủy Tự Động (`exchange-expiry.service.ts`)**:
    - Nhánh 1: Hủy khi quá hạn nạp cọc `AcceptedAwaitingFunding` (`fundingDeadline <= now`).
    - Nhánh 2: Hủy khi quá hạn phản hồi đề xuất `Proposed` (`proposalExpiresAt <= now`), không bút toán, giữ sách `Available`.
  - **Nghiệp vụ dịch vụ (`exchanges.service.ts`)**:
    - `create`: Kiểm tra `Available`, `Approved`, `Visible`, `Exchange/Both`, tính toán tiền bù chênh lệch Δ và cọc đối ứng 100% (POL-12), gán `proposalExpiresAt = now + TTL` (mặc định 72h).
    - `accept`: Khóa nguyên tử cả 2 listing chuyển sang `Reserved`, thiết lập deadline 24h (POL-05), từ chối 409 InvalidState nếu đã quá hạn, tự động hủy các đề xuất cạnh tranh trùng sách.
    - `fund`: Từng bên đóng cọc (+ Δ nếu là bên bù), chống nạp đúp (`initiatorFundedAt`/`recipientFundedAt`), chuyển `Preparing` khi đủ 2 bên.
    - `cancel/reject`: Hoàn cọc an toàn qua Ledger nếu đã nạp, giải phóng listing trở lại `Available`, trả 409 InvalidState sạch khi đã bị hủy trước.
    - `ship`: Ghi nhận `shippedAt` của từng bên, chuyển `InTransit` khi cả 2 đã gửi.
    - `receive`: Ghi nhận `receivedAt` của từng bên; khi cả 2 đã nhận thì chuyển `Completed`, hoàn cọc và chuyển tiền bù Δ qua Ledger, chuyển 2 listing sang `Exchanged`.
  - **Contract & Verification**:
    - OpenAPI: Cập nhật `packages/api-contract/openapi.yaml`, chạy `pnpm contract:generate` và `pnpm contract:check` PASS 100%.
    - Typecheck & Build: `npx pnpm --filter @used-books/api typecheck` và `npx pnpm --filter @used-books/api build` PASS 100% không cảnh báo/lỗi.
    - Test Suite: Bổ sung bộ kiểm thử E2E đầy đủ `apps/api/test/exchanges.e2e-spec.ts` pass 21/21 tests ổn định. Cập nhật `afterAll` cleanup trong `exchanges.e2e-spec.ts` dọn sạch order hold accounts, journals và entries theo đúng cơ chế bảo toàn nguồn tiền mô phỏng, khắc phục triệt để lỗi orphan hold trong `test/wallet.e2e-spec.ts` (`reconciliation validates sources...`).

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

## DirectDelivery inspection completion — 13/10/2026 (local branch `codex/direct-delivery-completion`)

- Checkpoint tách phạm vi: backend/contract `20d3215` (`feat(orders): complete direct
  delivery lifecycle`); Member Web `2dc2b71` (`feat(member-web): add checkout and seller
  origin address`).

- Theo SRS: buyer tạo Order từ báo giá/địa chỉ sau thỏa thuận chat; callback simulator
  hoặc buyer xác nhận nhận sách mở `Inspection` 72 giờ. Worker chỉ settlement khi hết
  hạn, không có review; ledger, commitment/context và listing chuyển atomically sang
  `Completed`/`Sold`. Không có bước admin duyệt.
- Có migration mới `0020-direct-delivery-completion`, contract/generated types, endpoint
  callback TEST_OPERATOR và buyer receipt, invariant/worker/ledger/reservation; User Web
  có CTA từ chat và form địa chỉ → quote → order thật. API typecheck, Web build,
  contract check/routes và diff check PASS.
- Bổ sung nơi gửi sách ngay bước **Bán hoặc đổi** của `/sell`: seller chọn địa chỉ đã
  lưu hoặc nhập địa chỉ TP.HCM mới; địa chỉ mới được lưu bằng idempotency key trước khi
  tạo draft. Buyer chỉ thấy khu vực, không thấy địa chỉ/điện thoại chi tiết. Web yêu cầu
  nơi gửi cho `Sale`/`Both`; API giữ tương thích ADR0015 cho bài chưa cấu hình, chỉ chặn
  tạo báo giá khi thiếu nơi gửi. Web
  typecheck/build và 11 unit tests `listing-submission` PASS; API typecheck và contract
  generate PASS. Bài đã publish thiếu nơi gửi vẫn là dữ liệu legacy: cần revision/repost
  của seller, không tự ý sửa địa chỉ từ buyer.
- Sửa integration Chat → checkout: chat hợp lệ giữ listing `Reserved` để chỉ buyer trong
  hội thoại được tạo báo giá; khi buyer tạo Order, conversation được đóng atomically và
  commitment Order thay thế reservation chat (listing vẫn `Reserved`). Không cần/bypass ví
  để **tạo** Order: state ban đầu vẫn `AwaitingPayment`; ví/ledger chỉ được dùng ở lệnh pay.
  Không biến giao dịch thành miễn phí vì trái SRS. Sửa thêm client để sau khi lưu địa chỉ mới
  luôn refetch lấy **phiên bản địa chỉ** (không nhầm phiên bản AddressBook) trước báo giá/
  fulfillment. API/Web typecheck PASS.
- CI follow-up trên [PR36](https://github.com/huangg49/used-book-marketplace/pull/36):
  `ce63c8d` bổ sung response headers; `baf6308` thêm migration0021 cho shape order lịch sử,
  giữ checksum0020. `02b17f1` khôi phục submit unconfigured theo contract/ADR0015 và khai
  báo existing-obligations cho confirm receipt. `7b46bfa` sửa retry Sell sau khi lưu địa
  chỉ: tiếp tục submission đã pin origin, không gửi lại address key với book version mới.
  Browser regression điền nơi gửi và kiểm chỉ tạo một địa chỉ qua lost-ACK/retry.
- Docker QA đã chạy. Local PASS: Mongo42/4SKIP (import/failover chưa cấu hình local),
  API130unit/typecheck/build, Web119unit/lint/build, contract/routes136operation,
  Demo H01a/funding/orders/transit và Operations/Member Web browser trên QA riêng với
  storage fake. Full API E2E local có timeout trong auction/race khi chạy nhiều nhóm;
  chưa nhận là PASS. Các lượt CI cũ có Mongo/import/failover PASS, E2E FAIL vì gate submit
  sai và metadata obligations; đang xác minh rerun trên source mới. READINESS không đổi;
  native/live storage/human review và merge/release chưa được xác nhận.

## Lịch sử

[28–30/09](SESSION_HISTORY_2026_09_30.md),
[các checkpoint tới trước đợt dọn09/10](SESSION_HISTORY_2026_10_09.md).
Giữ evidence và ghi nhận teammate ở đó; tình trạng chưa merge/SHA/PID là mốc cũ.
