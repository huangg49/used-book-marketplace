# Điểm lưu hiện tại — 27/10/2026

## Trợ lý AI NVIDIA: provider gợi ý giá & điền thông tin sách từ ảnh — 27/10/2026

- Nhánh `feature/ai-listing-assist` (từ `main` b39747a), chưa push/PR.
- **Gợi ý giá**: thêm `PRICE_ASSIST_PROVIDER=nvidia` (NIM, mặc định
  `nvidia/nemotron-3.5-lightning-30b-a3b`, `NVIDIA_BASE_URL` tùy chọn). Không đổi
  contract/luật bằng chứng; ADR 0028 §9.
- **Điền từ ảnh** ([ADR 0048](../adr/0048-listing-photo-autofill.md), sửa §5 ADR 0028):
  OpenAPI 0.53.0 `POST /listings/{id}/autofill-suggestions`, migration
  `0038-listing-autofill`, module `autofill-assist`, cờ `AUTOFILL_*` tắt mặc định, dùng
  chung ngân sách ngày với gợi ý giá. Web: panel “Điền nhanh từ ảnh” ở bước 1 trang
  đăng bán (sách lẻ), dùng chung bản nháp với lần gửi; chỉ áp dụng trường người bán bấm “Dùng”.
- **Sau khi kéo nhánh**: `pnpm db:migrate` rồi **`pnpm db:bootstrap`** (cấp quyền
  `latlai_app` trên `autofill_suggestions`).
- **Kiểm tra**: API unit 216 + price/autofill PASS; e2e `autofill` (7) + `price-assist`
  + `media` PASS trên replica set QA; `schema.mongo-spec` PASS; contract check/routes
  PASS; typecheck API/admin/user-web PASS; user-web 35 files / 243 tests PASS, build PASS.
  RN typecheck FAIL 32 lỗi typed-route có sẵn trước nhánh (không đụng RN).
- **Live NVIDIA (27/10)**: model ban đầu đã hết hạn (410) → đổi mặc định sang Nemotron
  3.5 (`lightning-30b` giá, `super-vl-120b` ảnh); adapter dùng `response_format` và
  `enable_thinking=false`. Giá: 1 ca qua output-check ~2,5 s. Ảnh tổng hợp: đủ 7 trường
  đúng, 1–2,5 s. Trình duyệt `/sell` (Mongo local + Supabase thật): đọc 2 ảnh, “Dùng tất
  cả” điền form, desktop + 375 px; sửa token màu hover thiếu của panel. DB local đã
  migrate tới 0038 + bootstrap.
- **Eval giá live 34 ca** (ADR 0028 §9): 33/34 status đúng, 0 output sai tới client,
  p95 9,2 s (trên ngưỡng 8 s); ca chưa review nên độ đúng giá NOT SCORED.
- **Gửi trọn bài sau khi điền** (trình duyệt): dùng lại nháp, catalog nhận đủ trường đã
  dùng, `PendingReview`. Sửa: bước Kiểm tra hiện NXB/năm/lần xuất bản/ISBN; “Đăng cuốn
  khác” tạo nháp mới (trước đó lần gửi thứ hai phát lại bài cũ). Tài khoản member local
  nay có thêm bài thử “QA Reset Book A” (chờ duyệt), nháp “QA Reset Book B” (bị chặn
  giới hạn 5 bài) và địa chỉ gửi thử “QA Người gửi”.
- **NOT RUN**: ảnh chụp thật (ngưỡng ADR 0048 §5) — chụp 20–30 cuốn rồi chạy
  `pnpm --filter @used-books/api eval:autofill --dir <thư mục> --init`, điền `cases.json`,
  chạy lại không `--init`. RN chưa có UI điền từ ảnh.

## Khắc phục cuộn chuột trang hội thoại & Cố định khung chat trong viewport — 27/10/2026

- Nhánh `feat/web-auction-select-from-shelf`.
- **Khắc phục hiện tượng đơ/chặn cuộn chuột**:
  - Gỡ bỏ hoàn toàn `lenis.stop()` khi vào các trang chat/hội thoại đơn hàng trong `useSmoothScroll.ts`. Thay vào đó, tự động giải phóng/hủy instance Lenis (`lenis.destroy()`) trên các tuyến `/chat/*` và `/orders/*` để trình duyệt giữ 100% cơ chế cuộn chuột tự nhiên (native 60fps/120fps), ngăn ngừa `<html>` bị gắn class `.lenis-stopped` gây `overflow: clip`.
  - Bổ sung `data-lenis-prevent="true"` trên container hội thoại, cột phiếu đơn hàng `dossierBody` và danh sách tin nhắn `messages`.
- **Cố định khung làm việc hội thoại trong màn hình (Viewport-fitted Workspace)**:
  - `.root[data-room-selected="true"]`: thiết lập `height: calc(100dvh - 84px)`, vừa vặn hoàn hảo bên dưới navbar mà không gây cuộn trang ngoài.
  - Khung sách mở `openBook`/`dossierSpread` chiếm trọn vẹn chiều cao 100% của container.
  - Cột trái: Tinh gọn banner sách `.dossierHeader` (ảnh bìa ~54x74px, tiêu đề, tác giả, trạng thái gọn gàng); phần thân `.dossierBody` cuộn độc lập mượt mà.
  - Cột phải: Header đối tác chat cố định ở đầu cột; danh sách tin nhắn `.messages` cuộn tự nhiên; khung soạn tin nhắn `.composer` cùng nút gửi tin nhắn được ghim cố định ở đáy khung hình, không bị đẩy khuất khỏi màn hình.
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 32 files / 233 tests PASS.

## Tái thiết kế giao diện Đơn hàng của tôi (`/orders`) & Tích hợp vào không gian Hồ sơ tài khoản (`DashboardLayout`) — 27/10/2026

- Nhánh `feat/web-auction-select-from-shelf`.
- **Tích hợp vào DashboardLayout (Hồ sơ cá nhân)**:
  - Chuyển route `/orders` từ `MainLayout` độc lập vào danh sách children của `DashboardLayout` trong `apps/user-web/src/app/router.tsx`.
  - Giúp người dùng khi truy cập hoặc nhấn mục "Đơn hàng của tôi" từ menu tài khoản sẽ thấy trọn vẹn sidebar quản lý cá nhân (Tổng quan, Hồ sơ của tôi, Ví của tôi, Đơn hàng của tôi, Kệ sách của tôi, Đấu giá của tôi, Đề nghị đổi sách, Thông báo), tab "Đơn hàng của tôi" tự động highlight kích hoạt đồng bộ.
- **Tái thiết kế giao diện hiện đại & thẩm mỹ Warm-Paper Editorial**:
  - Gỡ bỏ layout thô sơ kiểu text đơn điệu ("Xem đơn c9cedc72", các dòng chữ xám không phong cách).
  - Thiết kế Page Header chuyên nghiệp: Huy hiệu "Quản lý giao dịch", tiêu đề nghệ thuật, tổng số đơn hàng dạng badge đếm số lượng.
  - Bộ lọc kép thông minh:
    - Tabs vai trò giao dịch: "Tất cả", "Đơn mua" (icon giỏ hàng + đếm số), "Đơn bán" (icon gian hàng + đếm số).
    - Status chips: "Tất cả trạng thái", "Đang xử lý", "Hoàn tất", "Đã hủy / hết hạn".
  - Thẻ đơn hàng (Order Cards) chuẩn mực:
    - Header thẻ: Tag vai trò với màu sắc định danh riêng ("Bạn mua" sắc xanh lá trang nhã, "Bạn bán" sắc hổ phách ấm áp), mã đơn dạng tag rút gọn `#c9cedc72`, ngày tạo kèm icon lịch, badge trạng thái giao dịch (CheckCircle2 xanh khi hoàn tất, Clock khi đang xử lý, XCircle khi đã hủy).
    - Body thẻ: Thumbnail icon sách nghệ thuật, tên cuốn sách in hoa chữ đậm, dòng diễn giải hướng dẫn giai đoạn giao dịch tương ứng (chờ thanh toán, đang chuẩn bị sách, đang vận chuyển, chờ nghiệm thu giao nhận).
    - Nút CTA chuyển hướng: "Chi tiết & Hội thoại" dẫn thẳng vào `/chat/orders/:id` với hover state mượt mà.
  - Trạng thái rỗng (Empty State) và đang tải (Skeleton Shimmer) thẩm mỹ, có liên kết "Tìm sách để mua" và "Đăng bán sách của bạn".
  - Nút "Xem thêm đơn hàng cũ hơn" phục vụ phân trang vô hạn (`infiniteQuery`).
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 31 files / 231 tests PASS.

## Tối giản giao diện trang Đấu giá (`/auctions`) — Xóa bỏ hoàn toàn Hero Banner — 27/10/2026

- Nhánh `feat/web-auction-select-from-shelf`.
- **Cải tiến giao diện**:
  - Gỡ bỏ hoàn toàn component `AuctionHero` và `AuctionEntrance` khỏi trang đấu giá theo yêu cầu người dùng, loại bỏ triệt để mọi khối banner choán diện tích ở đầu trang.
  - Xây dựng Page Header mỏng nhẹ, tinh tế (chỉ cao ~100px): tiêu đề "Đấu giá sách cũ", phụ đề ngắn gọn, nút CTA vàng "Đấu giá sách của bạn" và liên kết "Đấu giá của tôi" được căn lề phải gọn gàng.
  - Người dùng khi vào trang `/auctions` có thể ngay lập tức nhìn thấy hướng dẫn 3 bước, bộ lọc và danh sách phiên đang mở mà không cần cuộn trang.
  - Đảm bảo tính nhất quán thẩm mỹ với các trang `/books` và `/exchange`.
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 31 files / 231 tests PASS.
  - Trình duyệt đã kiểm chứng thực tế và chụp ảnh xác nhận.

## Tái thiết kế giao diện sàn đấu giá (`/auctions`) — Phong cách Warm Paper Editorial — 27/10/2026

- Nhánh `feat/web-auction-select-from-shelf`.
- **Cải tiến giao diện theo yêu cầu**:
  - Xóa bỏ hoàn toàn khối banner màu đỏ rượu vang (`--shop-wine`) to đùng choán hết màn hình ở đầu trang đấu giá.
  - Tái thiết kế Hero sàn đấu giá theo phong cách Vintage Bookshop & Editorial Warm-Paper:
    - Nền ngà ấm áp (`#faf7f2`), điểm xuyết ánh sáng vàng hổ phách dịu mắt và viền chỉ mỏng trang nhã.
    - Huy hiệu "Sàn đấu giá sách Lật Lại" có đèn pulse xanh chuyển động tinh tế.
    - Tiêu đề nghệ thuật sắc nét, phân cấp typographic chuẩn mực, bổ sung 3 điểm bảo chứng uy tín (Kiểm định tại điểm, Phiên mở 24 giờ, Giao nhận an tâm).
    - Cặp nút hành động cao cấp: Nút chính "Đấu giá sách của bạn" vàng cát rạng rỡ và nút "Khám phá các phiên" cuộn mượt.
    - Thẻ Spotlight Showcase bên phải hiển thị card phiên nổi bật (hoặc fallback card phong cách nghệ thuật ấm áp) bo góc 16px, đổ bóng mềm đa tầng, không còn cảm giác nặng nề bí bách.
  - Cải tiến phần hướng dẫn tham gia thành hộp "3 bước tham gia sàn đấu giá Lật Lại" mượt mà, trực quan.
  - Làm mới thanh công cụ lọc (Toolbar) và section heading với số lượng phiên dạng badge, đèn pulse trực tiếp.
  - Đổi primer của `AuctionEntrance` từ màu đỏ rượu sang màu kem đồng bộ, loại bỏ hoàn toàn hiện tượng chớp khung đỏ khi tải trang.
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 31 files / 231 tests PASS.
  - Trình duyệt đã kiểm chứng giao diện mới thực tế, ghi hình và chụp ảnh xác nhận.

## Chọn sách trực tiếp từ kệ để đấu giá & Nhập giá trị khai báo trên trang mở phiên — 27/10/2026

- Nhánh `feat/web-auction-select-from-shelf` từ `feat/web-search-transition-animations` (`6219b1b`).
- **Nghiệp vụ**:
  - Loại bỏ bước bắt buộc phải tạo sách riêng thuộc kênh `channel: Auction` mới được mở phiên đấu giá.
  - Cho phép người bán chọn trực tiếp bất kỳ cuốn sách nào đã được duyệt từ kệ sách của mình (`Approved`, `Visible`, `Available`, không bundle) để đưa lên sàn đấu giá.
  - Chuyển trường nhập **Giá trị khai báo (Giá trị bảo vệ sách)** trực tiếp ra trang mở phiên đấu giá (`/auctions/new`), mặc định gợi ý theo giá niêm yết/trao đổi trên kệ của cuốn sách được chọn và cho phép người bán tùy chỉnh (từ 10.000đ đến 1.000.000đ).
  - Đảm bảo ràng buộc nghiệp vụ (invariants): Ngay khi gửi yêu cầu tiếp nhận đấu giá (`createAuctionIntake`), bài đăng trên kệ được chuyển sang trạng thái `Reserved` với `exclusive_commitments` loại `AuctionIntake`. Nhờ đó, cuốn sách sẽ **ngay lập tức ẩn khỏi tất cả kệ sách công khai và tìm kiếm marketplace** cho tới khi kết thúc phiên hoặc được thu hồi về kệ nếu bị hủy.
- **Contract & Implementation**:
  - `packages/api-contract/openapi.yaml` & `src/schema.ts`: Bổ sung trường tùy chọn `declaredValue` (integer, min 10000, max 1000000) vào `CreateAuctionIntake`. Chạy `pnpm contract:generate` và `pnpm contract:check` PASS.
  - `apps/api/src/modules/auctions/auction-intakes.service.ts`: Nới lỏng truy vấn bài đăng hợp lệ: chấp nhận bài đăng `Approved`, `Visible`, `Available` của người gọi không giới hạn channel `Auction`. Tính `protectiveValue` từ `body.declaredValue ?? r.salePrice ?? r.exchangeValue ?? body.startPrice`. Validate khoảng giá trị khai báo 10k - 1M trong `validatePrices`.
  - `apps/user-web/src/lib/owner-listing-labels.ts`: Cập nhật `auctionEligible` chấp nhận bài đăng hợp lệ trên kệ của người bán.
  - `apps/user-web/src/services/auctions.ts`: Thêm `declaredValue?: number | null` vào `CreateIntakeBody` và kiểm tra lỗi trong `intakePriceErrors`.
  - `apps/user-web/src/pages/CreateAuctionPage.tsx`:
    - Truy vấn toàn bộ sách của người bán trên kệ bằng `getMyListings(undefined, undefined, 50)`.
    - Thẻ chọn sách hiển thị giá niêm yết trên kệ (`salePrice` hoặc `exchangeValue`).
    - Thêm ô nhập `PriceInput` cho "Giá trị khai báo (Giá trị bảo vệ)" tại Bước 3, tự động cập nhật gợi ý giá khởi điểm và vé xem trước phiếu đấu giá.
    - Cập nhật văn bản giải thích và hộp thoại xác nhận về việc sách sẽ tạm ngừng hiển thị trên thị trường công khai.
- **Kiểm tra**:
  - `pnpm contract:check`: PASS.
  - `pnpm --filter @used-books/api typecheck`: PASS.
  - `pnpm --filter @used-books/user-web typecheck`: PASS.
  - `pnpm --filter @used-books/api test auction`: 6 files / 42 tests PASS.
  - `pnpm --filter @used-books/user-web test`: 31 files / 231 tests PASS.


- Nhánh `feat/web-search-transition-animations` từ `origin/main` (`6541705`).
- Thực hiện chuỗi cải tiến chuyển động và trải nghiệm thị giác theo yêu cầu người dùng:
  - **Trang tìm sách (`/books`)**:
    - Tích hợp `AnimatePresence mode="wait"` với hiệu ứng chuyển trang `pageVariants` (trượt đa hướng mượt mà kết hợp làm mờ và độ sâu 3D scale nhẹ) khi lật trang hoặc đổi bộ lọc.
    - Bộ điều hướng phân trang đầy đủ: nút "Trang trước", nút "Về trang đầu", nút "Trang tiếp theo", huy hiệu chỉ số trang `Trang {page}`.
    - Bộ lọc tab hình thức (Tất cả / Bán / Trao đổi / Đấu giá) có thanh chỉ thị nổi hoạt họa `activeModeIndicator` (`layoutId="activeFilterTab"`).
    - Bộ lọc tags/chips có hiệu ứng xuất hiện/biến mất mềm mại với `AnimatePresence`.
    - Lưới skeleton shimmer card hiển thị khi đang tìm kiếm / tải dữ liệu.
  - **Cuộn quán tính mượt mà (Smooth Momentum Inertia Scrolling)**:
    - Cài đặt thư viện `lenis` (`^1.3.27`), xây dựng hook [useSmoothScroll.ts](../../apps/user-web/src/hooks/useSmoothScroll.ts).
    - Áp dụng toàn cục qua [AppRouteLayout.tsx](../../apps/user-web/src/app/AppRouteLayout.tsx) cho trang chủ (`/`), tìm kiếm (`/books`), tài khoản cá nhân (`/account`, `/profile`) và các trang thuộc ứng dụng; điều tiết vuốt chuột 60fps/120fps có độ trễ quán tính mượt mà.
    - Tự động dừng (`lenis.stop()`) khi mở dialog/modal hoặc khi vào không gian hội thoại chat (`/chat`), tự động cuộn mượt về đầu trang kết quả (`#catalog-results`) khi bấm chuyển trang.
  - **Hiệu ứng phóng to ảnh bìa chuyển cảnh chuẩn Chat (View Transition API & Tao Tajima)**:
    - Xây dựng [BookTransition.css](../../apps/user-web/src/components/BookTransition.css) đồng bộ với kiến trúc chuyển cảnh của phòng Chat (`ConversationTransition.css`).
    - Gắn `viewTransition` trực tiếp lên liên kết `<Link to={detailUrl} viewTransition>` tại [BookCard.tsx](../../apps/user-web/src/components/BookCard.tsx) và nút quay lại `Về kệ sách` tại [BookDetailPage.tsx](../../apps/user-web/src/pages/BookDetailPage.tsx).
    - Sử dụng `useViewTransitionState` từ `react-router-dom` kích hoạt `data-book-morph-card="true"` đúng thẻ được bấm, gán `view-transition-name: book-cover` trên cả thẻ danh sách và [ListingGallery.tsx](../../apps/user-web/src/components/ListingGallery.tsx).
    - Trình duyệt tự động phóng to (zoom/morph) mượt mà có gia tốc GPU `cubic-bezier(0.16, 1, 0.3, 1)` trong 440ms, nền và thanh điều hướng giữ cố định; khi bấm quay lại trang tìm kiếm, bìa sách thu nhỏ mượt mà đáp về đúng thẻ ban đầu.
    - Chuẩn hóa khung ảnh trang chi tiết trong [ListingGallery.module.css](../../apps/user-web/src/components/ListingGallery.module.css) và [BookDetailPage.module.css](../../apps/user-web/src/pages/BookDetailPage.module.css) thành khung dọc tỷ lệ chuẩn sách 3:4, loại bỏ hoàn toàn đệm hộp cũ giúp ảnh hiển thị tràn viền full khung (Edge-to-Edge) sắc nét.
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 31 files / 231 tests PASS.
  - `pnpm --filter @used-books/user-web build`: PASS.
  - Trình duyệt Chromium ghi nhận hoạt ảnh View Transition phóng to và thu nhỏ 100% mượt mà, console 0 lỗi.

## Sửa ảnh bản sách bị cắt trên Member web — 27/10/2026

- Nhánh `fix/web-listing-photo-fit`, base main `a463041`; gói commit
  `fix(web): preserve full listing photos in cards and galleries`. Owner giao
  push/tạo PR và kiểm CI; kết quả remote theo PR của nhánh, không tự merge.
- Component `ListingPhoto` dùng chung cho Home/Search, chi tiết, ảnh lớn và các
  consumer chuyển từ `object-fit: cover` sang `contain`; thêm khoảng đệm riêng
  cho card để giữ bìa khỏi nhãn tình trạng/hiệu ứng hover, giữ motion hiện có.
- Đối chiếu chỉ đọc ảnh Doraemon gốc với ảnh tải qua public API/storage thật:
  cả hai350×553px, đúng tỷ lệ; không cần đăng lại ảnh hoặc sửa pipeline upload.
- PASS: user-web build/typecheck,231unit/31file, lint (6warning cũ), CSS mới đã
  được Vite phục vụ; diff check. Detector có4advisory radius14px vốn có.
- Browser visual desktop/mobile NOT RUN: Computer Use tự chặn vì không xác định
  chắc URL Chrome trên Windows. Dùng ảnh người dùng cung cấp và source để chẩn
  đoán; không nhận là browser/native/human PASS. Engine báo config/surface brief
  cũ, giữ ngoài phạm vi; READINESS không đổi. Tiếp theo: xem Home/Search, chi tiết
  và ảnh lớn trên desktop/mobile; chưa kiểm được ảnh ngang bằng browser.

## Seller tự đăng/hẹn phiên, mua ngay sau bid — 27/10/2026

- Nhánh `feature/seller-scheduled-auctions` từ main `d3b19e5`; chưa push/PR.
  Owner cho ngoại lệ gate riêng gói này ([ADR0047](../adr/0047-seller-scheduled-auctions.md)).
- API: `publishAuction` (seller, intake Passed, mở ngay hoặc hẹn 5 phút–7 ngày,
  1–168 giờ), `rescheduleAuction` (trước bid đầu/mua ngay, tối đa 5 lần; đang mở
  chỉ đổi thời lượng, còn ≥1 giờ). Phase Scheduled/Live/Ended suy từ giờ server,
  không worker mở phiên; bid/Auto/mua ngay trước startAt → 409 `AuctionNotStarted`.
  Mua ngay vẫn tùy chọn khi tạo; còn dùng sau bid khi giá < giá mua ngay, chưa ai
  dùng và người gọi không đang dẫn. Staff `openAuction` giữ lại nhưng deprecated.
- Migration mới `0037-seller-scheduled-auctions` (plannedEndAt/publishedAt/
  publishedBy/scheduleRevision, backfill startAt+24h, index state+startAt). Nhóm
  cần chạy migrate trước khi chạy API; chưa áp lên DB chính. Contract 0.52.0.
- Client: user-web (đăng/đổi giờ, mục Sắp mở, chi tiết phiên hẹn giờ), RN (sheet
  đăng/đổi giờ, Sắp mở), admin-web (bỏ nút Staff mở phiên, hiện giờ hẹn).
- Kiểm tra local: API unit, Mongo suite 48 PASS, auction HTTP 70/71 (test giao
  hàng ADR0044 timeout 15s khi chạy cả file, PASS khi chạy riêng), contract/routes
  PASS; user-web 231, admin 30, RN auction 14 PASS; browser Chromium với API fixture
  `_test` và route mock cho màn seller. NOT RUN: CI remote, thiết bị native,
  test validator raw cho 0037, human review.


## Đã tích hợp bộ sách vào main — 26/10/2026

- [PR67](https://github.com/huangg49/used-book-marketplace/pull/67) đã squash merge
  vào main tại `9a07475` sau8/8nhóm CI PASS trên đúng head `a1e3036`. Local main
  đã fast-forward và đối chiếu tree trùng với nhánh feature trước khi ghi checkpoint.
  Phần skill pin và toàn bộ công việc bundle/tối ưu web đã được giữ trong Git.
- Leader cho phép gói tích hợp này không cần thành viên khác review trong phiên
  26/10. Đây là ngoại lệ theo chỉ thị owner; không là human review PASS, không sửa
  quy định chung TEAMWORK/ADR0046 hoặc các gate release trong READINESS.
- CI remote PASS: docs, admin-web, user-web, operations/public shelf, demo,
  React Native, Flutter và API. API có192unit +54Mongo +723HTTP/end-to-end tests;
  user-web231unit/31file cùng các browser workflow; admin30unit, session27unit.
  Web/RN export và Flutter CI không thay nghiệm thu thiết bị Android/iOS.
- CI đã phát hiện và sửa: hai tiêu đề sách ở BuyNow→Chat (chỉ mount một identity
  theo breakpoint960px); selector menu tài khoản/ví cũ sau main redesign; tên tài
  khoản làm tràn floating navbar ở1024/1366px/chữ130%. Giữ các assertion về tiền,
  retry, kích thước chạm và containment. CI browser sau sửa đã đạt, kể cả ví.
  Chromium install chậm được retry riêng workflow trên cùng head; không đổi source
  hoặc hạ điều kiện kiểm tra để đạt CI. Kết quả chi tiết nằm trong PR67/check links.
- QA local đã dừng; không deploy hoặc áp migration lên DB chính, không đổi env
  hay client mobile. Browser local của Work đang tắt nên lượt navbar cuối xác nhận
  bằng CI browser, không nhận là CUA local PASS. Native device/live Supabase/VNPay
  và nghiệm thu người thật vẫn là các phạm vi riêng chưa đóng.
- Tiếp theo: nhóm nhận main, kiểm env và chạy migration mới theo quy trình setup
  trước khi chạy API; không reset dữ liệu chính. Tài liệu nghiệp vụ/giới hạn và
  checklist vật lý ở [ADR0046](../adr/0046-whole-book-bundles.md). Evidence local
  và backup trước commit còn trong `.tmp/publish/` và `.tmp/main-sync/`.


## Đồng bộ main và giữ phần bán nguyên bộ — 26/10/2026

### Lượt2: PR66 và giao diện tìm sách

- Fetch mới có14commit; fast-forward feature branch và local `main` từ `8e4fb79`
  tới `9d0af9c`. Hai file có thay đổi trùng (BookSearchPage/checkpoint) ghép3way
  tự động thành công, không có conflict cần giải tay. Bảo toàn131path staged và
  công việc unstaged/untracked; backup206file/index/patches ở
  `.tmp/main-sync/2026-10-26T05-44-29-424Z/`.
- Giữ lá thu, bộ lọc thu gọn/mở lại, lưới5cột, khung ảnh3:4 và containment ảnh
  hội thoại từ main; giữ debounce/IME/Enter, capability bundle và toàn bộ bản vá
  local từ lượt1. Sửa6link relative sai trong phần checkpoint mới từ upstream.
- PASS:231unit/31file, build/typecheck và lint user-web (6warning cũ); docs/diff
  check. Browser CUA với catalog preview có sẵn: thu gọn/mở lại bộ lọc, tìm Naruto
  bằng Enter nhận3kết quả, kiểm lưới/ảnh và lá thu. Evidence ở
  `.tmp/main-sync/second/`; preview không là real API/storage/bundle browser PASS.
- Docker đang tắt: không khởi động Docker hoặc DB chính, không chạy API/Mongo/
  native gate không đổi. Server preview5188 và tab QA đã đóng. Fetch đối chiếu cuối
  không có commit mới; HEAD/local main đều `9d0af9c`. Chưa commit/push/PR;
  READINESS giữ nguyên.

### Lượt1: PR64/65 và tương thích bộ sách

- Theo yêu cầu owner, fetch `origin/main`: thêm33commit từ `901c7bb` tới
  `8e4fb79` (PR64/65). Fast-forward nhánh đang làm `codex/whole-book-bundles`
  và local `main` tới cùng mốc; không pull đè working tree. Bản sao SHA256 của
  199file local, index gốc và binary patches nằm trong
  `.tmp/main-sync/2026-10-26T03-42-42-272Z/`; pointer `latest.txt` cùng thư mục cha.
- Đã xử lý5conflict: router, OwnerListingRow, DashboardMyBooks, my-listings tests
  và checkpoint này. Giữ UI dashboard/profile/sidebar/grid-list, sticky filters,
  route sửa bài đã duyệt và ẩn/hiện/gỡ bài từ main; giữ lazy routes, tối ưu web,
  skills và toàn bộ công việc bundle local. Không có unmerged path; tập131path
  staged ban đầu được giữ, phần feature vẫn unstaged. Đối chiếu191file ngoài
  vùng tích hợp:189file nguyên byte và2file vẫn được xóa như bản gốc.
- Trang sửa bài mới giữ/deep-copy đầy đủ manifest, sửa từng cuốn, tính tình trạng
  thấp nhất, chỉ Sale/giá cả bộ và cam kết toàn bộ sách. Snapshot nội dung/ảnh
  không đổi khi retry; mất phản hồi khóa form, giữ runner/key/body/version để
  kiểm lại đúng lệnh. Sửa lỗi đã tái hiện: router chặn chính chuyển trang sau
  submit thành công vì `setDone` chưa commit; ref đánh dấu hoàn tất trước navigate.
  Grid/list/dashboard dùng tên bộ, số cuốn và giá cả bộ; thống kê đếm cuốn vật lý.
- PASS:231unit/31file user-web, build/typecheck, lint (6warning đã có), contract
  check và177route/26controller. Main không đổi API/contract/dependency lock;
  không chạy lại gate API/Mongo/native đã có khi source liên quan không đổi.
  Build vẫn cảnh báo chunk lớn. Impeccable context và detector một lượt4target:
  một advisory màu `#9b1c1c` vốn có ở trang edit từ main, không đổi palette ngoài
  phạm vi. UI giữ brand/main layout theo ProMax + Taste + Impeccable.
- Browser CUA trên real API/Mongo QA riêng, Sharp thật/storage fake: sửa bộ thành
  tập1và4, tình trạng Worn/giá175.000đ; giả lập503 sau commit, form khóa và retry
  cùng key/hash; DB xác nhận đúng manifest/giá và chỉ một revision mới. Lượt xác
  nhận sau bản vá chuyển trang về `/my-books?moderation=PendingReview`, thông báo
  thành công và đúng hai bộ; kiểm danh sách/lưới và viewport390×844. Evidence/log/
  ảnh nằm ở `.tmp/main-sync/`. Không nhận là đã chạy toàn bộ browser suite.
- QA đã close graceful, xác minh DB fixture không còn, users/roles đều0; dừng đúng
  Mongo QA của lượt này, các port QA đã đóng, viewport reset/tab QA đóng. DB/env
  chính, Docker Desktop và client mobile không đổi. READINESS giữ nguyên; human
  review/remote CI/live storage/native chưa nghiệm thu. Chưa tạo commit/push/PR;
  máy còn thiếu Git author identity. Bước tiếp: người trong nhóm review diff tích
  hợp và bundle theo ADR0046 trước khi commit/đẩy nhánh trong quyền được giao.

## Hoàn thiện xác nhận mua bộ và chuyển sang hội thoại

- Owner yêu cầu hoàn thiện theo tiêu chuẩn cao sau gói25/10. Tiếp tục nhánh
  `codex/whole-book-bundles`, base `901c7bb`; bảo toàn index skill và các tối ưu
  web trước đó. Chưa commit/push/PR/merge; máy vẫn thiếu Git author identity.
- Xác nhận Buyer gắn với listing/revision; đổi danh sách tập phải xác nhận lại.
  Mỗi lần gửi giữ bản sao nội dung cho cả lúc chờ, mất phản hồi và đã có quote.
  Mua ngay và thương lượng hiển thị đúng bản đã xác nhận, giữ key/body/version
  khi retry. Đổi listing, hội thoại hoặc người dùng sẽ tạo phạm vi state riêng.
  Chỉ cho tải lại nội dung sau lỗi đã có kết quả rõ; không bỏ lệnh chưa biết kết
  quả. Form/địa chỉ được giữ; lỗi không khẳng định máy chủ chưa ghi khi mất ACK.
- Đã tái hiện2cảnh báo React trên phiên QA sạch, không HMR: `Navigate` ở bước
  Order→Chat nhận object state mới mỗi render trong lúc lazy route đang tải.
  Giữ identity state ổn định; lượt lạnh sau sửa có0cảnh báo này. Browser regression
  `tests/order-chat-workspace.mjs` giờ thu cả cảnh báo này vào lỗi của suite.
- PASS: user-web build/typecheck/lint và198unit/28file, gồm6ca identity/snapshot và
  manifest không đổi khi mất phản hồi ở7bước catalog/listing/media/upload/finalize/
  draft/submit. API typecheck/lint và60HTTP/Mongo Order tests, gồm4ca mới: hủy,
  hết hạn giữ bộ, hết hạn quote, Seller thay manifest làm quote cũ mất hiệu lực.
  Kiểm cả mở lại nguyên bộ, snapshot,0tiền giữ/journal cho đơn chưa thanh toán.
  Lint chỉ còn warning ngoài phạm vi từ trước; cảnh báo chunk lớn vẫn giữ.
- Browser CUA dùng real API/Mongo QA riêng, Sharp thật và storage fake: tài khoản
  Buyer/Seller QA, hủy→mở bán cả bộ; sửa manifest→409→tải lại→bỏ tick; chặn lấy
  quote khi chưa tick lại; mất ACK sau commit→retry cùng key/body/revision.
  Ba nhóm replay được đối chiếu hash; đã kiểm ở cả Mua ngay và thương lượng.
  Order sau xác nhận lại giữ đúng hai tập/ghi chú/giá mới. Phiếu390×844 có document
  width375px, không tràn ngang; thông báo lỗi/nút recovery vẫn dùng được.
- Impeccable context/harden và detector một lượt3target trả[]; giữ component,
  brand/motion hiện có theo ProMax/Taste/Impeccable. Log/ảnh/verification local ở
  `.tmp/bundle-hardening/`. Browser là các ca CUA thực tế, không nhận toàn bộ
  Playwright suite đã chạy. Không chạy lại gate API/Mongo/native nguồn không đổi.
- [ADR0046](../adr/0046-whole-book-bundles.md) có bảng cho người trong nhóm review
  implementation và tình huống vật lý. Human review/remote CI/live storage/VNPay/
  native vẫn chưa nghiệm thu; không mở Delivered/inspection/refund/settlement.
  READINESS, contract, migration và DB chính không đổi ở lượt này. QA đã dừng,
  DB browser/users/roles đã dọn và viewport reset; Docker Desktop giữ nguyên.

## Hiệu ứng Lá Vàng Mùa Thu Rơi (User Web - Trang Tìm Sách) — 26/10/2026

- Nhánh `feat/web-edit-approved-listing`.
- Theo yêu cầu mới nhất của người dùng: Gỡ bỏ bản đồ minh họa thung lũng (ruộng bậc thang, máy bay, mây, suối), chỉ giữ lại duy nhất hiệu ứng hoạt họa lá thu rơi tự nhiên trên trang tìm sách `/books` ([BookSearchPage.tsx](../../apps/user-web/src/pages/BookSearchPage.tsx)):
  - Áp dụng sắc màu vàng lá thu Hà Nội (`#fcf5df` đến `#ead098` với vầng sáng nắng ấm `radial-gradient`), gợi nhớ nắng thu mật ong và thảm lá vàng sấu già trên phố Phan Đình Phùng.
  - Tích hợp trực tiếp `<AutumnLeavesCanvas />` vào khung nhìn cố định `.leavesWrapper` (`position: fixed; inset: 0; pointer-events: none; z-index: 0;`).
  - 42 lá cây mùa thu (lá phong đỏ, sồi già, bạch dương) bay chao liệng 3D mượt mà trên nền trang tìm kiếm, không che khuất hay gây rối mắt đối với các bộ lọc, thanh tìm kiếm và thẻ sách.
  - Triệt tiêu hoàn toàn dải hở trắng trên footer: Bổ sung `ROUTES.search` vào điều kiện `homeFooter` trong [MainLayout.tsx](../../apps/user-web/src/layouts/MainLayout.tsx) để loại bỏ khoảng cách `margin-top: 72px` của footer, giúp nền vàng lá thu Hà Nội tiếp giáp liền mạch, mượt mà vào chân trang đỏ rượu `#5c0202`.
  - Chuẩn hóa khung ảnh bìa sách dạng dọc tỷ lệ 3:4 tràn viền (Full Cover Edge-to-Edge) trong [BookCard.module.css](../../apps/user-web/src/components/BookCard.module.css): Thay thế khung ngang 180px cũ bằng `aspect-ratio: 3 / 4; width: 100%; height: auto; padding: 0;`, ảnh bìa chuyển sang `object-fit: cover; width: 100%; height: 100%;` lấp đầy 100% khung dọc, loại bỏ hoàn toàn viền trống hai bên.
  - Điều chỉnh ràng buộc hiển thị 5 thẻ bài đăng/hàng trên desktop trong [BookSearchPage.module.css](../../apps/user-web/src/pages/BookSearchPage.module.css): Mở rộng container `.catalog` `max-width: 1600px; padding: 24px 32px 0;`, cấu hình lưới `.grid` thành `grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 24px 16px;`, điều chỉnh đệm nút `.view` trong `BookCard.module.css` để giữ độ thoáng và cân xứng thẩm mỹ, bổ sung breakpoint tablet 2 cột linh hoạt.
  - **Nút thu gọn bộ lọc 3 dấu gạch & Animation gom vô gom ra (Collapsible Animated Filter Sidebar)**:
    - Bổ sung nút 3 dấu gạch (`Menu` icon) ở góc phải tiêu đề "Bộ lọc sách" (`.collapseSidebarBtn`) trong panel bên trái để người dùng thu gọn sidebar khi muốn tập trung xem sách.
    - Căn chỉnh thẳng hàng thanh tiêu đề bộ lọc: xóa bỏ các rule CSS `.sidebar h2` bị lặp, dùng `align-items: center; user-select: none;` để icon badge bên trái, tiêu đề "Bộ lọc sách" và nút 3 gạch bên phải nằm trên đúng 1 trục ngang, loại bỏ hoàn toàn hiện tượng lệch hàng và vệt bôi đen lật màu chữ.
    - Đổi icon bộ lọc thành icon chiếc phễu đặc (`Filter` từ `lucide-react` với `fill="currentColor"`): đồng bộ icon phễu trên header bộ lọc, nút vuông mở lại bên cạnh thanh tìm kiếm, thanh lọc nổi (sticky filter) và nút bộ lọc mobile.
    - Sửa lỗi tràn ảnh bìa trong danh sách hội thoại: giới hạn `position: absolute; inset: 0;` cho `.cover > .photoFrame` trong [BookCard.module.css](../../apps/user-web/src/components/BookCard.module.css), đặt kích thước khung và `overflow: hidden` cho `.cardCover` trong [Conversation.module.css](../../apps/user-web/src/components/conversation/Conversation.module.css) để ảnh bìa sách trong các thẻ trao đổi/hội thoại không bị văng đè lên giữa thẻ.
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 27 test files / 201 tests PASS.
  - `pnpm --filter @used-books/user-web lint`: PASS (0 errors).

## Chức năng Chỉnh sửa bài đăng đã duyệt (User Web) — 25/10/2026

- Nhánh `feat/web-edit-approved-listing`, base từ nhánh `feat/web-profile-overview-redesign`.
- **Nghiệp vụ thực hiện (Kế hoạch A - Tuân thủ SRS §7.2 / ADR 0012)**:
  - Cho phép người bán chỉnh sửa bài đăng đã được duyệt (`Approved`, `Available`, không phải `Removed`, không phải kênh `Auction`).
  - Khi gửi bản sửa, hệ thống gọi `POST /listings/{id}/revision` (`reviseApprovedListing`), tạo một revision mới ở trạng thái `PendingReview` và tạm ngừng hiển thị trên kệ công khai cho đến khi quản trị viên phê duyệt lại.
  - **Khóa danh tính sách (Book Identity Lock)**: Khóa cố định trường `bookId` (tên sách, tác giả) trên giao diện theo bài gốc; người bán muốn đổi sách khác phải đăng bài mới (giới hạn bảo vệ phía UI theo Plan A; API server-side lock sẽ được bổ sung sau nếu có chỉ thị cập nhật contract/ADR).
  - Cho phép sửa: tình trạng sách, mô tả chi tiết, hình thức (Bán/Đổi/Cả hai), giá bán (10.000đ – 1.000.000đ theo LS-D06), giá trị đổi, địa chỉ gửi sách (`HCM-DEMO-v1`), quản lý 1–8 ảnh thật (giữ ảnh cũ, upload ảnh mới qua `upload`, chọn ảnh bìa) và cam kết quyền sở hữu.
  - **Chức năng Tạm ẩn / Mở lại (`setListingVisibility`) & Chống spam (Anti-spam Cooldown)**:
    - Người bán có thể tạm ẩn bài đăng (`visibility: 'Hidden'`) để tạm ngưng hiển thị trên kệ công khai và mở lại (`Visible`) bất cứ lúc nào mà không cần quản trị viên duyệt lại (tuân thủ ADR 0012).
    - **Cơ chế chống spam**: Tích hợp hook `useActionCooldown` (thời gian đệm 4 giây) và bộ điều khiển `createCooldownController`. Khi người dùng bấm Tạm ẩn / Hiện lại, nút sẽ lập tức bị vô hiệu hóa trong lúc gọi API (`isBusy`) và tiếp tục khóa đếm ngược hiển thị thời gian còn lại trực quan trên nút (ví dụ: `Hiện lại (4s)`, `Tạm ẩn (3s)`). Ngăn chặn hoàn toàn tình trạng spam click liên tục gây lỗi 409 Conflict hoặc nghẽn server. Áp dụng đồng bộ trên cả `OwnerListingRow.tsx` (Grid & List) và `EditListingPage.tsx` (Thẻ quản lý ấn phẩm).
    - **Giao diện nhận diện bài tạm ẩn (Hidden Visual State)**: Khi bài đăng ở trạng thái `Hidden`, toàn bộ thẻ và ảnh bìa tự động xám mờ (`grayscale(0.85) brightness(0.9)`), trung tâm ảnh bìa xuất hiện huy hiệu nổi mờ kính tối `hiddenBadgeCenter` với biểu tượng `EyeOff` cùng chữ `ĐANG ẨN` rõ nét; nút thao tác "Hiện lại" được đổi nền kem ấm nổi bật giúp người bán dễ dàng nhận biết và mở lại bài khi cần.
  - **Chức năng Xóa bài đăng (`archiveListing`)**: Cho phép người bán gỡ vĩnh viễn bài đăng (`POST /listings/{id}/archive`, soft-delete `deletedAt`), kiểm tra điều kiện `trade === 'Available'`, không cho xóa khi sách đang có giao dịch (`Reserved`) hoặc đã hoàn tất (`Sold`/`Exchanged`).
  - **Idempotency & Retry**: Tái sử dụng cùng `Idempotency-Key` và runner nếu gặp lỗi mạng rớt phản hồi, không tạo revision thứ hai; giữ nguyên version mong đợi khi có lỗi xung đột.
- **Giao diện & Thành phần đã xây dựng**:
  - `apps/user-web/src/hooks/useActionCooldown.ts` & `.test.ts`: Hook và controller đếm ngược cooldown chống spam, quản lý vòng đời timer an toàn khi component unmount.
  - `apps/user-web/src/lib/owner-listing-edit.ts`: Kiểm tra điều kiện sửa `editApprovedBlock`, `canEditApproved`, quyền ẩn `canToggleVisibility`, quyền xóa `canArchiveListing`, validation độ dài code-points, giá, cờ tình trạng sách, build revision content.
  - `apps/user-web/src/services/listing-revision.ts` & `my-listings.ts`: Service upload ảnh mới, gửi revision, thay đổi `setListingVisibility`, và lưu trữ/xóa bài `archiveListing` với `Idempotency-Key`.
  - `apps/user-web/src/pages/EditListingPage.tsx` & `.module.css`: Thiết kế lại giao diện theo phong cách sang trọng Lật lại (thẻ hồ sơ ấn phẩm 3D, thẻ chọn hình thức dạng viên thuốc, lưới chọn tình trạng 4 mức độ, bộ câu hỏi chuyển đổi Có/Không, khung quản lý trạng thái Tạm ẩn/Xóa bài, thanh nút hành động dính chân trang thu hẹp căn giữa).
  - Tuyến đường `/my-books/:listingId/edit` đăng ký dưới `DashboardLayout` trong `router.tsx` và helper `ROUTES.myBookEdit`.
  - Cập nhật `OwnerListingRow.tsx`: Thêm nút "Tạm ẩn" / "Hiện lại" và nút "Xóa bài" kèm modal xác nhận an toàn `ConfirmDialog` trên cả hai chế độ xem Grid và List.
  - `MyBooksPage.tsx`: Bổ sung banner thông báo thành công sau khi gửi bản sửa và tự động điều hướng về bộ lọc `Chờ duyệt` (`PendingReview`).
- **Kiểm tra**:
  - `pnpm --filter @used-books/user-web typecheck`: PASS (0 lỗi).
  - `pnpm --filter @used-books/user-web test`: 27 test files / 201 tests PASS (trong đó 3 tests cho `useActionCooldown` controller, 20 tests validation U1–U8, 3 tests idempotency/revision U9–U11, 2 tests visibility/archive API calls, và 2 tests quy tắc canToggleVisibility/canArchiveListing).
  - `pnpm --filter @used-books/user-web lint`: 0 errors (6 cảnh báo hook cũ không liên quan).
  - E2E E1–E12: Chưa chạy (NOT RUN - yêu cầu Mongo replica set riêng với `*_test` database theo quy định AGENTS.md, không chạy harness ghi đè DB chính).


## Dashboard và kệ sách từ main — 25/10/2026

- Nhánh `feat/web-profile-overview-redesign`, base từ `origin/main` (`901c7bb6`).
- **Sidebar cá nhân**: Tạo khung độc lập không viền thô, nút thu gọn 3 gạch (hamburger) chuyển đổi chiều rộng 68px/240px mượt mà với spring physics của `framer-motion`, tuân thủ chính sách chuyển động (giữ animation).
- **Thống kê tổng quan (DashboardStats)**: Xen kẽ nền Đỏ rượu `#5c0202` và Trắng ngà `#ffffff` thẩm mỹ, số dư khả dụng và giá trị kệ sách làm thẻ điểm nhấn (hero cards). Khắc phục query limit từ 100 thành 50 theo OpenAPI contract `/me/listings`, lọc đúng 4 cuốn sách đã duyệt (`Approved`) và hiển thị huy hiệu vàng ánh kim nổi bật.
- **Khối Đấu giá của bạn (DashboardAuctionFocus)**: Thay thế khối bản nháp bằng tính năng theo dõi phiên và xem lịch sử đấu giá, kết nối API `listMyAuctions`, lọc 3 trạng thái Đang diễn ra / Cần thanh toán / Tất cả phiên; di chuyển vị trí xuống dưới khung Dòng tiền và trên Kệ sách.
- **Kệ sách của tôi (MyBooksPage)**: Bổ sung bộ chuyển đổi Grid/List, thiết kế lại khung giá bán và giá trao đổi thành 2 thẻ tách biệt làm nổi bật giá trị, hiển thị ảnh bìa full khung 100%.
- **Kiểm tra**: `pnpm --filter @used-books/user-web typecheck` PASS; 24 test files / 172 tests PASS.

## Bán nguyên bộ sách — owner đã duyệt25/10/2026

- Nhánh `codex/whole-book-bundles`, base `901c7bb`; giữ nguyên gói skill đang
  stage và tối ưu web từ24/10. Chưa commit vì Git author identity của máy mới
  chưa có; không push/PR/merge/deploy. [ADR0046](../adr/0046-whole-book-bundles.md)
  và SRS1.1 ghi ngoại lệ một listing có thể chứa bộ2–50cuốn.
- Seller chọn Sách lẻ/Bộ sách, tạo khoảng tập rồi sửa danh sách, tình trạng và
  lỗi từng cuốn; giá cho cả bộ, tình trạng chung theo cuốn thấp nhất. Kệ riêng,
  card công khai, chi tiết, phiếu mua, đơn hàng và hội thoại dùng tên bộ. Một bộ
  là một listing/commitment/Order item, không bán/trả một phần, Exchange hay Auction.
  Không sửa client RN/Flutter của teammate và không mở gate giao nhận/settlement.
- OpenAPI0.51.0/types được generate; manifest được chốt theo revision và Order
  snapshot. Public shelf/detail opt-in `bundleSupport=whole-v1`, quote mua bộ
  cần `acknowledgeWholeBundle:true`, reviewer cần `bundleContentsVerified:true`.
  Client cũ không thấy bộ trên kệ hoặc vô tình mua bằng quote không xác nhận.
  Price assist sách lẻ từ chối bộ và bỏ giá nguyên bộ khỏi asking-price evidence.
- Migration mới0035/0036 thêm validator manifest/checklist và text tìm tên bộ/tập;
  chưa áp dụng lên DB local chính. Không sửa migration đã áp dụng, không đổi env
  hoặc mật khẩu seed. Sau khi lấy code này, chạy migration theo setup repo trước
  khi dùng bộ sách với DB chính. Cùng hiện vật bị khai báo trong nhiều tin độc lập
  chưa được tự nhận diện; hiện dùng cam kết Seller, không tuyên bố chống trùng vật lý.
- PASS Node24.22.1/pnpm11.19.0: contract generate/check/routes177operations/
  26controllers; API build/typecheck/lint,192unit/25file; web build/typecheck,
  186unit/27file và lint; admin build/typecheck,30unit/5file và lint. Còn6warning
  web cũ, warning API cũ và cảnh báo chunk lớn; không nâng ngưỡng để che.
- API HTTP/Mongo:147ca trong listing-review/orders/price-assist đạt qua lượt kiểm
  cuối của từng file; gồm owner/stale/replay, legacy drop, Unicode tên tập trùng,
  validator từ chối mode/wholeOnly/duplicate/condition sai, thiếu checklist/Buyer
  acknowledgment, hai Buyer tranh một bộ và snapshot chính xác. Mongo suite48PASS,
  6SKIP (PostgreSQL import/primary election thiếu dịch vụ tương ứng). Một ca mới
  từng giả định Mongo `$toLower` hỗ trợ full Unicode; đã tách đúng trách nhiệm:
  service kiểm Unicode/NFC, DB kiểm trim/ASCII case; unit và HTTP kiểm tên `TẬP`.
- Browser thật dùng API/Nest và Mongo replica set QA riêng `_test`, Sharp thật,
  storage fake. Đã đăng bộ3tập từ web, duyệt bằng checklist đủ7ô, kiểm kệ riêng/
  công khai, chặn báo giá khi chưa xác nhận, lấy quote và tạo đơn chưa thanh toán;
  đơn/hội thoại giữ đủ3tập và ghi chú tập2. Desktop và390×844 không tràn ngang ở
  phiếu mua. Impeccable detector chạy một lần trên3target trả[]; dùng ProMax,
  Taste và Impeccable trong phạm vi UI đã duyệt. Ảnh/log local tại
  `.tmp/whole-book-bundles/` và `.tmp/bundle-*.log` (ignore).
- Log Vite của phiên QA có2cảnh báo React `Maximum update depth exceeded` lúc
  chuyển tạo đơn sang hội thoại; luồng vẫn hoàn tất và manifest đọc đúng. Chưa
  xác định component hay tái hiện với phiên không HMR; không nhận clean-console
  PASS và không tự quy lỗi này cho bundle hoặc source cũ khi chưa có baseline.
  Vấn đề này đã được tái hiện và xử lý trong gói26/10 ở trên.
- Live Supabase/VNPay, thanh toán/giao nhận thật, native và human acceptance/
  remote CI NOT RUN; READINESS không đổi. QA đã dừng bằng cleanup fixture, DB
  browser/users/roles đã dọn; Mongo QA khởi động riêng được dừng. Docker Desktop
  đã chạy sẵn ở lượt25/10 nên để nguyên. API/web/worker/DB chính vẫn đang dừng.

## Kết thúc phiên24/10/2026

- Cuối phiên theo yêu cầu owner: đã dừng API/watch, worker media/orders, Vite,
  Mongo container và Docker Desktop; xác nhận không còn process runtime project
  hoặc listener ở3000/5173/5174/5186/5187/5196/27017/57217/6379. Xóa riêng lock API
  cũ sau khi xác minh PID chủ đã dừng. Code/index, env, Mongo volume và QA evidence
  giữ nguyên; thay đổi chưa commit vì thiếu Git author identity. Bật lại Docker
  Desktop rồi chạy `pnpm dev:api` và `pnpm --filter @used-books/user-web dev`
  ở hai terminal, dùng pnpm11.19.0 theo repo. Không dùng PID cũ để vận hành phiên mới.

## Tối ưu tải Member web — 24/10/2026

- Owner giao tối ưu phần đã có, chỉ Member web; nhánh
  `codex/web-loading-optimization`, base `901c7bb`. Gói skill từ lượt trước được
  giữ riêng ở index; commit local chưa tạo vì máy mới thiếu Git author identity.
- Router tải code/CSS theo màn bằng route lazy, giữ Home và shell/overlay dùng
  chung. AuthLayout vẫn giữ nháp/animation khi đổi thẻ; VNPay return gate giữ vị
  trí trước Dashboard auth. Không đổi API/session/command, DB hoặc client mobile.
- Có fallback cho direct link, thông báo chờ sau200ms giữ màn hiện tại và cleanup
  khi hủy điều hướng. File tải lỗi có nút full reload, giữ nguyên query/hash;
  kiểm browser bắt được anchor cùng hash không reload nên đã dùng button.
- Đo toàn bộ JS/CSS ban đầu từ HTML production, gồm modulepreload: JS1.419.483→
  810.832byte (−43%), CSS437.696→130.894byte (−70%); gzip JS409.626→251.422,
  CSS76.190→25.472byte. Không nhận là bằng chứng LCP/INP hoặc thiết bị yếu đạt.
- PASS Node24.22.1/pnpm11.19.0: web build/typecheck,174unit/25file, lint với6warning
  cũ; Impeccable detector một lượt[] và docs/diff check. Hai test mới kiểm direct
  lazy loading và recovery không lộ lỗi kỹ thuật. Cảnh báo chunk>500k còn ở entry/
  auth-flight; không tăng ngưỡng để che cảnh báo.
- Browser production QA riêng5186: Home không tải trước các page chunk; Search/
  Auction chậm6/12s giữ màn cũ; hủy điều hướng gỡ thông báo; Back, auth đổi thẻ,
  callback ví guest và lỗi503→reload đúng query/hash đạt. Xem desktop/390×844 và
  ảnh gốc tại `.tmp/web-loading-optimization/`. Nháp sau Back vẫn có giá trị trong
  AX; công cụ che email/password nên không xác nhận so sánh byte-for-byte.
- QA chỉ mô phỏng delay/lỗi asset, đọc public API local; không đăng nhập/gửi form,
  tạo giao dịch hoặc ghi/xóa DB/bucket. Full E2E, real VNPay, native/human/remote
  CI NOT RUN; READINESS giữ nguyên. Chưa push/PR/merge/deploy.
- Lượt tiếp theo bỏ ConfigProvider/theme/locale Ant Design khỏi root và CSS import
  Material Symbols Google. Audit cả static/dynamic import từ entry:161file reachable,
  không có consumer Ant Design ngoài provider/theme hoặc Material Symbols đang chạy.
  Giữ package và component cũ chưa dùng; QueryClientProvider/session giữ nguyên.
- Production ban đầu sau lượt này: JS709.954byte/gzip213.746 (giảm thêm12%, tổng50%
  so với trước tối ưu); CSS130.780byte/gzip25.381 (tổng giảm70%). Entry còn407,74kB;
  auth-flight551,36kB còn cảnh báo. Không còn CSS import Google icon font.
- Build/typecheck, lint6warning cũ và174unit/25file PASS sau thay đổi. Browser production
  kiểm Home/Search desktop, bộ lọc390×844 mở/Escape trả focus và menu→login đạt;
  font/kích thước tiêu đề Home khớp trước/sau. Detector9finding trong global CSS đã có
  từ trước (6advisory màu/radius,3warning font); provider không có finding mới.
  Evidence/ảnh tại `.tmp/web-unused-dependencies/`; phạm vi NOT RUN như trên.
- Owner giao làm tiếp: CardFitText dùng chung ResizeObserver/MutationObserver,
  listener resize/font và một RAF queue; chỉ refit slot đổi kích thước, gộp tín hiệu
  trùng và hủy subscription/RAF khi unmount. Giữ thuật toán fit/minimum/clamp,
  CSS/card geometry và motion. Test100slot xác nhận1bộ observer/listener thay100bộ.
- PASS build/typecheck,180unit/26file (6ca mới: batch/targeted resize/unmount/
  teardown/font readiness/remount), lint6warning cũ, detector[] và docs/diff check.
  Browser Vite DEV với catalog preview có nhãn:20card/86slot, nội dung/kích thước/
  font/clamp khớp baseline trước sửa tại content width1265px và375px (viewport390),
  Home→Back khớp sau remount. Không nhận là đo FPS/INP hoặc native PASS.
  Preview production không bật catalog mẫu; không seed DB để QA. Baseline được
  phục vụ riêng bằng source override trong `.tmp/card-text-observers/`, evidence
  ở cùng thư mục; lần đo khác viewport bị loại, chỉ so khi cùng độ rộng thực.
- Search giữ input/URL tức thời, chờ300ms trước request khi gõ; Enter/nút tìm flush
  ngay, composition chặn tìm giữa lúc nhập. Khi đang chờ không hiện kết quả/cache
  dưới từ khóa khác; cleanup timer khi đổi từ khóa/unmount. Không đổi API/session.
- Browser fixture riêng5186/5187, cùng chuỗi `harrypotter`:11request→1; Enter/nút tìm
  có request sau77/95ms. Filter+query, Back, clear, unmount cancel,503→retry giữ từ
  khóa và feedback chậm ở390×844 PASS. Build/typecheck,180unit/26file, lint6warning
  cũ, detector[] và docs/diff PASS. Evidence `.tmp/catalog-search-debounce/`;
  fixture không DB, OS IME thật/full E2E/native/remote CI NOT RUN; gate giữ nguyên.

## Thay skill UI theo yêu cầu owner — 24/10/2026

- Nhánh `codex/replace-ui-skills`, base `901c7bb` (main/PR63). Theo owner, bỏ
  `latlai-ui` và adapter Claude; thêm `ui-ux-pro-max` từ nextlevelbuilder tại
  `d14efff8ed1f` và Taste v2 `design-taste-frontend` từ Leonxlnx tại `6010f91a9935`.
- Hai skill nằm trong repo, có scripts/data/references, LICENSE và lock commit/hash;
  adapter Claude dùng nguồn chung. Chỉ thích nghi metadata/preamble, helper path
  UI/UX Pro Max và whitespace đã ghi; không cài các biến thể Taste khác.
- [UI workflow](../design/UI_SKILLS.md) giữ ưu tiên brief/brand/API/session/motion
  owner11/10, chọn đúng client; cập nhật AGENTS/AI_WORKFLOW/tiếp nhận và bỏ liên
  kết skill cũ. Impeccable chỉ đổi binding preamble/metadata/lock, giữ body/engine.
- Owner xác nhận từ nay UI web kết hợp Pro Max + Taste + Impeccable; đã ghi vào
  AGENTS/workflow, chọn reference/helper theo phạm vi thay vì mở rộng gói UI.
- Kiểm helper UX/React search và Taste draw offline đạt; docs check5cặp adapter,
  validator skill, verify vendor/hash và diff whitespace được kiểm trước bàn giao.
  Không đổi UI/API/DB/app mobile hoặc READINESS; không chạy lại native/browser/E2E.
  Chưa commit/push/PR/merge; bộ skill mới cần được host nạp từ lượt tiếp theo.

## Sửa User Web CI của PR62 — 23/10/2026

- Owner yêu cầu sửa/push lại [PR62](https://github.com/huangg49/used-book-marketplace/pull/62),
  nhánh `codex/inline-card-location`, base sửa `61c300e`. Log job119974383142
  dừng ở seller-order vì tìm heading cũ sau khi chuyển đơn sang workspace chat.
- Cập nhật seller-order/BuyNow theo region Chi tiết đơn hàng, heading/trạng thái/
  thanh toán hiện hành. ID đơn lấy từ receipt; kiểm đúng room/participants, một
  room OrderCreated không terms/quote cho BuyNow. Giữ ca mất ACK cùng key/body,
  thiếu tiền, hold/ledger, thông báo và shipment; không đổi source nghiệp vụ.
- Wallet kiểm banner với số dư API xác nhận0→50.000→90.000 và hai nút thao tác;
  giữ callback không session không lộ dữ liệu. Thêm fixture Order Chat hiện có
  vào CI và upload evidence khi lỗi; không bỏ check hay tăng timeout để né lỗi.
- PASS Node24.21.0/pnpm11.19.0: browser seller-order/BuyNow/exchange/wallet với
  Mongo QA riêng57217/database `_test`; Order Chat fixture không DB; web lint
  (6warning cũ), syntax/diff/docs check. Log `.tmp/ci-fix-*.log`; provider/storage/
  carrier mô phỏng, không phải giao dịch VNPay hay native thật. QA được dừng sau
  kiểm tra; DB/env và FE5174/API3000 của app giữ nguyên.
- Commit `fix(ci): align browser regressions with order chat and wallet`.
  Local PASS không thay remote CI; kiểm check của head mới trực tiếp trên PR62
  trước merge. READINESS/human review giữ nguyên; gói này chỉ sửa test/CI/handoff.

## Hợp nhất main và gỡ xung đột — 23/10/2026

- Theo owner, merge `origin/main` tại `60e1cf01` vào `codex/inline-card-location`
  từ `3f5b6eae`, giữ lịch sử đã push. Bốn conflict: public listing projection,
  user-web scripts, contract version và checkpoint; giữ cả hai phía.
- Giữ card464/504px, metadata một hàng, wallet/Order Chat và wishlist; đồng thời
  nhận lazy-photo/cache/expiry và tối ưu listing từ main. Projection đọc metadata,
  origin/zone theo lô trong cùng snapshot; không đọc contact, không bỏ current
  address-version check hoặc lọc Marketplace/Auction. Thêm7 unit regression.
- Contract hợp nhất0.50.0, regenerate types;177operation/26controller khớp. Đổi
  Order Chat ADR0042→[0045](../adr/0045-order-conversation-workspace.md), giữ0042
  auction của main. Giữ cả checkpoint teammate và READINESS mới từ main.
  Chuẩn hóa ba dòng trống EOF có sẵn ở source RN upstream, không đổi hành vi.
- PASS API lint/typecheck/183unit/build; web lint/typecheck/172unit/build;
  session-client27unit; RN typecheck/156unit, admin typecheck/30unit. RN chỉ tạo
  lại cache route `.expo/types` bị ignore bằng helper Expo cài sẵn. Browser cache
  ảnh, Order Chat và35ca card desktop/mobile130% đạt; fixture không ghi DB.
- HTTP/Mongo QA riêng57217/database `_test`: ba suite Orders/listing-review/
  auction-listings đạt136/137; một race100request chỉ có1/2lượt thành công kỳ vọng
  dưới contention, chạy riêng lại đạt (1PASS/54filtered), không sửa code/test.
  Hai suite listing/auction đạt trọn vẹn; log `.tmp/inline-merge-quota-rerun.log`.
  Container QA riêng được dừng sau kiểm tra, không dùng DB app cho harness.
- `pnpm db:migrate` áp dụng đúng ba migration main0032–0034 còn thiếu;45migration
  current, không đổi checksum cũ, reset/seed/bootstrap hay cấu hình. Khởi động lại
  launcher API/worker sau build; API readiness3000 và FE5174 trả200. Log local
  `.tmp/merge-main-runtime/`. Docs/diff check đạt; human/native/provider/remote CI
  chưa chạy. Không đổi gate ngoài READINESS đã có trên main; chưa merge vào main.
  Merge commit: `merge: resolve main conflicts for wallet chat and book cards`.

## Xuất bản gói ví, đơn hàng/chat và card — 23/10/2026

- Owner đã duyệt kết quả và yêu cầu chia commit/push. Tám commit chức năng từ
  `c52a7705` đến `a314f539` đã tách theo ví, Order/Chat, vùng/card và các bước
  tinh chỉnh card; đã push lên `origin/codex/inline-card-location` và đặt upstream.
  Base chung là `6d063ee5`; remote main đã tiến tới `60e1cf01` sau fetch, chưa
  tích hợp vào nhánh này. Chưa tạo PR/merge/deploy; quyền push không đổi gate review.
- Kiểm phạm vi file trước push: không có env/tmp/dump/khóa được track trong gói;
  working tree sạch, diff --check đạt. Checks chức năng giữ evidence ở các mốc
  bên dưới; không chạy lại source tests cho bước xuất bản không đổi code.
  Commit bàn giao này: `docs(handoff): record published member web changes`;
  docs:check/diff --check được chạy cho tài liệu. READINESS giữ nguyên.

## Tác giả và vị trí trên một hàng card — 22/10/2026

- Theo owner: bỏ nhãn “Khu vực” khỏi phần nhìn, giữ nhãn cho screen reader;
  tác giả và pin/địa điểm cùng một hàng, icon/chữ căn giữa trong vùng24px.
  Chữ dài tự co rồi ellipsis, có tooltip đầy đủ; preview vẫn ghi đúng là không
  có vị trí vật lý. Giữ card464/504px,4cột desktop, khung giá76px và CTA44px.
- Nhánh `codex/inline-card-location`, base `99f0020`; subject
  `style(web): align book author and location on one row`.
- PASS web lint/build (gồm TypeScript), browser fixture35ca: Search1440/1280/390/
  320 chữ130%, Home live/preview desktop/mobile, nhãn không hiện, icon/giá trị cùng
  tâm hàng, chữ một dòng, tooltip và chiều cao không đổi. Đã xem ảnh desktop/mobile;
  evidence `.tmp/inline-card-metadata-qa/`. Detector layout một lượt[];
  docs:check/diff --check đạt;6warning lint/chunk cũ. Chỉ markup/CSS/docs, không
  chạy lại unit/API/DB/native/provider/human/remote CI; READINESS giữ nguyên.
  FE5174/API3000 vẫn chạy. Chưa push/PR/merge/deploy.

## Card theo ảnh tham chiếu, chạy BE/FE — 22/10/2026

- Theo ảnh owner: card paper border1px/bo20px, ảnh thật đầy đủ trên nền archival
  desk có sẵn, chip mint và trái tim44px; tiêu đề toàn chiều ngang, tác giả/khu
  vực hai bên, ô giá riêng và nút wine48px. Giữ4cột desktop/1cột điện thoại,
  giá bán/đổi, trạng thái, retry ảnh và motion240ms kể cả reduced-motion.
- Trái tim dùng API wishlist Member có sẵn, guest đi login rồi về sách; preview
  không giả vị trí/nút lưu. Query phân trang theo owner; không báo lưu trước ACK,
  giữ PUT/DELETE khi mất ACK, hủy read cũ và kiểm owner trước cập nhật cache.
  Không đổi API/contract/persistence.
- Nhánh `codex/book-card-reference-style`, base `505e256`; subject
  `feat(web): match book cards to the reference design`.
- PASS web lint/typecheck/168unit/build, docs:check và diff --check; browser fixture46ca gồm desktop1440/1280,
  mobile390/320 chữ130%, Home/Search/preview, ảnh lỗi, guest, wishlist read lỗi,
  mất ACK save/remove, stale read và đổi owner/non-Member. Đã xem ảnh fixture và
  card live; live7bài/4cột, mobile không tràn, motion240ms, readiness200.
  Evidence `.tmp/book-card-reference-qa/`. Detector một lượt có3advisory14px
  radius được dùng theo ảnh và đã ghi DESIGN;6warning lint/chunk cũ.
- Chạy đủ lệnh owner: frozen install/setup/Mongo wait/bootstrap/migrate/seed,
  tất cả exit0; giữ env, mật khẩu/tài khoản và dữ liệu cũ. BE `pnpm dev:api`
  launcher9132 cùng API/media/order workers; FE `pnpm dev:user` launcher24608.
  http://localhost:5174 và API `/api/v1/health/ready` cổng3000 trả200; CORS đúng.
  Log/PID tại `.tmp/dev-card-startup/`. Không chạy API E2E/native/live provider/
  human/remote CI; READINESS giữ nguyên; chưa push/PR/merge/deploy.

## Card sách rõ thông tin và khu vực — 22/10/2026

- Owner chọn bìa ở trên; dưới chia hai phần bằng nhau: tên/tác giả trái,
  khu vực/giá phải. Card Home/Search có border riêng, tiêu đề xuống dòng đầy đủ,
  giữ giá bán/giá trị đổi, trạng thái, retry ảnh và link. Grid tối thiểu280px,
  một card mỗi hàng điện thoại; dùng chung `BookCard`/`HomeBookCard`.
- Contract0.47.0 thêm optional `fulfillment.locality {code,label}` từ vùng của
  origin hiện hành, giữ envelopeTP.HCM cũ. Không lộ contact/address references;
  origin thiếu/stale/deleted không bị đoán khu vực. Cập nhật ADR0015/0039,
  không migration/đổi dữ liệu. Preview ghi rõ vị trí không áp dụng.
- Nhánh `codex/book-card-details`, base `2e746a5`; subject
  `feat(catalog): show bordered book cards with real locations`.
- PASS Node24.21.0/pnpm11.19.0: API/web lint/typecheck/build, API150/web156unit,
  contract check/routes173;16 origin E2E trên Mongo QA `_test` (60 ca không liên
  quan bỏ qua), gồm cả3vùng, redaction và origin đổi/xóa. Browser fixture51ca riêng
  kiểm Home/Search, desktop và320/390px chữ130%, hai cột/border/tên dài/ảnh lỗi/
  links/hover/focus. Ảnh có nhãn mô phỏng ở `.tmp/book-card-details-qa/`.
- Detector một lượt có advisory màu/radius/background có sẵn ngoài phần đổi;
  API11/web6 warning lint/chunk cũ. Native/live storage/human/remote CI NOT RUN.
  QA57017 đã dừng, giữ app Mongo/cấu hình/dữ liệu; dev API nạp lại source mới.
  Readiness200; public read hiện7bài:4TP.HCM,3chưa có origin hợp lệ nên không đoán vùng.
  READINESS không đổi; chưa push/PR/merge/deploy.

## Xem đơn trong Chat — 22/10/2026

- Theo owner, **Đơn hàng của tôi → Xem đơn** mở workspace Chat: toàn bộ thông tin
  và thao tác Order ở trái, nhắn tin đúng đối tác ở phải. Mobile chuyển Đơn hàng/
  Hội thoại mà giữ nháp và ý định. `OrderDetails` dùng chung controller thanh toán,
  hủy và giao nhận; giữ snapshot riêng, lịch sử thương lượng và retry key/body/version.
- API/contract0.46.0 thêm `conversationId` trong Order read và lệnh mở hội thoại
  đúng Order. Giữ phòng Negotiated; BuyNow/Order lịch sử chưa có link tạo phòng
  OrderCreated riêng, không đổi tiền/sách/trạng thái. [ADR0045](../adr/0045-order-conversation-workspace.md),
  không cần migration mới; quyền participant/ACTIVE/session được kiểm trước replay.
- Nhánh `codex/order-chat-workspace`, base `c52a770`; subject
  `feat(orders): open order details in the chat workspace`.
- PASS Node24.21.0/pnpm11.19.0: API lint/typecheck/build/150unit;6 E2E mới trên
  Mongo QA `_test` (49 ca không liên quan bỏ qua), gồm từ chối/replay/race barrier;
  contract check/routes173operation; web lint/typecheck/build/156unit, browser
  order-chat mới và regression Chat cũ. Xem desktop/320/390px chữ130%; kiểm mất ACK
  mở phòng/pay/cancel, message dedupe, ảnh đóng gói/vận đơn, cache403 và nháp.
- Browser dùng API/Socket.IO fixture riêng; API E2E dùng Mongo thật/storage fake.
  Ảnh có nhãn mô phỏng tại `.tmp/order-chat-workspace-qa/`; detector một lượt[];
  API11/web6 warning lint và cảnh báo chunk cũ. Review AI đã sửa nguy cơ mất intent
  khi đổi trang; không thay human review/native/live provider/remote CI.
- Dev API/worker đã khởi động lại từ launcher hiện có do watcher không còn listener;
  readiness200, web5174 HMR. Giữ cấu hình/DB app; không migrate/reset/seed.
  READINESS giữ nguyên; chưa push/PR/merge/deploy.

## Khung số dư và thao tác ví — 22/10/2026

- Member web `/wallet`: gom tiêu đề, số dư khả dụng từ API và hai nút Nạp/Rút
  vào khung wine–cream bo12px, dùng lại minh họa của phần Tổng quan theo ảnh owner.
  Giữ popup `PurchaseDialog`, lịch sử và logic VNPay; rút vẫn chỉ là preview.
- Nhánh `codex/wallet-balance-banner`, base `6d063ee`; subject
  `style(web): group wallet balance and actions in branded banner`.
- PASS Node24.21.0/pnpm11.19.0: web lint/typecheck/156unit/build; Chromium fixture
  1366/900/768/390/320px, chữ130%, số dư0/tối đa, loading/lỗi/retry/cache/403,
  focus/Escape, hai popup và giữ số tiền. Đã xem desktop/mobile; ảnh và kết quả
  local tại `.tmp/wallet-balance-banner-qa/`, có nhãn dữ liệu mô phỏng.
- Sáu warning lint và cảnh báo chunk cũ; detector một lượt chỉ advisory font1.2rem có sẵn.
  Browser mock toàn bộ API, không gửi command ví/đụng DB. Không chạy lại API/Mongo,
  native/live VNPay/human/remote CI; READINESS giữ nguyên. Chưa push/PR/merge/deploy.

## Tích hợp tối ưu listing và hỗ trợ demo — 22/10/2026

- Chủ dự án yêu cầu push và merge 4 commit local; nhánh
  `codex/listing-media-backend-performance`, đồng bộ `origin/main` tại `a67cb0b`.
  [PR #61](https://github.com/huangg49/used-book-marketplace/pull/61).
- Gói gồm: tùy chọn bỏ limiter login chỉ trong development (mặc định tắt), tên
  người đăng cạnh tên sách trên web/RN, cache ảnh theo hạn gốc + lazy viewport
  phía client, batch ký ảnh/bounded RAM cache + bulk metadata query phía API.
  Giữ kiểm tra eligibility trước/sau URL, fresh Detail và snapshot/cursor.
  Không đổi contract, schema/migration hoặc DB demo; không commit cấu hình riêng.
- Bằng chứng đo trước/sau, phạm vi cache và giới hạn cold load ở
  [bước 1](LISTING_LOAD_PERFORMANCE_2026_10_20.md),
  [bước 2](LISTING_MEDIA_BACKEND_PERFORMANCE_2026_10_20.md).
  Tra tài khoản theo [người đăng](DEMO_ACCOUNTS.md).
- Sau đồng bộ main, sửa lint của chat/đổi sách RN bằng AppModal/AppTextInput và
  token màu có sẵn; fixture VNPay bổ sung expiresAt/serverTime đúng contract.
  Không thay endpoint/hành vi giao dịch của PR #60.
- CI Mongo lỗi từ runner Ubuntu mới: MongoDB 8.0 từ chối kernel >=6.19
  ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Runner 24.04 mới
  cũng gặp lỗi, nên ghim 4 job Mongo về ubuntu-22.04 (kernel 6.8); thêm log khi lỗi.
  Không sửa image/DB local; cần nâng lại runner trước khi 22.04 hết hỗ trợ.
  User Web CI chạy thêm browser regression cache ảnh.
- Navbar có layer transform ổn định để viền không đổi rasterization khi WebGL
  rèm bị ẩn/gỡ; giữ nguyên tiêu chí pixel <=1, thời lượng và cleanup motion.
- Importer PG xử lý đúng cặp reference locality F2h → ADR0039, giữ DEMO-C native;
  mọi drift khác vẫn từ chối, không ghi nguồn PG. PASS 5 ca import trên PG/Mongo
  QA riêng, gồm ledger/ảnh/lịch sử và từ chối drift nguồn/đích.
- Web/RN từ chối URL đã hết hạn ngay khi nhận để có retry thay vì loading mãi.
  Browser fixture chờ đúng h1/URL Detail và phản hồi ảnh trước khi nhảy đồng hồ;
  vẫn kiểm request bị 404 và không hiện lại ảnh cũ.
- Đồng bộ browser journeys với detail/editor và chat thống nhất trên main: cuộn
  đến ảnh lazy, picker ảnh bìa, nhãn khai báo/khu vực, điều hướng qua tab tài khoản.
  Giữ kiểm replay/lost-response và kiểm eligibility. Login quay lại chat của chính
  chủ bài trả về Detail, không gửi yêu cầu tự chat. Header RN giữ vùng bấm 48 px,
  accordion tình trạng công bố trạng thái mở/đóng cho công cụ hỗ trợ.
- CI full E2E phát hiện fixture đấu giá ngoài vùng chưa phục hồi; đã thêm finally.
  Kiểm packaging chấp nhận lịch sử hợp lệ ở Inspection/Completed, vẫn kiểm đủ
  receipt/audit/outbox và chặn intent mới. PASS local 30 carrier + 41 wallet E2E,
  có kiểm ảnh lịch sử sau nhận sách/quyết toán và từ chối intent sau đó.
- DraftCoverPhoto nhận trạng thái xử lý từ editor, chỉ ký khi Ready và đang xem;
  trả lại trạng thái ảnh và nút retry khi lỗi read/tải ảnh/hết hạn. Không thay picker
  hay upload contract; browser vẫn kiểm lỗi ảnh, retry và chọn ảnh bằng filechooser.
  PASS thêm 62 auction E2E trên DB QA riêng; fixture ngoài vùng đã phục hồi.
- PASS local trên Node 24.19.0/pnpm 11.19.0: API typecheck/lint/build/176 unit;
  web typecheck/lint/build/160 unit; shared session 27 unit; RN typecheck/lint/
  156 unit và Expo web export (CLI báo force-exit sau export thành công).
  Contract/routes 176 operation/26 controller và docs check PASS.
- PASS 188 E2E gồm auth/listing-review/media/packaging/auctions trên QA57017,
  database riêng `latlai_integration_publish_test`, không đụng DB/bucket demo.
  Các 500 fault-injection trong log là ca kiểm rollback, không phải suite fail.
- Browser PASS: cache ảnh tại 1440/390 px (Detail/Back không ký lại, expiry/denial/
  retry, Detail vẫn cập nhật trạng thái); auction stage giữ pixel/geometry navbar,
  mobile/resize/Back/fallback/cleanup. Đã xem ảnh. Artifact mới giữ trong
  `.tmp/integration-publish-20261022/`, không ghi đè evidence đã commit.
- Full User Web browser PASS: Home/Search/Detail responsive, login return/owner,
  đăng sách/chỉnh sửa, ảnh, stale address và replay; lost-response chat chỉ tạo
  một hội thoại. RN public/address/listing browser PASS: cuộn đến thông báo nằm
  ngoài viewport trước khi kiểm visible; chờ HTTP trả đúng version địa chỉ và
  flush layout sau khi tiến đồng hồ mô phỏng. Giữ toàn bộ ca dữ liệu lỗi/replay.
  Remote final-head và trạng thái tích hợp theo PR #61.
- Seller-order và Buy-now browser PASS: hai bên, quote/address, thiếu tiền bị từ
  chối, lost ACK tạo/thanh toán cùng key/body, đúng một hold; ảnh đóng gói, gửi và
  pickup mô phỏng InTransit. Exchange browser đi qua chat thống nhất (seller duyệt
  hình thức, buyer chọn sách/địa chỉ), lost ACK giữ key/body, inbox mở lại đúng một
  phiếu, accept/cancel, từ chối funding và 403 ẩn phiếu; desktop/mobile PASS.
- Wallet browser PASS: lịch sử thật/filter/pagination/retry, QueryDR lỗi/thử lại/
  credit, lost ACK cùng key/body, hạn server đúng 5 phút, hủy và replay hết hạn
  không thêm ledger/history. Chờ checkout release và các query/invalidation sau
  credit xong trước fixture trang nhỏ (networkidle cũ không đủ); thêm chẩn đoán
  số hàng/cursor khi lỗi. Provider và deadline QA mô phỏng,
  không là chứng nhận thanh toán VNPay thật.
- Đã push; kết quả CI và trạng thái tích hợp theo PR #61. Human review độc lập và
  native Android/iOS acceptance NOT RUN; yêu cầu merge của chủ dự án không là
  chứng nhận những gate này. READINESS giữ nguyên, không mở gói tối ưu bước 3.

## Hoàn thiện Trao đổi sách (Exchange): hiển thị sách khi cọc, ảnh bìa trực quan & hủy đơn hoàn cọc (FR-X11) — 20/10/2026

- Nhánh `feat/rn-exchange-fix-and-deposit-cancellation`, base `feat/rn-chat-inbox-and-order-flow` (đã merge `origin/main` mới nhất).
- Phạm vi hoàn thành:
  1. Fix lỗi 404 & hiển thị `@Người đề nghị` khi sách chuyển sang trạng thái chờ cọc (`AcceptedAwaitingFunding`):
     - Trong `public-listing.service.ts`: bổ sung lookup sang collection `exchanges` để cho phép các sách ở trạng thái `Reserved` thuộc tiến trình trao đổi vẫn được truy vấn công khai (tên sách, ảnh bìa, tác giả, giá trị cọc đối soát).
  2. Sửa nhãn hiển thị tiêu đề và đối tác trong `ExchangeProposalCard`:
     - Khung 1 luôn là `SÁCH CỦA BẠN GỬI ĐI`, khung 2 luôn là `SÁCH BẠN NHẬN VỀ (TỪ @<Tên đối tác>)`.
     - Kích hoạt hiển thị ảnh bìa thực tế (`active={true}`) trong cả `ExchangeProposalCard` và `ExchangeComposeScreen`.
  3. Bổ sung tính năng Hủy giao dịch trao đổi & hoàn cọc 100% (FR-X11 trong SRS 1.1):
     - Thêm nút và popup xác nhận `Hủy giao dịch trao đổi` vào giai đoạn `AcceptedAwaitingFunding` trong `exchange-actions-card.tsx`.
     - Cho phép người dùng chủ động rút lui trước khi gửi sách: hoàn trả 100% tiền cọc về ví ngay tức thì và mở lại trạng thái `Available` trên kệ sách cho cả 2 bên.
  4. Đồng bộ nhánh chính `origin/main`:
     - Tích hợp 4 migration MongoDB mới (`0032-vnpay-topup-expiry`, `0032-auction-only-listings`, `0033-buy-now-challenge`, `0034-auction-delivery`).
     - Áp dụng migration vào replica set MongoDB local thành công.
     - Cập nhật hợp đồng `TopupIntent` (thêm `Cancelled`, `expiresAt`, `serverTime`) và `PublicAuctionSummary` trong mobile app.
- Kiểm tra xác thực:
  - API Backend: `pnpm --filter @used-books/api typecheck` ➔ PASS (0 lỗi).
  - Mobile React Native: `pnpm --filter @used-books/mobile-react-native typecheck` ➔ PASS (0 lỗi).
  - Health check: `GET http://localhost:3000/api/v1/health` ➔ `{"status":"ok","service":"used-book-api"}`.
- Git: Đã push nhánh lên remote `origin/feat/rn-exchange-fix-and-deposit-cancellation`.

## Giao sách thắng đấu giá từ điểm (ADR 0044) — 20/10/2026

- Chủ dự án mở riêng gate READINESS cho gói này (READINESS ghi ngoại lệ). Người thắng
  chọn khi thanh toán: tự nhận hoặc `CarrierOutbound` tới địa chỉ đã lưu vùng
  `HCM-DEMO-v1`; phí = phí DirectSale đang chọn (30.000đ), báo trước qua
  `GET /me/point-orders/{id}/delivery-quote`, kiểm lại bằng `expectedOutboundFee`.
  buyerTotal = giá + phí, giữ trong một lần thanh toán; chọn xong không đổi.
- Sau khi chấp nhận biên bản: Staff được phân công `POST /operations/point-orders/{id}/dispatch`
  trong giờ và trong hạn → `InTransit` (mã vận đơn, hạn giao 240 giờ, handover
  `CarrierOutbound` không mã). TEST_OPERATOR độc lập gửi
  `POST /operations/simulator/point-delivery-events` (key = eventId): Delivered mở 72 giờ
  kiểm tra rồi quyết toán như cũ (người bán P − C, nền tảng C + phí); Failed/quá hạn
  giao → `DeliveryFailed`, Admin chỉ được RequireReturn, Staff nhận lại → hoàn đủ giá +
  phí. Quá hạn giao cho hãng = `CollectionOverdue`, hoàn tiền chỉ `NoFault`.
- Migration `0034-auction-delivery` (point_orders/handovers/resolutions + collection
  `point_order_deliveries`, `point_carrier_events`); OpenAPI 0.48.0. RN và web chọn
  cách nhận + báo phí, hiện trạng thái giao/mã vận đơn; admin có nút “Giao cho hãng”
  và lý do DeliveryFailed. Chưa có màn TEST_OPERATOR gửi sự kiện giao (dùng API).
- Nhánh `feature/auction-delivery` (base `feature/buy-now-challenge`). PASS: contract,
  API tsc/unit 151 (1 lỗi mạng sẵn có: test GHN gọi API thật), E2E `auctions` 61 (thêm 5
  ca: báo phí/chọn sai, giao + quyết toán, giao lỗi trả về, quá hạn, race Delivered/Failed),
  `wallet-migration` + `auction-listings` 5, Mongo schema 25 (cả nâng cấp), RN
  tsc/lint/test, web tsc/oxlint/156, admin tsc/oxlint/28. Browser fixture 3009: web hiện
  lựa chọn giao, địa chỉ, phí 30.000đ, tổng 630.000đ. RN/native/human/remote CI NOT RUN.
  Chưa push/PR/merge. QA replica set phải bật lại sau khi Docker khởi động lại
  (`pnpm infra:mongo:test:up`).
- Màn mô phỏng hãng vận chuyển (nhánh `feature/auction-delivery-simulator`, base
  `feature/auction-delivery`): `GET /operations/simulator/point-deliveries` (TEST_OPERATOR,
  đơn InTransit, không có địa chỉ/SĐT; OpenAPI 0.49.0) và admin-web `/simulator/deliveries`
  báo Delivered/Failed, eventId = Idempotency-Key giữ nguyên khi thử lại. Admin-web cho
  tài khoản chỉ có TEST_OPERATOR vào khu làm việc, chỉ thấy mục Mô phỏng. PASS: API tsc,
  E2E ADR 0044 6 ca, admin tsc/oxlint/30. Browser fixture: operator đăng nhập, thấy
  danh sách rỗng; staff/bidder bị 403. Gửi sự kiện từ màn hình trên dữ liệu thật NOT RUN
  vì điểm đóng cửa (05:47) nên chưa giao được đơn cho hãng.
## Hoàn thiện luồng Chat thương lượng, Hộp thư tin nhắn và Đơn hàng trên React Native — 20/10/2026

- Nhánh `feat/rn-chat-inbox-and-order-flow`, base `c23cfd3`.
- Theo yêu cầu chủ dự án, hoàn thiện toàn bộ luồng thương lượng mua bán & trò chuyện trên Mobile React Native đồng bộ với bản Web:
  1. Hộp thư trò chuyện kiểu Shopee (`ChatInboxScreen` - route `/chat-inbox`):
     - Danh sách các cuộc trò chuyện thương lượng với thumbnail bìa sách thật, tên sách, giá niêm yết, vai trò và timestamp.
     - Thanh tab lọc nhanh chuẩn Shopee: `[Tất cả]`, `[Cần phản hồi]` (badge đếm số), `[Đang thương lượng]`, `[Đã tạo đơn]`.
     - Tìm kiếm đối tác theo tên, đệm an toàn Safe Area cho notch/Dynamic Island, thanh điều hướng đáy `MemberNavigation` chuẩn nền trắng sáng `colorRoles.navigationBackground`.
     - Icon tin nhắn trên Header trang chủ (`HomeHeader`), Tìm kiếm, Đấu giá, Tài khoản và `TopNavbar` tự động trỏ về `/chat-inbox` và hiển thị badge động.
  2. Khung chat thương lượng chia 2 Panel (`ConversationScreen` - route `/conversation?id=...`):
     - `AgreementSheetPanel` (Phiếu thỏa thuận): xem thông tin sách, chọn Mua hoặc Đổi, gửi/chấp nhận/từ chối đề xuất giá, nhập địa chỉ nhận báo giá vận chuyển GHN/Direct tức thì, người bán tạo đơn hàng, người mua thanh toán đơn hàng bằng Ví.
     - `ChatMessagesPanel` (Hội thoại): timeline sự kiện thỏa thuận, bong bóng tin nhắn, realtime WebSocket `/purchase-chat` + Polling 3.5s.
     - Đầy đủ Header `TopNavbar` đỏ rượu vang, Subheader nút Quay lại và Bottom Navbar `MemberNavigation` nền trắng.
  3. Hoàn thiện luồng Đơn hàng & Ví:
     - Khung trạng thái người bán đang chuẩn bị sách (`amberBg` / `amberBorder`) hiển thị trực quan cả ảnh bìa sách và tiến độ.
     - Modal nạp tiền Ví (`topup-modal.tsx`) kết nối nạp tiền test và VNPay.
     - Xóa bỏ các modal mock cũ (`HomeCartModal`).
- Đồng bộ quyền MongoDB: Chạy `mongo:bootstrap` cập nhật quyền Least-Privilege cho role `latlai_app` trên các collection mới `conversation_terms`, `conversation_events`.
- Kiểm tra xác thực:
  - Mobile React Native: `tsc --noEmit` ➔ PASS (0 lỗi).
  - Linter: `expo lint` ➔ PASS (0 lỗi).
  - Vitest: 24 test suites / 157 tests ➔ PASS 100%.

## Mua ngay mở cửa sổ 60 giây (ADR 0043) — 19/10/2026

- Chủ dự án yêu cầu: bấm Mua ngay không kết thúc phiên ngay mà rút thời gian còn 60
  giây để người khác trả cao hơn. ADR 0043 + sửa DEC-06/FR-AU06/POL-40 (phụ lục).
  Mua ngay = lượt trả giá Manual cam kết tại `buyNowPrice` (bid kind `BuyNow`), vẫn
  chỉ trước lượt đầu tiên, cùng khóa phiên; `endAt = min(endAt, buyNowAt + 60 s)`,
  bid sau không gia hạn. Hết giờ đóng phiên bình thường (người dẫn thắng, Order +
  24 giờ thanh toán). Phiên `BuyNowPending` cũ giữ Order 15 phút.
- Migration `0033-buy-now-challenge` thêm `auctions.buyNowAt` (backfill null) và
  đổi expr endAt cố định; OpenAPI 0.47.0 `PublicAuctionSummary.buyNowAt`. RN/web
  đổi lời hộp xác nhận/biên nhận và hiện thông báo đếm ngược khi có `buyNowAt`.
- Nhánh `feature/buy-now-challenge` (base `feature/auction-only-listings`, đã gộp `origin/main` 6d063ee).
  PASS: contract check, API tsc, E2E `auctions` + `auction-listings` 60 (cửa sổ,
  replay, vượt giá trong cửa sổ, bid trễ bị từ chối theo giờ server, gần hết giờ giữ
  end, race bid đầu/Mua ngay và Auto/Mua ngay, thông báo), RN tsc/lint/auctions 10,
  web tsc/141. Mongo suite: chỉ 4 ca nâng cấp lỗi sẵn trên main (ExchangeDisputed).
  Hành trình tạm (không commit) trên `_test`: cửa sổ 60 giây thật, đối thủ vượt giá,
  đóng phiên, thanh toán, nhận sách, quyết toán (người bán nhận P − 5%), không trả
  tiền (vi phạm + ReclaimRequired), không có lượt (Unsold) — đều đúng. Browser QA
  fixture 3009: web và RN (Expo web) hiện đếm ngược cửa sổ, cập nhật trực tiếp khi bị
  vượt, màn thắng/thanh toán sau đóng; RN sau đóng ghi “Giá chốt” như web.
  Order-worker chạy thêm `AuctionWorker.closeDue` mỗi 5 giây giữa các lượt quét 60
  giây; chạy thật `dist/order-worker.js` trên fixture `_test`: phiên Mua ngay đóng
  3,2 giây sau endAt (trước đây tới ~60 giây). Native/human/remote CI NOT RUN.
  READINESS không đổi. Chưa push/PR/merge.

## Sách đấu giá là listing riêng (ADR 0042) — 19/10/2026

- Chủ dự án yêu cầu: tạo đấu giá không lấy listing của sàn mua/đổi mà dùng listing
  riêng. ADR 0042 + sửa DEC-07/FR-AU01 (phụ lục) và FR-C05/BR-02 (SRS). Listing có
  `channel` bất biến `Marketplace|Auction` (OpenAPI 0.45.0); migration
  `0032-auction-only-listings` backfill Marketplace, import PostgreSQL gán Marketplace.
- API: draft/save/submit/revise Auction chỉ mode Sale (salePrice = giá trị khai báo
  = giá trị bảo vệ), không origin. `publicEligibleStages()` mặc định loại Auction
  (kệ/tìm/chi tiết/ảnh/quote/Mua ngay/đơn chọn); purchase/exchange/wishlist/
  price-assist kiểm lại channel; intake chỉ nhận Auction (Marketplace → 409).
  Intake cũ trên listing sàn giữ nguyên. Giới hạn 5 bài ADR 0040 đếm chung kênh.
- RN: send-to-auction chỉ liệt kê listing Auction, tạo/mở tiếp bản nháp trong
  DraftEditor chế độ đấu giá; Tủ sách/Tài khoản lọc Marketplace. Web: `/sell?channel=Auction`,
  `/auctions/new` chỉ dùng listing Auction; kệ/đổi/dashboard lọc Marketplace.
  Admin review hiện nhãn “Sách đấu giá”. Flutter chưa đổi (scaffold).
- Nhánh `feature/auction-only-listings` (base main 8741a6f). PASS: contract check,
  API typecheck/unit150, E2E `auction-listings` 4 + `auctions` 54 (thêm ca từ chối
  listing sàn; mutation check guard/predicate), RN tsc/lint/67, web tsc/141,
  admin tsc/28. Mongo suite: 4 ca nâng cấp migration lỗi cả trên main sạch
  (`member_notifications` ExchangeDisputed), không do 0032. Browser QA trên API
  fixture 3009 + DB `_test`: web tạo/giữ chỗ đấu giá từ listing Auction; RN tạo/lưu
  bản nháp Auction, Tủ sách không lẫn. DB local chủ dự án đã `db:migrate` 18 migration
  còn thiếu từ main + 0032, rồi `db:bootstrap` (không reset/seed). Native/human/remote CI NOT RUN. READINESS không đổi.
- Riêng: nhánh `fix/rn-auction-fake-data` (8111c17) bỏ dữ liệu bịa ở màn Đấu giá RN;
  màn Tài khoản RN còn dữ liệu mẫu (★4.9, đơn #DH-8821). Chưa push/PR/merge.

## Hết hạn nạp VNPay sau 5 phút — 19/10/2026

- Nhánh `codex/topup-five-minute-expiry`, đã push lên `origin`; ba commit
  `a27cfdc6`, `4f316bd8`, `71aef464`.
- API/Mongo thêm thời hạn 5 phút, worker xử lý hết hạn, migration và contract;
  user-web hiển thị countdown; ADR và tài liệu checkout đã cập nhật.
- PASS: `pnpm contract:check`, `pnpm contract:routes`, API lint/typecheck,
  user-web lint/typecheck/145 unit tests/build, `pnpm docs:check`, `git diff --check`.
  Có warning lint/chunk có sẵn; lệnh test đầu tiên dùng option Vitest không hợp lệ,
  đã chạy lại đúng và PASS.
- Chưa chạy QA Mongo riêng, native/live VNPay, human review hoặc remote CI.
  READINESS giữ nguyên; PR chưa tạo.

## Popup nạp và rút tiền — 19/10/2026

- Member web `/wallet` theo yêu cầu chủ dự án: bỏ khối số dư, dòng giới thiệu,
  link quay lại và thanh điều hướng cũ; giữ tiêu đề và danh sách lịch sử giao dịch.
  Hai nút **Nạp tiền / Rút tiền** mở popup bằng `PurchaseDialog` hiện có.
- Nạp giữ luồng VNPay sandbox đang hoạt động, hiện hạn mức5.000–10.000.000đ;
  form và yêu cầu nạp gần đây nằm trong popup. Tự đóng khi chuẩn bị thanh toán
  thành công; giữ số tiền/key/body ở màn cha qua đóng/mở popup và retry mất ACK.
- Rút chỉ là UI, ghi tối thiểu50.000đ theo SRS POL-15; khóa **Gửi yêu cầu rút**,
  không tạo command hoặc báo thành công. Không đổi API/contract/RN/session.
- Nhánh `codex/wallet-action-popups`, base781c69e; subject
  `feat(web): open wallet topup and withdrawal dialogs`.
- PASS Node24.21.0/pnpm11.19.0: web lint/typecheck/141unit/build; Chromium
  popup/Esc/Tab/focus/scroll lock, giữ số tiền khi đóng/mở, rút không tạo command,
  nạp/Return giả/QueryDR lỗi và retry/mất ACK giữ key+body. Dialog320/390px ở130%
  không overflow; giữ regression lịch sử/lọc/phân trang/retry và điều hướng ví.
  API/Mongo QA riêng, storage fake/VNPay navigation và QueryDR mô phỏng.
- 6 warning lint/chunk có sẵn; detector một lượt có advisory font1.2rem cũ.
  Chưa kiểm native/live VNPay/human/remote CI. READINESS giữ nguyên;
  chưa push/PR/merge/deploy. Ảnh QA local: `.tmp/wallet-checkout-browser/`.

## Push và kiểm tra PR51 —19/10/2026

- Theo yêu cầu chủ dự án, push `codex/chat-open-book` và tạo
  [PR51](https://github.com/huangg49/used-book-marketplace/pull/51) vào `main`.
  Main `8741a6f` là ancestor, không có conflict. Gói gồm hội thoại/phiếu thỏa
  thuận API + web, migration0032, inbox/nền/hover/chuyển cảnh; không chỉ motion.
- Sau head `20995f4`, subject sửa kiểm tra
  `test(api): isolate exchange and migration upgrade fixtures`: mỗi ca exchange
  tạo hai Member riêng để không tích bài chạm hạn mức5 hoặc dùng chung ví;
  snapshot nhánh migration cũ dừng trước union0027 để migration mới được áp
  sau lịch sử, không bị ghi đè validator. Trừ3 collection Chat Mongo-native
  khỏi số45 model PostgreSQL. Không sửa migration đã áp dụng hoặc nới nghiệp vụ.
- PASS local API150unit/21file;120 E2E của agreements/orders/exchanges/
  wallet-checkout trên QA `_test` (93 ca qua lần đầu,27 exchange qua sau sửa);
  Mongo48 ca schema/transaction/ledger/keyset (23 ca qua lần đầu,25 schema
  qua sau sửa), lint/typecheck, contract172operation/26controller.
  API/web build và web152unit/browser có evidence source ở các mục dưới;
  sửa cuối chỉ test + điểm lưu. API11 warning lint cũ, web6 warning/chunk cũ.
  Không chạy import PostgreSQL/failover/native/live provider trong lượt này.
- Remote8 job bị GitHub từ chối khởi chạy do billing/spending limit; không phải
  CI PASS. PR chưa có review độc lập. Theo TEAMWORK, CI/review còn chặn merge;
  chưa merge vào main, chưa có ngoại lệ cho PR51. READINESS giữ nguyên.
  DB app và `.env` không bị thay đổi; chỉ dùng Mongo QA port57017 để kiểm tra.

## Mở thẻ thành giao diện Chat —19/10/2026

- Nhánh `codex/chat-open-book`, base `3527034`, subject
  `feat(web): expand conversation cards into chat workspaces`.
  Dùng View Transitions của React Router7 đang có: khung420ms mở/340ms thu,
  bìa/tên là snapshot riêng; chữ giữ kích thước thay vì kéo giãn theo khung.
  Header tạm giữ hình dạng trong lúc chuyển cảnh; nền/navbar không nằm trong
  root snapshot. Chỉ thẻ được chọn có tên chuyển cảnh; mobile chỉ có1 identity.
- Inbox nhớ filter/số mục đã mở/scroll/selected trong bộ nhớ của layout theo owner;
  đổi user tạo bộ nhớ mới, không dùng browser storage. Back link dùng history khi
  vào từ inbox, đường trực tiếp vẫn về `/chat`; browser Back chạy chiều thu.
  Quản lý scroll manual trong phạm vi Chat và trả setting cũ khi rời phạm vi.
- Hover/focus chỉ prefetch GET room vào query key theo owner. Nếu chưa có kết quả
  thật, mở cùng khung chờ có bìa/tên từ cache listing, chưa mount handler giao dịch.
  Lỗi có retry; dữ liệu đã tải vẫn giữ. Exchange cũ dùng chuyển khung và cache
  detail theo owner, không gộp lịch sử hoặc thay nghiệp vụ.
- PASS web build/152unit/lint (6 warning cũ), browser fixture toàn luồng tại
  `.tmp/chat-morph-verified-flow-qa`, thêm assertions snapshot thực vào suite.
  QA `.tmp/chat-morph-qa` kiểm3 snapshot ghép đúng,420/340ms, filter/load more/
  scroll/browser Back, mạng chậm không có composer,320px chữ130% + reduced-motion
  giữ animation/không trùng snapshot, fallback khi API browser không có.
  Đã xem midpoint/desktop/mobile,1 batch chỉnh và xác nhận navbar đứng yên.
  Chunk warning cũ; API/native/Safari thiết bị thật/live storage/remote CI NOT RUN.
  READINESS không đổi; local web5174, chưa push/PR.

## Thu gọn và sắp lại thẻ danh sách Chat —19/10/2026

- Nhánh `codex/chat-open-book`, base `4c49df3`, subject
  `style(web): refine compact conversation cards`.
  Cụm đầu thẻ có bìa64px/ảnh tối đa96px cạnh tên16px/người trao đổi/hình thức.
  Bỏ dải màu chạy suốt bìa; footer có một đường phân tách, trạng thái trái/nút mở
  phải, target44px. Dưới360px bìa48px để chữ chảy xuống dưới. Padding16px.
  Grid auto-fill tối thiểu340px:3 cột ở1440,2 ở1100/900,1 ở390/320; một thẻ vẫn
  giữ cùng bề rộng khi ít hội thoại. Rút khoảng cách tiêu đề/filter; không cắt tên,
  bỏ hai câu hướng dẫn lặp (tiếp tục xem phiếu/xem đơn và nhắn tin), giữ pending
  proposal và giá thống nhất khi có. Lọc/load more/API/đường vào room không đổi.
- PASS scoped browser fixture14 room + Exchange cũ tại `.tmp/chat-inbox-card-redesign-qa`:
  6 thẻ thường vừa viewport1440×900, link44px, filter/load more, ảnh thiếu/tên dài,
  mobile320 chữ130% không tràn, mở đúng room. Đã xem desktop/mobile.
  Build/lint/full Chat browser tại `.tmp/chat-inbox-card-redesign-flow-qa` PASS;
  detector[];6 warning lint/chunk cũ giữ. Đã xác nhận mobile sau batch chỉnh.
  Không chạy lại backend/native/live storage/remote CI;
  READINESS giữ nguyên. Local web5174 HMR, chưa push/PR.
  Follow-up từ `d098134`, subject `style(web): lift and tint conversation cards on hover`:
  thẻ purchase/Exchange cũ nhấc4px, đổi kem ấm và bóng mềm trong200ms khi hover
  bằng chuột hoặc focus-visible bàn phím. Touch không áp hover; duration override
  giữ motion theo chính sách chủ dự án. Build và Chromium fixture normal/reduced
  preference, mouse leave, sibling không xê dịch, keyboard/touch PASS tại
  `.tmp/chat-card-hover-qa`; đã xem desktop/mobile. Chỉ CSS; không chạy lại gate API.

## Nền mùa thu3D cho Chat —19/10/2026

- Nhánh `codex/chat-open-book`, base `d684bd6`, subject
  `style(web): reuse approved autumn posting background for chat`.
  Theo chủ dự án, khôi phục nguyên ảnh `autumn-book-desk.webp` từ `6394dc4`
  (18/10,77KB) cho inbox và room Chat. Không tạo lại ảnh/không đổi nền Sell.
  MainLayout gắn nền fixed chỉ trên route Chat, tháo khi rời route; phiếu/chat/
  inbox giữ bề mặt giấy đặc, mobile có khoảng nền12px hai bên.
  Chủ dự án đã xem bản gen thay thế rồi chọn giữ nền đang chạy trên web;
  ảnh thử không được đưa vào code.
- PASS web build (chunk warning cũ), toàn bộ Chat browser fixture1440/1100/
  900/390/320 chữ130% tại `.tmp/chat-autumn-bg-qa`; đã xem inbox desktop/mobile
  và room desktop. Scope QA `.tmp/chat-background-scope-qa` kiểm đúng77026byte
  ảnh gốc, cuộn vẫn fixed/cover, không tràn ngang và rời Home gỡ nền.
  API/DB/session/handlers không đổi; không chạy lại gate backend/native/live
  storage/remote CI. READINESS giữ nguyên, chưa push/PR; web5174 HMR để owner xem.

## Đồng bộ GitHub về máy — 19/10/2026

- Theo chủ dự án, fetch và merge `origin/main` tại `8741a6f` (PR50) vào
  `codex/chat-open-book`, giữ16 commit Chat local từ `ff725a6`. Subject
  `Merge origin/main into codex/chat-open-book`. Giữ cả hai phần SESSION_STATE
  khi giải conflict; ADR Chat đổi0040→0041 để không trùng ADR phí/hạn mức trên main.
- Main mới gồm lịch sử ví/điều hướng, đăng bài miễn phí với5 chỗ hiển thị/chờ duyệt,
  picker bìa/phụ, gallery bản nháp/sticky và pin body khi retry địa chỉ.
- PASS API/web build, web152unit, VNPay16unit, contract generated check,
 172route/26controller, docs399file/2645link và Chat browser fixture tại
  `.tmp/chat-main-sync-qa`. Không chạy lại toàn bộ E2E Mongo/native/live provider/
  remote CI; gate READINESS giữ nguyên. Warning chunk cũ còn.
- API3000 khởi động lại từ source hợp nhất, web5174 HMR; readiness/API và web200.
  Giữ `.env` và DB local hiện có, không seed/reset/migrate trong lượt này.
  Workers chưa khởi động lại; không suy ảnh mới/đơn nền đã xử lý từ health API.
  Merge chỉ ở local, chưa push/PR/merge GitHub.

## Phiếu thỏa thuận và hội thoại mua/đổi chung —19/10/2026

- Nhánh `codex/chat-open-book`, base `b98a650`; bản thử mới từ `e9c37ab`, subject
  `refactor(web): give conversation a book dossier layout`. Chủ dự án duyệt làm
  thử sau nghiên cứu: đầu phiếu đỏ rượu chứa bìa thật80px/tên sách20px/tác giả/
  trạng thái, phiếu kem cạnh chat trắng; Back gọn thay tiêu đề sách riêng phía trên.
  Dưới960px giữ đầu sách trên cả hai tab; cover64/48px, chữ20px;320px chữ lớn
  được chảy xuống dưới ảnh. Follow-up từ `e5ff987`, subject
  `fix(web): let long book titles flow around the cover`: bỏ căn hai đầu ảnh/chữ,
  chữ sát bìa và chảy toàn chiều ngang dưới ảnh ở mọi breakpoint; đầu phiếu giãn
  theo nội dung, không cắt tên. QA fixture tên ngắn/dài300 ký tự/chuỗi liền,
  1440/1100/961/390/320px (320 chữ130%) PASS tại `.tmp/chat-title-wrap-qa`.
  Build (chunk warning cũ), QA cuộn hướng dẫn/giữ nháp PASS. Phiếu cuộn trên footer,
  hai nút cuối vẫn thẳng hàng. Không đổi handler/API hoặc dữ liệu thật.
  Đang chờ chủ dự án xem bản local, chưa push/PR.
  Follow-up từ `aac6aef`, subject `fix(web): dock transaction guide and follow its expansion`:
  giữ scrollbar gutter desktop để form không lệch; “Cách giao dịch” nằm sát footer,
  bỏ khoảng trống dưới khi đóng. Thao tác mở cuộn phiếu xuống cuối, đóng về đầu;
  mobile cuộn trang tới vùng vừa mở/đầu phiếu theo flow tự nhiên. Chỉ thao tác chủ
  động mới cuộn; cảnh báo tự mở không kéo viewport. QA fixture1440/1100 với scrollbar
  cổ điển, mobile390/320, bàn phím, bật reduced-motion, bật/tắt nhanh, giữ cả nháp
  PASS tại `.tmp/chat-guide-scroll-qa`; toàn bộ browser flow PASS tại
  `.tmp/chat-guide-scroll-flow-qa`. Build (chunk warning cũ), lint (6 warning cũ)
  PASS. Không đổi API/nghiệp vụ, không chạy lại gate backend/native/live storage.
- Phiếu trái ưu tiên hình thức → giá → đề nghị giá. Yêu cầu đổi nằm cạnh hình
  thức; giá niêm yết nổi trước chốt, giá thống nhất đỏ rượu nổi sau chốt. Phí vẫn
  hiện; hướng dẫn/phase trail gom vào “Cách giao dịch”. Tự mở khi hết hạn, thiếu
  nơi gửi hoặc quote đã gửi mất/hết hạn. Proposal, lỗi và revision cũ vẫn hiện
  trực tiếp; không đổi handler/quyền/key/body/version hoặc nghiệp vụ.
- Đầu sách đỏ rượu thay bookmark nhỏ; giữ vân giấy và mascot từ asset cũ cho chat
  rỗng còn hoạt động (lược mascot dưới360px). Field chat/giá dùng một viền focus sát ô như Đăng sách,
  forced colors có outline phía trong; bỏ ghi chú riêng tư dưới composer.
- PASS:147unit, typecheck/build (chunk warning cũ), lint (6 warning cũ), detector[].
  Browser fixture `.tmp/chat-dossier-qa` kiểm retry/chuyển hình thức/giá/
  đơn/thanh toán/Exchange cũ, desktop/mobile/chữ lớn. Xác nhận sau batch spacing
  tại `.tmp/chat-dossier-final-qa`: phần chính vừa khung1440/1100 cao900,
  disclosure bàn phím giữ cả nháp giá/tin, mobile390/320 chữ130% không tràn,
  quote hết hạn mở hướng dẫn, giá đã chốt, thiếu ảnh. Fix contrast fallback span
  bị CSS heading chung đổi màu: kiểm computed cream-on-wine PASS sau sửa, không
  thêm vòng chụp. QA bìa Alice chỉ trong fixture `[QA]`, không thay ảnh listing thật.
  Một lượt xem, một batch sửa và một lượt xác nhận; không chạy lại backend/native/
  live storage/remote CI, không đóng gate từ evidence UI. Chưa push/PR gói này.
- Nhánh `codex/unified-trade-chat`, base `c385dd0` (`codex/chat-guidance`).
  Subject `feat(chat): unify purchase and exchange agreement workspace`.
  [ADR0041](../adr/0041-unified-conversation-workspace.md) ghi quyết định đã duyệt.
  Navbar Chat mở card theo Buyer + Seller + listing; Detail Chat/Đổi sách mở cùng
  phiếu trái/chat phải. Mobile chuyển vùng giữ nháp; Mua ngay giữ nguyên.
- Seller đề xuất hình thức, đối tác xác nhận; Buyer được yêu cầu đổi sách.
  Giá đề nghị/chấp nhận có cấu trúc, gắn revision; giá tự điền và chỉ đọc khi tạo
  đơn. Mode/giá khóa khi có Exchange chưa hủy hoặc OrderCreated. Tin nhắn vẫn
  mở cho participant ACTIVE sau tạo đơn; không cấp quyền mới cho LOCKED.
  Giữ quote/key/body/version khi mất ACK, địa chỉ riêng, ledger/hold/commitment.
- OpenAPI0.44.0 và generated types; migration0032 mới thêm terms/events/link.
  Exchange mới liên kết nguyên tử vào hội thoại, lịch sử/tin cũ giữ nguyên.
  Standalone Exchange cũ dùng cùng bố cục, không ép gộp dữ liệu. Inbox kế thừa
  giới hạn100 hội thoại API hiện tại; đọc trực tiếp room không phụ thuộc giới hạn đó.
- PASS API4 suite/109tests (agreements/orders/exchanges/wallet-checkout), có
  quyền/replay/session thu hồi/revision cũ/giá sai/race và validator Mongo. Sau
  bổ sung chặn intent trái Sale-only/Exchange-only, chạy lại agreements9/9 PASS.
  API lint (11 warning cũ), typecheck/build, contract/check/routes172/26 PASS.
- PASS web147unit, lint (6 warning cũ), typecheck/build. Browser fixture toàn HTTP
  bị chặn + Socket.IO riêng5193/5195: chấp nhận giá/mode, linked Exchange, inbox,
  mất ACK create/pay/message, giữ nháp, OrderCreated còn chat,1440/390 và320px
  chữ130%. Evidence local `.tmp/unified-chat-qa`. Detector một lần có3 advisory,
  đã sửa cỡ chữ ngoài token và hai màu cũ; không chạy detector lặp.
- PASS seller-order browser qua HTTP/Mongo thật trên replica QA57017/database
  ngẫu nhiên *_test và storage fake: hai phiên login, quote/address retry,
  giá90.000 + phí30.000, mất ACK chỉ tạo1 đơn, thiếu tiền bị từ chối, thanh toán
  giữ120.000 đúng1 lần. Desktop1440/mobile390; evidence local
  `apps/user-web/test-results/seller-order`.
- Local API3000/media worker và web5174 chạy source mới. Đã áp dụng pending
  0030/0031/0032 vào DB app local;8 collection nghiệp vụ đối chiếu BSON không đổi,
  giữ5 bài demo và mật khẩu. User `.env` giữ nguyên; script riêng `.tmp` dùng
  kết nối local đã xác minh thay cấu hình cổng không còn hoạt động.
- Không push/PR/merge/deploy trong gói này. Native/live Supabase/remote CI/human
  review NOT RUN; READINESS và gate inspection/settlement giữ nguyên. Bước tiếp:
  chủ dự án xem `/chat` và Detail bằng hai tài khoản demo trên local5174.

## Sửa thông tin trước gửi và thử lại nơi gửi — 19/10/2026

- Chủ dự án báo POST `/me/addresses`502 sau quay lại sửa bước1 rồi gửi ở bước5.
  Kiểm máy: web5174 trỏ API3000 nhưng không có API listener. Đã bật lại bằng
  `pnpm dev:api` (Mongo local/API/media+order workers), giữ tiến trình chạy;
  GET readiness trực tiếp3000 và qua proxy5174 đều200. Không reset/seed DB.
- Member web pin cả key + serialized body của ý định tạo địa chỉ, kể cả
  expectedBookVersion/makeDefault khi query refetch sau mất ACK. Cache receipt,
  chọn id vừa lưu và retry bước đọc địa chỉ khi cần, không yêu cầu reload mất form.
  Giữ key-only ref của bản nháp đang mở qua HMR. Không đổi API/contract/session.
- Nhánh `codex/sell-review-address-retry`, base4cfd49d; subject
  `fix(web): preserve address command across review retries`.
- PASS web lint/typecheck/136unit/build/browser: từ review sửa tác giả rồi dùng
  thanh bước quay lại; POST địa chỉ đã commit nhưng proxy trả502, refetch sổ địa
  chỉ thật, sửa tác giả lần nữa và gửi lại giữ cùng key/body, chỉ1 địa chỉ và catalog
  nhận tác giả mới. Giữ submit/quota/lost-ACK2ảnh/gallery/sticky/shelf/chat PASS.
  QA API/Mongo riêng, storage fake/Sharp thật. Readiness local chỉ kiểm đọc, không
  tự gửi listing trên DB chủ dự án; native/live provider/human/remote CI NOT RUN.
- 6 warning lint/chunk cũ giữ; READINESS không đổi. Chưa push/PR/merge/deploy.

## Ảnh thu nhỏ trong bản nháp — 19/10/2026

- Follow-up: chủ dự án muốn thẻ lớn hơn một chút. Desktop rộng240→280px,
  khung bìa216→240px; compact/mobile giữ override. Nhánh
  `codex/widen-draft-preview`, basef4b1f51; subject `style(web): enlarge draft preview card`.
  PASS build + browser regression (sticky1200/1440, gallery, mobile390, submit/
  replay); đã xem ảnh desktop/mobile mới. Browser lần đầu chạy trước QA Mongo
  healthy lỗi startup, retry sau healthy PASS. CSS-only, không chạy lại unit/API.
- Member web `/sell`: ảnh thu nhỏ nằm dưới ảnh bìa trong thẻ “Cuốn sách của bạn”,
  cập nhật theo thứ tự ảnh bìa/phụ khi thay/xóa. Bấm thumbnail hoặc bìa mở ảnh lớn
  đúng ảnh, có trước/sau, phím mũi tên, Esc/nút đóng; xem ảnh không đổi ảnh bìa.
  Dialog native dùng chung hai bản preview desktop/compact, tái sử dụng CSS
  ListingGallery và lockPageScroll; giữ focus/scroll sau đóng, cleanup khi unmount.
- Desktop giữ sticky/cap chiều cao; thumbnails wrap >=44px. Mobile <=600px mở
  bản nháp theo chiều dọc để ảnh/thumbnail không bị ép. Không đổi API/RN/upload/
  idempotency. Nhánh `codex/draft-photo-gallery`, baseb6d2b2e; subject
  `feat(web): preview draft photos from thumbnail gallery`.
- PASS web lint/typecheck/136unit/build; Chromium1440/390 ở130%: thumbnail đúng
  URL/thứ tự sau thay/xóa, click mở đúng ảnh phụ/bìa, previous/ArrowRight, Tab nằm
  trong dialog, Esc trả focus và scroll lock được trả; không đổi2 ảnh của form.
  Regression sticky3 viewport/quota/upload2/replay/shelf/search/chat giữ PASS.
  Đã xem `apps/user-web/test-results/sell-draft-thumbnails-*.png` và
  `sell-draft-photo-detail-*.png`. API/Mongo QA riêng, storage fake/Sharp thật.
- 6 warning lint và warning chunk có sẵn. Không kiểm native/live provider/human/
  remote CI; READINESS giữ nguyên. Chưa push/PR/merge/deploy.

## Ảnh bìa và ảnh phụ riêng — 19/10/2026

- Member web `/sell` theo mẫu chủ dự án: ảnh bìa bên trái, vùng ảnh phụ bên phải;
  <=760px xếp dọc. Khung ảnh/picker cùng chiều cao, ảnh phụ chia grid khi thêm.
  Mỗi ảnh có nút X44px; bấm trực tiếp ảnh để thay đúng vị trí bằng picker1 tệp.
  Ảnh phụ mới vẫn chọn nhiều cùng lúc. Giữ1 bìa bắt buộc + tối đa7 ảnh phụ,
  JPEG/PNG/WebP10MB/ảnh; thay được khi đủ8. Xóa bìa không tự lấy ảnh phụ làm bìa.
- Giữ thứ tự preview/upload, từ chối nguyên batch lỗi/vượt chỗ, reset input và
  cleanup URL. Hủy picker giữ ảnh cũ; focus quay về control nhìn thấy sau thay/
  xóa và khi đủ ảnh. Raw native file row vẫn ẩn; mutation/retry giữ nguyên.
- Nhánh `codex/listing-cover-support-photos`, base21b68ad; subject
  `feat(web): separate cover and supporting photo pickers`.
- PASS web lint/typecheck/build/136unit; Chromium QA390/1440: bìa single/phụ
  multiple, cover removal/re-add/replacement giữ ảnh phụ, click thay ảnh phụ đúng
  slot, keyboard Enter, thay khi đủ8 không thêm ảnh thứ9, invalid/oversize/quota,
  upload2 ảnh + submit lost-ACK replay. Sticky regression1440×720/100%,
  1440×900/130%,1200×600/130% và mobile disclosure giữ PASS; shelf/search/chat PASS.
  Đã xem ảnh desktop/mobile `apps/user-web/test-results/sell-cover-support-*.png`
  và `sell-multiple-images-*.png`. API/Mongo QA riêng, storage fake/Sharp thật.
- Không đổi API/RN;6 warning lint/chunk có sẵn. Không kiểm native/live provider/
  human/remote CI; READINESS giữ nguyên. Chưa push/PR/merge/deploy.

## Bản xem trước đi theo khi cuộn — 19/10/2026

- Member web `/sell`: thẻ “Cuốn sách của bạn” luôn sticky trên desktop từ1200px,
  bỏ điều kiện viewport900px và ResizeObserver/previewFits. Thẻ giới hạn chiều
  cao theo viewport, cuộn nội dung bằng chuột/bàn phím, không che header/form;
  mobile giữ bản nháp thu gọn. Nhánh `codex/sticky-listing-preview`, base640c50c;
  subject `fix(web): keep listing preview alongside scrolling form`.
- PASS web lint/typecheck/build/136unit và browser regression:1440×720/100%,
  1440×900/130%,1200×600/130%, cuộn hai vị trí giữ top112px, End đọc hết thẻ dài,
  390px không hiện sidebar; form/multi-photo/quota/replay/chat giữ PASS. Ảnh local
  `apps/user-web/test-results/sell-sticky-preview-*.png`. Storage fake/Sharp thật.
- Không đổi API/RN; warning web6/chunk cũ giữ. Không kiểm native/live provider/
  human/remote CI; READINESS giữ nguyên. Chưa push/PR/merge/deploy.

## Chọn nhiều ảnh đăng sách — 19/10/2026

- Follow-up theo ảnh chủ dự án: ẩn hàng native “Choose files / No file chosen”,
  giữ vùng “Chọn ảnh bản sách”. Input nằm trong label, visually hidden, vẫn hỗ
  trợ Tab/Enter và hiện focus trên vùng chọn. Nhánh `codex/hide-native-photo-input`,
  base `a78344e`; subject `fix(web): hide duplicate native photo picker row`.
  PASS web lint/typecheck/build/136unit; browser bổ sung kiểm row1px không chiếm
  chỗ, click label, focus/Enter mở multi-picker, hủy chọn giữ ảnh cũ;
  giữ toàn bộ ca multi-photo/quota/upload/replay trước. Không đổi API/native.
- Theo ảnh chủ dự án ở Member web `/sell`: bật file picker `multiple`, xử lý
  toàn bộ nhóm chọn và nối vào ảnh cũ đúng thứ tự. Giữ tối đa8 ảnh,10MB/ảnh,
  JPEG/PNG/WebP; từ chối nguyên nhóm sai/vượt số chỗ, giữ ảnh cũ, reset input
  để chọn lại. Preview/upload cùng thứ tự, xóa ảnh và cleanup URL giữ nguyên.
- Nhánh `codex/listing-multi-image-picker`, base `1ea2ac9`; subject
  `fix(web): allow selecting multiple listing photos at once`.
- PASS web lint/typecheck/build/136unit; Chromium QA390/1440: chooser multiple,
  chọn3/xóa giữa, nhóm có GIF/ảnh>10MB không đổi ảnh cũ, vượt8 bị từ chối,
  thêm đủ8 khóa picker/xóa mở lại, upload2 ảnh và submit/retry giữ đúng key/body.
  Suite kệ/tìm kiếm/chat và quota trước đó vẫn PASS. API/Mongo QA riêng,
  storage fake/Sharp thật; ảnh local `apps/user-web/test-results/sell-multiple-images-*.png`.
- Chỉ sửa web; không đổi API/contract/RN. Warning web6/chunk có sẵn giữ nguyên.
  Không kiểm hộp chọn ảnh Windows bằng tay/native/live provider; không chạy lại
  gate API/Mongo không đổi. READINESS giữ nguyên; chưa push/PR/merge/deploy.

## Đăng miễn phí, tối đa 5 bài hiển thị/chờ duyệt — 19/10/2026

- Chủ dự án chốt chỉ tính bài trên trang chủ và bài gửi admin duyệt. Nhánh
  `codex/free-listings-five-limit`, base `25efcb8`; subject
  `feat(listings): replace submission fees with five active listing cap`.
  [ADR0040](../adr/0040-free-listings-five-active-cap.md), SRS FR-L09 và
  OpenAPI0.44.0 mô tả chính sách. Draft/Rejected/Approved Hidden/terminal trade/
  lưu trữ/gỡ không chiếm chỗ; Hidden PendingReview vẫn chiếm chỗ chờ duyệt.
- API không tạo phí bài mới, ví0đ vẫn gửi được; env phí20000 cũ bị bỏ qua.
  Hạn mức kiểm dưới owner lock trong transaction khi submit/resubmit, mở lại
  hoặc sửa bài Approved Hidden. Sửa bài Visible giữ chỗ; từ chối/ẩn/lưu trữ
  giải phóng theo trạng thái. Quá5 trả409 ListingLimitReached, giữ nội dung,
  version, ảnh và intent; replay thành công vẫn dùng được ở hạn mức đầy.
  Bài lịch sử vượt5 giữ nguyên; phí đã giữ cũ vẫn settle/refund đúng chuỗi.
  Không migration, sửa env riêng, DB app hoặc sổ cái lịch sử.
- Web bỏ lookup ví/nạp ví ở form; Web/RN hiện chính sách và giữ lỗi/retry.
  Browser fixture nhiều sách phân bổ nhiều owner để tuân thủ hạn mức thật;
  listing-review E2E tách owner từng test, giữ nguyên assertions nghiệp vụ.
- PASS Node24.21.0/pnpm11.19.0: contract generate/check/routes168/26; API
  lint/typecheck/build/150unit; Web lint/typecheck/build/136unit; RN
  lint/typecheck/143unit. Warning có sẵn: API11/Web6, web chunk lớn.
- PASS HTTP/Mongo QA riêng: wallet-checkout33/33 (gồm miễn phí, mixed quota,
  auth/replay/rollback, ba race submit/reopen/hidden revision và phí lịch sử);
  thêm2/2 scoped terminal/legacy-over-cap (33ca ngoài filter SKIP); listing-review
  73/73. Web Chromium390/1440 PASS hạn mức→ẩn1bài→retry→lostACK→replay, chỉ1draft/
  address, ví0/không phí; giữ regression kệ/tìm kiếm/chat. Storage fake, Sharp thật.
  Ảnh local: `apps/user-web/test-results/listing-quota-390.png` và `listing-quota-1440.png`.
- RN export:web PASS (cảnh báo Expo force-exit sau khi export thành công).
  Focused Expo browser PASS login→tạo nháp→tab Kiểm tra, đúng copy miễn phí/5bài,
  ví0/không phí và không overflow ở390/1440. Ảnh/script local tại
  `.tmp/free-listings-rn/` và `.tmp/free-listings-rn-browser.mjs`. Full RN browser
  FAIL trước khi tới editor do harness chờ heading cũ “Tình trạng sách”, source
  hiện là “Khảo chứng tình trạng sách”; không nhận full harness/native PASS.
- FAIL kiểm Mongo schema mở rộng:21/25 PASS,4 upgrade cases thiếu ExchangeDisputed
  trong validator member_notifications, tại schema.mongo-spec.ts315/383. Source
  Mongo và test/mongo giống nguyên base25efcb8 (`git diff` rỗng cho hai thư mục);
  không sửa migration đã áp dụng hoặc mở rộng gói để che lỗi này.
- Native-device/live-provider/human review/remote CI NOT RUN; READINESS giữ nguyên.
  Chưa push/PR/merge/deploy. Bước tiếp: review độc lập, xử lý lỗi schema Exchange
  ở gói riêng và tích hợp/restart API/worker theo quyền được giao.

## Trao đổi sách (Exchange): Hoàn tất Ưu tiên 0 & Ưu tiên 1 — 17/10/2026

- **Mục tiêu**: Xử lý lỗ hổng bảo mật địa chỉ (P0) và 2 điểm nghẽn deadlock hàng hóa / tài chính (P1) trong luồng Trao đổi sách.
- **Branch**: `feature/exchange-web-completion`.
- **Ưu tiên 0 (Bảo mật địa chỉ đối tác - Address Hijacking)**:
  - Loại bỏ hoàn toàn trường `partnerAddress` khỏi `AcceptExchangeCommand` và `CounterExchangeProposalCommand` trong OpenAPI contract (`packages/api-contract/openapi.yaml`). Mỗi bên tham gia chỉ có thể chọn địa chỉ thuộc sở hữu của mình (`deliveryAddressId` từ `member_addresses`).
  - Cập nhật backend `apps/api/src/modules/exchanges/exchanges.service.ts`: loại bỏ việc ghi đè `recipientAddress`/`initiatorAddress` từ payload đối tác.
  - Cập nhật client `apps/user-web`: loại bỏ các trường input nhập địa chỉ đối tác ở `AcceptExchangeDialog` và `CounterDialog`, chuyển thành thẻ hiển thị thông tin chỉ đọc (Read-only Card).
- **Ưu tiên 1 (Deadlock thời hạn gửi sách 72h & Cơ chế đóng băng khiếu nại 48h)**:
  - **72h Shipping Deadline & Auto-Sweep**:
    - Khi trao đổi chuyển sang `Preparing` (cả 2 bên đã nạp tiền bảo chứng), hệ thống tự động gán `shippingDeadline = now + 72h`.
    - Bổ sung nhánh quét `expireShipping` trong worker `ExchangeExpiryService`:
      - **Case A** (cả 2 bên chưa gửi sách sau 72h): Tự động hoàn tiền bảo chứng / chênh lệch và chuyển sang `Cancelled` (`cancelReason: 'ShippingExpired'`), nhả cả 2 sách về `Available`.
      - **Case B** (1 bên đã gửi sách, bên kia bỏ gửi): Tự động leo thang chuyển sang `ResolutionPending` với `disputedBy: 'System'`, đóng băng toàn bộ tiền và giữ sách `Reserved` để bảo hộ quyền lợi và tài sản của bên đã gửi hàng.
  - **Đóng băng tất toán tự động 48 giờ khi có khiếu nại**:
    - Thêm endpoint `POST /api/v1/exchanges/{id}/dispute` (`DisputeExchangeCommand`) cho phép thành viên gửi khiếu nại khi phát hiện sách lỗi/rách hoặc trục trặc vận chuyển trong giai đoạn `InTransit` / `Delivered`.
    - Trạng thái chuyển sang `ResolutionPending`, ghi nhận `disputedAt`, `disputedBy`, `disputeReason`, gửi thông báo `ExchangeDisputed` cho cả 2 bên.
    - Worker `expireInspection` được tự động đóng băng do điều kiện truy vấn chỉ xét trạng thái `Delivered`.
  - **Frontend User-Web**:
    - `ActionCard`: Hiển thị deadline gửi sách 72h trong trạng thái `WAITING_YOU_SEND`; bổ sung nút "Báo cáo khiếu nại" khi sách đang giao / đang nghiệm thu (`DELIVERING`, `INSPECTING`); hiển thị lý do khiếu nại và thông báo hỗ trợ khi ở trạng thái `RESOLUTION_PENDING`.
- **Kiểm thử và xác minh chất lượng (Verification)**:
  - `pnpm contract:check`: PASS (OpenAPI parsed cleanly, sync checked).
  - `@used-books/api` typecheck: PASS (0 errors).
  - `@used-books/user-web` typecheck: PASS (0 errors).
  - `@used-books/api test:e2e test/exchanges.e2e-spec.ts`: 27/27 tests PASS (toàn bộ 4 test suites mới cho P0, Shipping Deadline 72h sweep, 1 bên gửi sweep leo thang, và Dispute đóng băng 48h nghiệm thu đều PASS).
  - `@used-books/api test:mongo test/mongo/schema.mongo-spec.ts`: 19/19 tests PASS (Migration 0027 và schema validation cho `exchanges` và `member_notifications` đạt chuẩn).
  - `@used-books/user-web test`: 21 test files, 136/136 tests PASS.

## Khu vực luân chuyển sách — 17/10/2026

- Chủ dự án giao chia commit và push17/10: đã push nhánh tổng hợp
  `origin/codex/fix-order-address-region-label` với bốn commit riêng
  `f10a97e` (UI popup mua bán), `a68f016` (mở popup từ lỗi địa chỉ),
  `e680b20` (ba khu vực luân chuyển) và `23dd453` (nhãn khu vực popup tạo đơn).
  Commit bàn giao: `docs(handoff): record published purchase popup commits`.
  Working tree sạch trước publish; không đưa `.tmp`/credentials vào Git.
  Checks đã đạt ở các checkpoint dưới giữ nguyên; không đổi source sản phẩm
  khi publish. Chưa tạo PR/merge/deploy hoặc xác nhận remote CI cho nhánh này.
  Các dòng “không push” bên dưới là trạng thái trước lần chủ dự án giao này.
- Follow-up ảnh người dùng: popup Seller tạo đơn trong chat tra localityCode của
  quote qua directory để hiện tên khu vực thay mã DEMO-A. Có loading/error/retry,
  giữ snapshot/giá/key/body. Nhánh `codex/fix-order-address-region-label`, base
  `e680b20`; subject `fix(web): resolve seller order address region labels`.
  PASS web lint/typecheck/build/135unit và seller-order browser1440/390 gồm
  directory503→retry, draft/đóng-mở và create/pay lost-ACK. [Evidence](../../.impeccable/review/circulation-regions/README.md).
  QA riêng đã dọn; warning/gate và giới hạn dưới đây giữ nguyên.
- Chủ dự án đổi dropdown thành TP.HCM, Bình Dương, Vũng Tàu như ba khu luân chuyển.
  Nhánh `codex/book-circulation-regions`, base `a68f016`; subject
  `feat(addresses): configure three book circulation regions`. [ADR0039](../adr/0039-book-circulation-regions.md).
  OpenAPI0.43.1 mô tả directory; migration0030 mới đổi nhãn DEMO-A/B và thêm C,
  giữ mã wire HCM-DEMO-v1/name TP.HCM và address/listing/order cũ.
- Member web đổi nhãn/copy form gửi/nhận, dữ liệu lấy API thật. Không thêm điểm
  ViaPoint, geocoding hay phí giao mới; READINESS giữ nguyên. Đã áp dụng đúng0030
  vào DB local sau preflight chỉ có migration này; pending rỗng, API ready200.
- PASS API lint/typecheck/build/150unit, contract/check/routes165/26; web
  lint/typecheck/build/135unit; address HTTP17; Mongo48/4SKIP (import/failover).
  Ba browser suite đăng bán/Mua ngay/thương lượng PASS, có Bình Dương→Vũng Tàu
  quote và giữ dữ liệu/key/body. [Ảnh/checks](../../.impeccable/review/circulation-regions/README.md).
  Warning cũ còn. Native/live provider/human/remote CI NOT RUN; không push/PR/
  merge/deploy. Không thay migration đã áp dụng hoặc snapshot SRS cũ.

## Popup mua bán và Mua ngay — 17/10/2026

- Follow-up ảnh người dùng: sửa liên kết lỗi `originAddress` ở `/sell` để mở
  popup thay vì focus select đang ẩn; giữ focus ô thường. Browser regression
  FAIL trước sửa, PASS sau sửa: chuột1440, Enter390, trả focus/giữ draft và
  upload/submit replay. Web lint/typecheck/build/135unit PASS; warning cũ giữ.
  Fresh AI review theo ảnh người dùng `ship` phạm vi recovery; QA đã dọn.
  Subject `fix(web): open sender address popup from validation error`.
- Nhánh `codex/purchase-popup-ui`, base `ed8734f`; subject dự kiến
  `feat(web): unify purchase flows with popup forms`. Phạm vi Member web React/Vite:
  popup địa chỉ/xác nhận Mua ngay, gửi quote từ chat, Seller nhập giá/tạo Order,
  nơi gửi khi đăng bán. Trang Mua ngay có ảnh/tình trạng sách, tiến trình và bảng
  tiền; giữ wine/cream/Be Vietnam Pro. Không đổi API/contract/Mongo/native.
- Dùng chung `PurchaseDialog`/`PurchaseAddressFields`: native dialog qua portal,
  focus/Tab/Escape/click ngoài/scroll cleanup, giữ draft khi đóng/mở, khóa đóng
  khi busy; motion260ms giữ theo chính sách chủ dự án. Checkout chọn đúng địa chỉ
  mới sau lưu, pin body/key/ID qua retry để không tạo trùng sau lỗi quote.
- Local PASS: web lint/typecheck/build/135unit, buy-now/seller-order/browser trên
  Mongo QA riêng/database disposable `*_test`, storage/ví/carrier fake. Các ca
  lost-ACK address/create/pay, thiếu tiền, chọn địa chỉ mới khi có default, focus,
  popup/draft và upload/submit/polling cũ được kiểm. Bốn lint warning exchange và
  chunk warning cũ còn. API build chỉ để fixture, không nhận API suite PASS.
- Independent AI review yêu cầu sửa cascade viền input và recovery địa chỉ mới;
  verdict cuối `ship` chấm cả hai fix resolved. Regression save→quote422→retry
  không tạo thêm địa chỉ; computed border đúng token. Documentation cập nhật
  component/consumer, giữ DESIGN/sidecar. [Evidence](../../.impeccable/review/purchase-popup/README.md).
  QA đã dọn database/users/roles và dừng đúng Mongo do phiên này bật.
  Native/live Supabase/provider/human review/remote CI NOT RUN; READINESS giữ
  nguyên. Không push/PR/merge/deploy; không suy quyền từ PR44 trước đó.
## Redesign Sàn Đấu Giá & Ký Gửi Sách RN — 17/10/2026

- Tái thiết kế màn hình Sàn Đấu Giá (`auctions-screen.tsx`) và Ký Gửi Sách Đấu Giá (`send-to-auction-screen.tsx`) trên React Native theo Stitch screens `DauGia-App` & `DauGiaDang-App`.
- Màn hình Ký gửi:
  - Phân tách module hóa thành 8 component chuyên biệt trong `apps/mobile-react-native/src/features/auctions/send-to-auction-components/`.
  - Bổ sung dropdown thu gọn / mở rộng (accordion) có animation cho 4 mục: Điều khoản ký gửi, (1) Chọn sách, (2) Chọn điểm tiếp nhận, (3) Thiết lập giá đấu.
  - Áp dụng bảng màu vàng vintage đồng bộ với banner đấu giá (`vintageGold: #F6E0A8` nền, `goldBorder: #D4A373` viền, bóng `wineDark`) và thẻ con nền trắng theo yêu cầu thiết kế.
  - Sắp xếp bộ lọc và danh mục hiển thị ngay dưới tiêu đề "Sách Cũ Đang Đấu Giá"; gỡ nút trùng lặp.
  - Tích hợp đầy đủ API thật: `/auction-intakes`, `/me/listings`, `/handover-points`, rút sách, nộp bằng chứng bổ sung.
- Đồng bộ hệ thống theme token `stitchTokens` trong `theme.ts` và tuân thủ 100% ESLint rules (không dùng raw color literal trong features, thay thế TextInput/Modal bằng AppTextInput/AppModal từ `core/ui`).
- Nhánh: `feat/rn-auction-consignment-flow`, base `cf4c3e4` (`origin/main`).
- PASS:
  - `pnpm --filter @used-books/mobile-react-native lint`: 0 error, 0 warning.
  - `pnpm --filter @used-books/mobile-react-native typecheck`: 0 error.
  - `pnpm --filter @used-books/mobile-react-native test`: 143/143 unit tests PASS (21 test files).
  - `pnpm docs:check`: 389 Markdown files, 2596 relative file links PASS.
  - `git diff --check`: PASS.

## Trạng thái listing theo thanh toán — 16/10/2026

- Chủ dự án đổi nhãn: Order unpaid là “Chờ thanh toán”, chỉ payment commit
  thành công mới “Đang giao dịch”. Nhánh `codex/paid-listing-transaction-state`,
  base `56c5008`; subject `fix(listings): show transaction status only after payment`.
- OpenAPI0.43.0 bổ sung purchaseAvailability AwaitingPayment/InTransaction;
  projection snapshot lấy paidAt/paymentDeadline từ active Order, không lộ ID
  hoặc danh tính Buyer. Reserved/commitment15phút vẫn chống mua trùng; không
  sửa command/ledger/Mongo schema hoặc dữ liệu app. InNegotiation chỉ còn cho
  reservation chat lịch sử. Web kệ/chi tiết và parser/notice RN nhận trạng thái
  mới; chat OrderCreated dùng nhãn trung tính “Đã tạo đơn”.
  Payment thành công làm stale cache kệ/tìm kiếm/chi tiết để khi quay lại cập
  nhật nhãn ngay. Browser Mua ngay/thương lượng390/1440 PASS, thêm người xem
  public kiểm nhãn kệ/chi tiết trước pay, thiếu tiền và sau pay; mất ACK giữ
  đúng key/body. Không cần migration hoặc sửa dữ liệu cũ.
- PASS: contract generate/check/routes165/26; API lint/typecheck/build/150unit,
  web lint/typecheck/build/135unit, RN lint/typecheck/142unit. Warning cũ
  API11/web4/RN1 và web chunk còn. Node24.21.0/pnpm11.19.0.
- API scoped9/9 PASS (132 ca ngoài filter không chạy): unpaid projection,
  negotiated paid/accepted, sáu ca BuyNow gồm thiếu tiền, replay, cạnh tranh,
  rollback payment, cancel/expiry. Chạy trên replica set QA/database *_test,
  không chạy lại full API/Mongo import/failover. Native device/live provider,
  human review/remote CI NOT RUN; READINESS giữ nguyên.
- [Evidence và giới hạn](../../.impeccable/review/direct-buy-now/README.md).
  Chủ dự án giao push16/10: đã push nhánh tổng hợp
  `origin/codex/paid-listing-transaction-state` với ba commit riêng
  `6116bff` (Mua ngay), `56c5008` (form chọn ảnh), `1130b90` (nhãn theo payment).
  Commit bàn giao: `docs(handoff): record published buy-now commits`.
  [PR44](https://github.com/huangg49/used-book-marketplace/pull/44) hiện mở.
  Kiểm tra GitHub16/10 trên head `c733641`: cả8job FAIL trước khi start vì
  account payments/spending limit (annotation giống nhau), không có test step
  nào chạy. [API run](https://github.com/huangg49/used-book-marketplace/actions/runs/38876117415),
  [web run](https://github.com/huangg49/used-book-marketplace/actions/runs/38876117404).
  Chủ dự án giao kiểm tra CI và push lại; commit
  `docs(handoff): record PR44 Actions billing blocker` ghi evidence, không đổi
  workflow hoặc bỏ check. Owner cần xử lý Billing & plans rồi rerun checks.
  Local PASS phía trên không thay remote CI. Chưa merge/deploy; human review
  theo TEAMWORK còn cần. Các mốc “commit local” dưới đây là lịch sử.

## Mua ngay độc lập — 16/10/2026

- Sửa hồi quy form gửi sách trên `codex/fix-order-upload-flicker`, base
  `6116bff`; subject `fix(web): preserve shipping form during background polling`.
  GET shipment404 là kết quả rỗng được cache, không làm tháo/dựng form mỗi5giây.
  Lỗi tải nền vẫn báo retry và giữ ảnh, mã đang nhập, focus. Browser test mới
  tái hiện FAIL trước sửa vì file input bị detach khi picker mở; PASS sau sửa
  qua404/503/phục hồi404, chọn/lưu PNG và đăng ký vận đơn tới pickup mô phỏng.
  Web lint/typecheck/build và135unit PASS, warning cũ4/chunk còn. Chromium hai
  phiên390/1440, API/Mongo QA thật/storage fake; chưa kiểm hộp thoại Windows
  bằng tay. Không đổi API/contract/DB/native, không chạy lại full API suite.
  Bản sửa commit local; chưa push/PR/merge/deploy, READINESS giữ nguyên.
- Chủ dự án chốt hai luồng riêng: thương lượng qua chat/Seller tạo đơn và Mua
  ngay giá niêm yết không chat/duyệt lại. Nhánh `codex/direct-buy-now`, base main
  `4924fab`; commit subject `feat(orders): add independent listed-price buy-now checkout`.
  [ADR0038](../adr/0038-direct-buy-now-orders.md) bổ sung ADR0037, SRS1.1 cập nhật.
- OpenAPI0.42.0/165operation/26controller: `POST /orders/buy-now`, quote thuộc
  Buyer ACTIVE, giá từ listing đã khóa; snapshot purchaseMode. Quote/chat không
  giữ sách; create giữ15phút, cùng commitment với thương lượng/Exchange/intake.
  Payment atomically hold + Preparing/version3 + pickup48h + hai inbox, không
  cần Seller accept và không dùng nhánh refund trước acceptance. Ledger/version,
  replay và nghĩa vụ giao nhận cũ giữ nguyên; quá hạn pickup mở review giữ tiền.
- Web: Mua ngay ở chi tiết; `/buy-now/:listingId`, `/orders`, `/orders/:orderId`;
  địa chỉ, tổng, pay/cancel unpaid, ví, theo dõi; Seller ảnh đóng gói/label;
  inbox mở đúng Order. Không lưu token/PII/intent vào browser storage. Native chỉ
  cập nhật parser inbox để nhận contract chung; chưa có UI Mua ngay native.
- Migration0029 forward-only chỉ nới kind/target inbox; migration cũ/checksum
  không sửa. Máy nhận cần migrate pending gồm0029 trước API/worker mới.
  Không migrate/seed DB app, không push/PR/merge/deploy; READINESS giữ nguyên.
- PASS: contract/generate/routes, API lint/typecheck/build/150unit, web
  lint/typecheck/build/135unit, RN lint/typecheck/142unit, Mongo schema24/24
  gồm upgrade populated/idempotency/dedupe và giữ index/checksum. Có warning cũ
  API11/web4/RN1 và web chunk; không thêm warning mới. Node24.21.0/pnpm11.19.0.
- BuyNow scoped6/6 PASS: giá/không chat, owner/current authorization, stale
  address/payload chèn giá, same-key/body conflict, thiếu tiền không hold,
  auto preparation + inbox một lần, từ chối pre-acceptance sau pay, race với
  thương lượng, unpaid cancel, rollback payment và expiry đúng deadline.
- Browser Mua ngay PASS hai phiên390/1440: mất ACK create/pay giữ key/body,
  một payment/hold, không conversation, ảnh qua Sharp/storage fake, label vẫn
  Preparing rồi pickup bởi operator độc lập mới InTransit; không tràn ngang.
  [Ảnh và provenance](../../.impeccable/review/direct-buy-now/README.md).
- Browser Seller Order thương lượng PASS hai phiên390/1440: quote không giữ
  sách, giá90000+ship30000, lost ACK, thiếu ví rồi pay một lần; giữ semantics cũ.
  API6suite Order/payment/preparation/packaging/shipment/pickup:229/231 PASS
  trong lượt tổng, hai ca timeout60s (Restricted existing obligation/expiry và
  wrongAmount balanced entries) chạy riêng đều PASS3,55s/1,27s trên database
  QA mới của cùng replica set, giữ nguyên assertion rollback/quyền/tiền.
  Không ghi full-suite PASS. Lượt tổng dùng CLI testTimeout60s/hook120s;
  transaction budget/lock/assert không đổi. 100 payment replay và các race,
  sáu ca BuyNow đều PASS trong lượt tổng. Lượt15s trước đã dừng sau timeout,
  không tính PASS.
  Lượt trước bị gián đoạn Mongo monitor/timing không tính PASS; lượt unit web
  khởi tạo quá nhiều worker bị timeout đã chạy135/135 với maxWorkers2.
- Full API E2E/Mongo import/failover, native-device/live-provider acceptance,
  human review và remote CI NOT RUN trong gói này. Không mở gate Delivered/
  inspection/claim/settlement. Bước tiếp: review tiền/quyền bởi người độc lập
  theo TEAMWORK, tích hợp/migration/deploy theo quyền gói tiếp theo.

## Chat mua bán, Seller tạo Order — 16/10/2026

- [PR43](https://github.com/huangg49/used-book-marketplace/pull/43), base main
  `3edb2c1`; feature `064d744`/`d7b32a6`, integration fix `514213a` trên
  `codex/pr43-ci-fixes`, push vào `codex/seller-selected-purchase-orders`.
  Chủ dự án giao test local rồi squash-merge dù GitHub Actions bị billing chặn.
  Trạng thái merge/SHA thực tế xem PR; không suy CI xanh hoặc human sign-off.
- Direct Sale/Both: chat/báo giá không giữ listing; nhiều Buyer có thể nhắn;
  Buyer gửi địa chỉ/báo giá, Seller chọn hội thoại và giá đã thỏa thuận để tạo
  Order unpaid/reservation, Buyer thanh toán sau. Listing Order vẫn public với
  trạng thái đang giao dịch. OpenAPI0.41.0/ADR0037/SRS1.1 là contract/quyết định.
- Fix tích hợp: sổ cái payment/refund/settlement kiểm số tiền agreement bất biến;
  kiểm Buyer hiện hành; không chia sẻ địa chỉ mới nếu khác version đã gửi;
  từ chối quote/listing stale. Web giữ key/body/giá sau mất phản hồi, cho xóa giá
  để nhập lại, cập nhật trạng thái sách khi quay về từ chat, báo lỗi thiếu số dư.
  Fixture/demo chuyển sang API Seller thật; contract Buyer-create cũ vẫn bị từ chối.
- Local Node24.19.0/pnpm11.19.0: contract/routes164operation/26controller, docs,
  diff, API/web/admin lint/typecheck/build PASS; unit API150/web135/admin28/
  session21/RN142/demo15 PASS. RN Android/iOS/web export + browser kệ/địa chỉ/
  đăng sách, operations browser, web shelf/sell/exchange/wallet/auth/auction PASS.
  Browser Seller Order mới390/1440: quote, giá90000+ship30000, mất ACK tạo đơn/
  same-key replay, thiếu tiền không hold rồi nạp và pay một lần PASS; đưa vào CI.
- API E2E:651/652 PASS trong lượt tổng; ca pickup/expiry còn lại vượt budget15s
  cũ, PASS6,4s khi chạy riêng trên chính database QA giữ nguyên sau lượt tổng.
  Test audit/race có budget60s, assertions tài chính/rollback giữ nguyên.
  Migration0028 populated/fresh schema PASS; định nghĩa/checksum migration giữ.
  Mongo full6suite/50test gồm PostgreSQL import và replica-set failover PASS,
  không skip. QA dùng replica set/database riêng, không chạm DB app.
  Demo Order46/transit65 intents/receipts stable PASS. Flutter format/analyze/
  test1 PASS; Windows pub-get plugin-link cần Developer Mode nên analyze/test
  chạy --no-pub sau resolve deps; không đổi cài đặt máy.
- GitHub8jobs trên `514213a` FAIL trước khi start do billing/spending limit.
  Kết quả local không thay bằng chứng remote CI. Independent human review/live
  provider/native-device acceptance NOT RUN; READINESS giữ nguyên. Không deploy
  hoặc migrate DB app. Khi cập nhật runtime, áp dụng migration pending gồm0028
  trước API/worker mới. WIP API và Home/demo cũ ở checkout khác được bảo toàn.

## Member web: Login gió và sân khấu đấu giá — 14/10/2026

- Chủ dự án duyệt preview `5de3a4e`, giao tích hợp chính, rà lỗi toàn gói,
  push/PR và sửa CI tự động; review người thật sáng hôm sau. Chưa giao merge/deploy.
- Branch `codex/auth-wind-login-integration`, base main `7a52d08` (PR38).
  Commit subject `feat(web): integrate approved auth wind and auction stage`.
  Worktree riêng; WIP `apps/api/package.json`/`seed-bidders.ts` và các thay đổi
  Detail/Exchange chưa tích hợp trên checkout cũ được giữ nguyên, không đưa vào PR.
- Login dùng cùng source mesh với preview: dấu 280ms + ba tờ nguyên vẹn bay
  1152ms, mảnh nhỏ, giấy ngoài che/mở và breeze tan 2500ms. Chỉ chạy sau API
  thành công; xóa mọi giá trị input khỏi texture. Không xé/zoom form/đón gió.
  Rèm toàn trang Đấu giá giữ navbar, nhịp 1385ms, sides/diềm gọn đã duyệt;
  không chạy lại khi đến qua Login giấy, lần navbar/Back/reload sau vẫn chạy.
- Sửa async cancellation/late renderer và đồng bộ dấu để không hit hai lần
  khi capture chậm. Lint/typecheck/135 web unit, 21 session unit, build/preview
  build, docs và browser fixtures desktop/mobile/465px PASS. Rèm regression,
  wrong Login, query/hash/focus/inert/scroll, Back/resize/context loss/missing
  capture/delayed preparation PASS. [Evidence và giới hạn](../../.impeccable/review/auth-wind-production/README.md).
- Review AI mới tìm một P2; verdict chấm đã resolved, `ship` phạm vi lỗi đó.
  Three 0.186.1 production lazy Auth; không API/contract/DB/native/gate thay đổi.
  Local Node 24.12<24.15 và chunk warning còn; Safari/live Auth/physical/FPS
  chưa kiểm. READINESS giữ nguyên. Đã push và tạo
  [PR39](https://github.com/huangg49/used-book-marketplace/pull/39); kết quả remote
  CI theo đúng head được cập nhật trong bảng Validation của PR và tab Checks
  (bảy workflow đã khởi chạy tại checkpoint này). Bước tiếp review người thật;
  chưa merge/deploy. Bản nguồn mới để xem local tại `http://127.0.0.1:5200/`,
  checkout cũ/preview5198 giữ nguyên.

### Điểm lưu teammate được giữ

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

## VNPay sandbox trên localhost — 15/10/2026

- Nhánh `codex/vnpay-wallet-listing-fees`, base `7be68a4`; chủ dự án yêu cầu nạp ví
  từ localhost không ngrok. API env riêng đã bật merchant/Returnlocalhost5174;
  Web dùng `/api/v1` cùng origin, proxy HTTP/Socket.IO giữ chat/auction live.
  Credential/hostname máy riêng không vào Git. [Setup](../features/WALLET_CHECKOUT.md),
  [ADR0036](../adr/0036-vnpay-local-querydr.md).
- POST `me/topups/:topupId/vnpay-query` kiểm owner/current role/session trước
  và sau call; HMAC QueryDR/merchant/ref/amount/type01/payment00 trước credit.
  Query/IPN chung executor/ledger và transaction identity, receipt operation riêng;
  chỉ credit một lần khi race. Key Query bằng intentId; response chưa xác nhận
  không được coi là receipt credit. Return query vẫn chỉ để tìm intent.
- Follow-up giữ phiên sau nạp: Web mở VNPay trong tab riêng ngay khi bấm,
  bỏ opener và giữ token trong bộ nhớ tab ví. Return gate trước auth chỉ gửi
  intentId/ACK qua BroadcastChannel cùng origin rồi đóng tab; tab ví tự QueryDR,
  số dư và Tổng quan tài khoản cùng cập nhật. Popup blocked không tạo intent,
  closed/pending tiếp tục cùng key/body; tab ví đã mất/phiên hết hạn vẫn login.
- Migration0024 forward-only cho Query operation đã áp trên local,0022/0023
  checksum giữ nguyên; không seed/reset hoặc tự ghi credit. Probe merchant thật
  read-only qua adapter PASS chữ ký/status/amount, configured Returnlocalhost.
  Restart API sau khi đổi env; không cần tunnel.
- PASS: API146unit/typecheck/build, wallet22E2E gồm denied owner/header/revoked
  session/role/LOCKED/replay/Query-IPN race; Mongo43PASS/4SKIP (import/failover chưa
  cấu hình); OpenAPI0.35/routes139operations/23controllers. Web lint/build và browser
  desktop/mobile trên QA Mongo riêng/fake storage/provider: same-origin API, giả
  Return không credit, Query outage/retry/credit, lost-ACK cùng key/body. Screenshot
  QA ở `.tmp/wallet-checkout-browser`, không là provider payment thật.
- Browser follow-up đã kiểm tab ví giữ đăng nhập qua Return, tự credit/display,
  quay về Tổng quan có số dư mới, callback không có tab nguồn không lộ private
  data/credential, gỡ raw bank query khỏi URL; fake provider trên QA riêng.
- Owner báo giao dịch sandbox thật đã cộng ví; lần chạy provider popup mới của
  owner chưa xác nhận. Backend/session/contract không đổi trong follow-up UI.
- RN lint/typecheck/133unit PASS; cache typed routes `.expo` cũ thiếu register/search
  được tạo lại bằng generator Expo trước typecheck, không sửa source route.
- Chia commit theo phạm vi: `4dbf226` API/contract/migration và tests; `073d0ef`
  parser/nhãn ví RN; `2c906ca` cho Web; commit
  `docs(wallet): document sandbox setup and verification`
  cho hướng dẫn/điểm lưu. Chủ dự án đã giao commit/push nhánh này ngày15/10.
- Follow-up conflict ngày15/10: hợp nhất `origin/main` tại `c9688ac` vào nhánh ví,
  giữ Login gió/sân khấu đấu giá, N4 point administration/inspection/incidents và
  exchange completion/messages/reviews từ main. [PR42](https://github.com/huangg49/used-book-marketplace/pull/42).
  Commit subject `fix(integration): merge main and reconcile wallet command schemas`.
  OpenAPI0.40.0,163operations/26controllers;36migration có ID duy nhất.
- Migration0027 forward-only hợp nhất receipt/audit của point và VNPay, gồm đúng
  một target kể cả pointId, QueryDR/IPN và DirectDelivery system principal pairs.
  Nâng cấp từ mỗi nhánh giữ schema cuối, checksum và journal/entry count; migration
  cũ không sửa. Máy nhận từ nhánh ví cần bootstrap quyền collection rồi migrate
  theo [setup](../features/WALLET_CHECKOUT.md); DB chính chưa chạy các bước này.
- Browser fixture lịch sử giữ profile0/Unpaid; wallet suite tự khai báo20000/Wallet.
  User Web CI thêm wallet browser sau hai suite lịch sử. Browser cả ba suite trên
  API/Mongo QA thật và fake storage/provider PASS; ảnh QA mới ở `.tmp`, giữ ảnh
  evidence đã commit của teammate.
- Kiểm sau hợp nhất: API150unit/lint/typecheck/build; Web135unit/lint/typecheck/build;
  RN142unit/lint/typecheck/export Android/iOS/Web; Admin28unit/typecheck;21session
  unit; Mongo45PASS/4SKIP (import/failover chưa cấu hình); contract/routes/docs và
  diff check PASS. API11/Web4/RN1 lint warning từ main; Web chunk warning còn.
- E2E sau hợp nhất: carrier-pickup30PASS gồm cap128; wallet22/exchange22 PASS.
  Scoped98case có97PASS/1FAIL vì Mongo QA monitor timeout; bid race chạy riêng PASS.
  Delivery35case có34PASS/1FAIL ở worker khi QA gián đoạn; worker chạy riêng PASS.
  Fixture provider timestamp của delivery dùng DB clock thay clock Windows để
  tránh lệch đồng hồ; không đổi validation ứng dụng. Lượt local dùng CLI
  testTimeout60000/hookTimeout120000, source timeout/transaction/assert không đổi.
  Lượt đầu chạy chung Mongo failpoint bị nhiễu; lượt15s timeout, không tính PASS.
  Full E2E đã dừng sau lỗi kết nối QA, không ghi full-suite PASS.
- Follow-up CI trên [PR42](https://github.com/huangg49/used-book-marketplace/pull/42):
  head `3efc5ae` có6workflow PASS; API FAIL ở PostgreSQL import thừa native account
  `ListingFeeClearing`, Demo FAIL ở submit409 do default phí mới. Commit subject
  `fix(ci): preserve native fee accounts and pin historical demo policy` giữ hai
  native account theo đúng ID khi so hash/count PostgreSQL, giữ nguyên account và
  zero balance; demo sandbox khai báo0/Unpaid/VNPay off, app mặc định20000/Wallet
  không đổi. Không bỏ assert hoặc tắt job.
- Local follow-up: PostgreSQL import3PASS trên PG QA/Mongo QA thật, source snapshot/
  hash/count/nghĩa vụ cũ và native fee account giữ nguyên; một lượt trước lỗi Mongo
  monitor được chạy lại thành công. Demo15unit và bốn scenario API/funding/orders/
  transit PASS, gồm rerun books với assert profile; lint/typecheck/build/docs PASS.
  CI của bản sửa phải đối chiếu theo head PR và tab Checks; không suy từ lượt cũ.
- [API CI tại b2bb37b](https://github.com/huangg49/used-book-marketplace/actions/runs/38629217780)
  đã qua Mongo import/failover và647/649E2E; chỉ hai test migration còn kỳ vọng ba
  account thay vì bốn sau0022. Commit subject `test(wallet): verify fee clearing in
  migration upgrades` cập nhật danh sách/count chính xác, thêm assert ID/shape và
  zero balance của fee clearing; giữ toàn bộ snapshot history, finite capital,
  journal/entry/sequence và negative privilege/validator checks. Không đổi source
  ứng dụng/migration/timeout CI. Hai E2E này local2PASS; API lint/typecheck và docs
  PASS. Bảy workflow khác ở b2bb37b PASS; check bản mới theo head PR42.
- [API CI tại8c48627](https://github.com/huangg49/used-book-marketplace/actions/runs/38649179034)
  PASS; bảy workflow xanh, User Web FAIL ở exchange browser: mock403 được bật
  khi detail còn mở, polling5s có thể ẩn link trước khi test điều hướng. Commit
  subject `test(web): isolate exchange denial from detail polling` chỉ bật mock
  sau khi về danh sách Hoàn tất; giữ kiểm tra màn lỗi và không lộ đối tác, cùng
  các ca lost ACK/replay/funding/cancel. Browser API thật/QA Mongo/storage fake
  với `CI=true` local PASS; web lint PASS với bốn warning cũ. Không đổi ứng dụng,
  timeout hay bỏ test; CI bản sửa đối chiếu theo head PR42.
- API CI tại2155e5b cũng PASS. User Web lượt này FAIL ở auction motion fixture:
  VITE API trỏ cùng origin làm Socket.IO đi qua dev proxy quay về chính Vite,
  tạo vòng lặp upgrade và mất trang trong ca fallback. Commit subject
  `test(web): isolate realtime in frontend motion fixtures` mock cả websocket và
  HTTP polling unavailable trong hai fixture thuần frontend; không đổi proxy
  ứng dụng hoặc bộ browser dùng API thật. Auction/auth motion local `CI=true`
  PASS (auth ép proxy cùng origin), không có ws proxy error; web lint/docs PASS.
  Giữ mọi assertion chuyển động/fallback và timeout; remote theo head PR42.
- API có9lint warning cũ, Web bundle warning lớn. Full tạo→pay→credit merchant thật,
  native/human NOT RUN; remote CI theo head PR; không tự giải quyết ReviewRequired hoặc query
  non-success. READINESS không đổi; WIP khác bảo toàn; chưa merge/deploy. Bước tiếp:
  reviewer độc lập cho tiền/quyền và kiểm CI trước khi tích hợp theo TEAMWORK.

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
