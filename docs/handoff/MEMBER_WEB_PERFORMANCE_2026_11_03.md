# Tối ưu Member web — 03/11/2026

Bằng chứng các gói tối ưu trên worktree phát triển, theo source và điều kiện
đo của từng mục. Đây không là nghiệm thu thiết bị thật, human review hoặc
release readiness. Trạng thái tiếp nhận hiện tại ở [SESSION_STATE](SESSION_STATE.md).

## Bỏ đo lại chữ do trạng thái cuộn Lenis

Nhánh `codex/member-web-card-scroll-work`, base `183b457d`.
[Observer chữ](../../apps/user-web/src/lib/card-text-observer.ts) bỏ qua thay đổi
root class nếu chỉ khác sáu class cuộn của Lenis1.3.27: `lenis`,
`lenis-autoToggle`, `lenis-stopped`, `lenis-locked`, `lenis-scrolling`,
`lenis-smooth`. Các class này hiện chỉ điều khiển cuộn/overflow/iframe, không
đổi typography. Đổi kích thước slot vẫn qua ResizeObserver; inline root style,
class khác/kể cả class Lenis chưa biết và font loading vẫn đo lại. Không đổi
thuật toán fit, cỡ chữ tối thiểu, fallback, animation hoặc vật lý Lenis.

Hai production build, Chromium151, 5 cặp luân phiên mỗi viewport. HTTP fixture
48 bài, Search hiển thị20 thẻ; giá luân phiên10.000/50.000/1.000.000đ trong miền
cho phép. Sau font/entrance ổn định, mỗi lượt gồm3 wheel450px và chờ Lenis hết
cuộn. Width390/DPR2/CPU4× và1440/DPR1/CPU1×, đều bật reduced-motion theo policy.

| Trung vị trong3 lần wheel | Trước | Sau |
| --- | ---: | ---: |
| Lượt fit chữ, cả hai viewport | 120 | 0 |
| Desktop: số sự kiện Layout | 991 | 43 |
| Desktop: tổng thời gian Layout | 68,6ms | 6,4ms |
| Desktop: tổng thời gian UpdateLayoutTree | 27,8ms | 14,3ms |
| Viewport390: tổng thời gian Layout | 18,5ms | 17,3ms |
| Viewport390: tổng thời gian UpdateLayoutTree | 62,0ms | 61,0ms |

Cả5 cặp mỗi viewport đều fit120→0. Đích cuộn giữ609px/1215px trong mọi lượt.
Desktop có giá dài phải binary-fit nên tránh nhiều reflow hơn; số đo này không
đại diện mọi giá/card. Hiệu quả viewport390 nhỏ. Input là wheel ở cả hai profile,
không suy thành touch/mobile thật, FPS hay tổng latency cuộn. Probe CDP touch
không làm trang cuộn nên bị loại khỏi evidence hiệu năng. Trace gồm canvas và
UI khác đang chạy; Layout/UpdateLayoutTree là tổng trong khoảng trace.

- Unit observer9 ca và toàn bộ341 unit test PASS. Kiểm tín hiệu thật/giả,
  batch hỗn hợp, class Lenis chưa biết, resize/font, cleanup và callback cũ.
- Bộ [browser chữ](../../apps/user-web/tests/card-text.mjs) bắt bản cũ với60
  lượt fit khi yêu cầu0; bản sửa PASS390/1440px. Giá và geometry giữ nguyên sau
  wheel; đổi class typography, biến inline root, tải FontFace WOFF2 thật và
  resize320/720px vẫn fit hoặc dùng fallback có giới hạn. Không fake font API.
  Chạy lại: `pnpm --filter @used-books/user-web test:card-text:browser`.
- Toàn bộ45 CSS production khớp byte bản trước. Bộ chuyển cảnh5 cấu hình giữ
  ready/440ms/x24px/Back/reduced-motion/fallback; Home focus/leaf pause-resume PASS.
  Đây là kiểm config/hành vi, không chứng minh mọi frame motion khớp pixel.
- Build/tsc, lint exit0 và smoke production chỉ GET API local thật1440/390px
  PASS,0 lỗi JS; luồng Home→Search→trang2→chi tiết→Back. Warning lint/chunk cũ
  ngoài diff; detector observer0 finding. Docs check và diff check PASS.
- Harness,20 trace, JSON, probe bị loại và số đo tại
  `.tmp/member-web-text-performance/`; browser chức năng tại `.tmp/card-text/`.
  Các file này chỉ ở máy hiện tại; test browser/unit mới được đưa vào Git.

Chỉ ở worktree phát triển. Demo local, DB, API/contract và READINESS giữ nguyên.
Thiết bị thật, human acceptance, CI remote chưa chạy.

## Chi phí style khi chuyển từ thẻ sang Chi tiết

Nhánh `codex/member-web-transition-style`, base `8fc33e1f`. Bỏ duy nhất giá trị
mặc định `--book-morph-duration: 440ms` trong selector `:root:has(...)` ở
[BookTransition.css](../../apps/user-web/src/components/BookTransition.css).
Khi chọn thẻ, khai báo này đổi một biến có tính kế thừa trên root, làm cả cây
DOM tính lại style. Các pseudo-element chuyển cảnh đã có fallback 440ms;
nhánh exit 360ms vẫn giữ nguyên. Không đổi keyframe, easing, shadow, bố cục,
đường API hoặc thêm JS runtime. Đây là tối ưu tính style, không giảm motion.

Hai production build, 5 cặp luân phiên ở mỗi viewport, Chromium151, HTTP fixture
48 bài đăng. Tải xuống4Mbps/tải lên0,75Mbps/latency75ms. Mobile390×844/DPR2/
CPU4× dùng chạm; desktop1440×844/DPR1/CPU1× dùng chuột. Tính từ listener click
capture thực đến MutationObserver thấy DOM chi tiết; Playwright chờ selector
nhẹ, không dùng truy vấn accessibility trong khoảng đo. Có trace cho từng lượt.

| Trung vị | Trước | Sau |
| --- | ---: | ---: |
| Mobile: click tới DOM chi tiết | 968ms | 827ms |
| Mobile: thời gian UpdateLayoutTree trong khoảng trace | 271ms | 210ms |
| Mobile: số lượt tính style cho >1.000 phần tử | 2 | 1 |
| Mobile: tổng thời gian các lượt tính style lớn | 164ms | 82ms |
| Desktop: click tới DOM chi tiết | 335ms | 347ms |
| Desktop: thời gian UpdateLayoutTree trong khoảng trace | 25ms | 26ms |

Hiệu quả xác nhận ở mobile giả lập; desktop chưa có cải thiện rõ. Mỗi trace
mobile trước có hai lượt tính style cho khoảng2.000 phần tử, sau còn một lượt
ở cả5 cặp. Mọi lượt của hai build đều có native transition `ready` thành công.
Trace gồm quá trình chuyển cảnh tới `finished`, không là INP/Core Web Vitals
hoặc số đo điện thoại thật. Các mốc giữa các gói khác điều kiện không so trực tiếp.
Probe cùng binary, chỉ gỡ khai báo root lúc chạy, cũng giảm click→DOM 971→706ms;
kết luận chính dùng cặp production build đầy đủ bên trên.

- Build/typecheck, 338 unit test, lint exit0, 5 cấu hình native browser và6 ca
  prefetch PASS. Bộ chuyển cảnh kiểm mở/quay về, x=24px, bìa440ms, viewport
  ổn định, reduced-motion và fallback khi thiếu View Transition API.
- Năm ảnh sau khi chuyển cảnh kết thúc khớp pixel bản trước ở320/390/768/1440px
  và fallback390px; không coi ảnh đứng là kiểm từng frame animation. Đã đối
  chiếu với ảnh layout của gói viewport. Detector có1 cố vấn radius16px cũ ngoài
  diff; lint/build còn warning cũ. Không sửa thiết kế để xóa các cố vấn đó.
- Smoke production qua API local thật, chỉ GET: Home→Search→trang2→chi tiết→
  browser Back PASS1440/390px, 0 lỗi JS. Không ghi DB hoặc gọi GHN. Kiểm này
  không chứng minh mutation/provider khác hoặc human acceptance.
- Harness, JSON, CPU profile chẩn đoán, trace từng cặp và so pixel tại
  `.tmp/member-web-card-performance/`; browser hồi quy ở `.tmp/book-transition/`.
  Các file `.tmp` là evidence local, không được chia sẻ qua Git.

Thiết bị thật, human acceptance và CI remote chưa chạy. Checkout demo vẫn ở
`5bd0b360` với local work, không được áp bản sửa. READINESS giữ nguyên.

## Giữ viewport ổn định khi mở Chi tiết trên mobile — 03/11/2026

Gói từ `8aba79c7` trên nhánh `codex/member-web-touch-performance`.
[BookDetailPage.module.css](../../apps/user-web/src/pages/BookDetailPage.module.css)
giới hạn phần tràn ngang bằng `overflow-x: clip` tại trang chi tiết. Animation
article vẫn bắt đầu ở x=24px, chạy 450ms sau delay 100ms với easing cũ. Trước
sửa, nó vượt padding mobile 20px, tăng layout viewport thêm 4px ngay trong
snapshot và khiến Chromium hủy chuyển cảnh bìa với `InvalidStateError`.
Không thêm JS runtime hoặc đổi cấu hình motion của máy/browser.

- Browser production fixture bắt lỗi bản cũ ở 320px: viewport 320×844 →
  324×855, `ready` thất bại. Bản sửa giữ kích thước và `ready` thành công
  cả chiều mở chi tiết và link về kệ ở 320/390/768/1440px. Giữ bìa 440ms,
  toàn bộ x=24px đầu vào, kiểm reduced-motion và fallback khi không có
  `startViewTransition`. Năm cấu hình PASS, 0 page error; đã xem ảnh 390/1440px.
  Chạy lại bằng `pnpm --filter @used-books/user-web test:book-transition:browser`.
- Chromium 151, 5 cặp production build luân phiên, touch 390px/DPR2/CPU4×,
  4Mbps tải xuống, 0,75Mbps tải lên, latency75ms: chuyển cảnh `ready` 0/5 → 5/5.
  Trung vị click thật tới DOM 714 → 1.045ms; không xác nhận cải thiện tốc độ.
  Để tách ảnh hưởng build/cache, 5 cặp dùng cùng binary và chỉ bật/tắt khai báo
  clip cho kết quả 722 → 725ms, `ready` vẫn 0/5 → 5/5. Cả hai tập số được giữ;
  độ trễ mở trang cần đo tiếp trên thiết bị thật, không suy từ thời gian hoàn
  tất animation vì bản cũ đã bỏ qua hiệu ứng. Harness cũ có chi phí tìm phần
  tử của automation; không coi 4,2–7,3 giây trước đây là input latency thực.
- Build/typecheck, 338 unit test, lint, 6 ca prefetch và smoke production GET
  API local thật 1440/390px PASS. Smoke kiểm Home → Search → trang2 → chi tiết
  → browser Back; 0 lỗi JavaScript. Không ghi DB hoặc gọi GHN.
  Lint exit0 với warning cũ; detector có 8 cố vấn màu ở dòng có sẵn ngoài diff.
- Harness/số đo tại `.tmp/member-web-touch-performance/`, ảnh và kết quả
  browser tại `.tmp/book-transition/`. Fixture HTTP không chứng minh provider
  thật hoặc human acceptance. Gate phát hành theo READINESS giữ nguyên.

Gói chỉ ở worktree phát triển; chưa áp vào checkout demo đang có local work.
Thiết bị thật, human acceptance và CI remote chưa chạy.

## Prefetch mã trang chi tiết theo hover/focus — 03/11/2026

Gói từ `55c9df1d` trên nhánh `codex/member-web-detail-prefetch`. Production
build ghi hint các file JS/CSS của BookDetail cùng phụ thuộc tĩnh. Hover chuột
vào thẻ thật hoặc focus bàn phím vào link chi tiết bắt đầu HTTP prefetch.
File đã có link tải trên trang được dùng lại, link prefetch lỗi được gỡ.
Detail vẫn đọc API mới khi mở. Thao tác chạm và focus wishlist giữ đường hiện có.
[Cách dùng và kiểm tra](../design/UI_COMPONENTS.md#member-web-book-cards-22102026).

- Chromium 151, production HTTP fixture, 5 cặp luân phiên mỗi kiểu thao tác.
  Sau 650 ms hover/focus, trung vị từ bấm tới nội dung chi tiết xuất hiện:
  hover 486 → 327 ms, bàn phím 528 → 360 ms trên desktop 1440px.
  Mạng tải xuống 4 Mbps, tải lên 0,75 Mbps, độ trễ 75 ms.
  Số đo touch 4,2–7,3 giây của harness cũ đã được kiểm lại ở gói viewport
  bên trên: có chi phí automation tìm phần tử, không dùng làm độ trễ click
  thực của app. Desktop trên đây vẫn là kết quả harness của gói này.
- Bộ production browser 6 ca PASS: hover, bàn phím, chạm, tab ẩn, lỗi HTTP
  khi prefetch và thiếu hint. Prefetch có 0 API read; mở trang đọc đúng một
  lần và cập nhật trạng thái Available trên thẻ thành InTransaction từ API.
  Lỗi prefetch vẫn mở được trang khi file phục hồi, Back về đúng danh sách.
- Resource Timing và harness tại `.tmp/member-web-detail-performance/`;
  kiểm chứng hành vi tại `.tmp/book-detail-prefetch/`.
  Đây là số đo phòng thử với HTTP fixture và thời gian chuẩn bị 650 ms.
- Build/typecheck, 338 unit test và lint PASS. Browser Home/focus và 8 ca
  ảnh Search PASS. Smoke production GET API local thật ở 1440/390px PASS,
  0 lỗi JavaScript. Detector BookCard 0 finding. CSS production khớp bản trước.

Gói ở worktree phát triển. Thiết bị thật, human acceptance và CI remote
chưa chạy. Gate phát hành theo READINESS.

## Tải sớm hai bìa đầu khi phân trang Tìm sách — 03/11/2026

Gói từ `d28f7605` trên nhánh `codex/member-web-search-covers`. Khi trang
có cursor trả dữ liệu, Member web lấy link và preload tối đa hai bìa đầu
trong lúc thẻ cũ chạy exit animation. Dùng chung query key, kiểm hạn link
và cache card/detail hiện có. Cặp ảnh này có thể tải trước khi vào viewport.
Trang đầu, sách không có ảnh, dữ liệu preview và tab ẩn giữ đường tải hiện có.

- Chromium 151, production build với HTTP/ảnh fixture, 5 cặp chạy luân phiên
  ở mỗi viewport. Tính từ lúc nhận xong dữ liệu trang 2 đến lúc tải xong
  bìa đầu: desktop 956 → 467 ms, mobile 1.414 → 575 ms. Mobile 390px,
  DPR 2, CPU 4×, tải xuống 4 Mbps, tải lên 0,75 Mbps và độ trễ 75 ms.
  Lượt đầu danh sách desktop 360 → 357 ms, mobile 727 → 694 ms.
- Browser hồi quy kiểm chỉ hai link/ảnh được tải sớm, cache tái sử dụng một
  request ảnh, link lỗi/hết hạn và ảnh lỗi vẫn tải lại được. Tab ẩn trước
  hoặc trong lúc lấy link, trang đầu và sách không ảnh được kiểm riêng.
  Fixture phân trang bổ sung `photos` và `revisionId` theo contract.
- Bộ định nghĩa chuyển cảnh Search và toàn bộ 45 file CSS production khớp
  bản trước. Luồng trang 2 → Chi tiết → Back chạy ở hai viewport.
  Build, typecheck, 338 unit test, lint, 42 ca phân trang, Search recovery
  và smoke GET API local thật PASS. Smoke 1440/390px có 0 lỗi JavaScript.
  Detector Search 0 finding. Bộ ảnh có 8 ca PASS, chạy lại bằng
  `pnpm --filter @used-books/user-web test:search-covers:browser`.
  Số đo và harness tại `.tmp/member-web-search-performance/`, ca ảnh
  tại `.tmp/search-covers/`. Đây là số đo phòng thử với ảnh/HTTP fixture.

Gói ở worktree phát triển. Thiết bị thật, human acceptance và CI remote
chưa chạy. Gate phát hành theo READINESS.

## Vẽ canvas lá rơi trên Member web — 03/11/2026

Gói tiếp theo từ `bbd59568` trên nhánh `codex/member-web-autumn-canvas`.
Home vẫn mô phỏng toàn bộ 24 lá mobile hoặc 42 lá desktop. Canvas chỉ vẽ dải
viewport với 192 px đệm phía trên và dưới, rồi xóa dải đã vẽ ở khung trước. Vòng
`requestAnimationFrame` chỉ lên lịch khi canvas giao với viewport và tab
đang hiển thị. Trở lại tab khi canvas ngoài màn hình vẫn giữ vòng lặp dừng.

- Chromium 151, hai production build và 5 cặp luân phiên ở mỗi viewport.
  Trên mobile 390px, DPR 2 và CPU 4×, trung vị khi cuộn Lenis là
  21,8 → 37,7 khung canvas/giây, p95 khoảng cách khung 71,5 → 53,6 ms.
  Số lá vẽ mỗi khung 24 → 9,2 và vùng xóa giảm 82% (13.672 → 2.457
  hàng pixel cùng chiều rộng). Desktop giữ khoảng 60 khung/giây.
- Đối chiếu 20 ảnh canvas nhìn thấy tại cùng seed và đồng hồ, gồm cuộn nhanh,
  đổi chiều cuộn, đổi kích thước, gió và tái sinh lá. Pixel khớp ở 1440px
  motion thường và 390px reduced-motion. Fixture còn kiểm hủy/lên lịch lại
  đúng một frame khi đổi tab, ngoài viewport và khi unmount.
- Browser Home focus kiểm hồi quy pause/resume trên trang thật với HTTP
  fixture. Smoke production qua API local thật PASS ở 1440/390px với 0 lỗi
  JavaScript và Back giữ trang 2. Build, typecheck, 338 unit test, lint và
  docs check PASS. Detector có 9 cố vấn về bảng màu lá có sẵn ngoài diff.
- Kết quả đo, trace và bộ so pixel tại `.tmp/member-web-canvas-performance/`.
  Số khung canvas đo trong phòng thử, chưa đo trên điện thoại thật.

Gói ở worktree phát triển. Human acceptance và CI remote chưa chạy.
Gate phát hành theo READINESS.

## Tải sớm ảnh chữ Hero trên Member web — 03/11/2026

Gói tiếp theo từ `10fd986d` trên nhánh `codex/member-web-hero-preload`. Browser
trước đây chỉ biết ảnh LCP sau khi React dựng Home. HTML vào app giờ preload
đúng PNG có sẵn khi mở trực tiếp Trang chủ. Điều kiện theo pathname để tránh
tải ảnh Home khi mở thẳng route khác của SPA.

- Hai production build trên Chromium 151, 5 cặp lạnh chạy luân phiên ở mỗi
  viewport. Trên mobile 390px với CPU 4×, tải xuống 4 Mbps và độ trễ 75 ms,
  trung vị bắt đầu tải ảnh 1.423 → 126 ms. LCP Hero 2.752 → 1.472 ms,
  cải thiện ở cả 5 cặp. FCP 1.456 → 1.472 ms. LCP desktop 224 → 148 ms.
  Ảnh PNG 91.425 byte khớp từng byte và mỗi lượt lạnh chỉ có một request ảnh.
- Production fixture PASS phạm vi preload trên Home có query/fragment và
  mở thẳng Search, Auction, Login. Đi từ Search về Home trong SPA vẫn tải
  ảnh qua React. Mô phỏng CSP chặn script inline vẫn render ảnh qua đường này.
  Browser regression Home kiểm thêm phạm vi và tái sử dụng preload.
- Luồng Home → Tìm sách → Trang 2 → Chi tiết → Back chạy ở cả hai viewport
  trước/sau. Canvas lá và View Transition vẫn hoạt động. Ảnh Hero cùng mốc
  animation lệch 19 pixel desktop và 1 pixel mobile, tối đa 1 mức RGB.
  Smoke GET API local thật ở 1440/390px PASS với 0 lỗi JavaScript.
  Build, typecheck, 338 unit test, browser Home focus/Search recovery và
  docs check PASS. Lint exit 0 với warning cũ. Detector HTML 0 finding.
  Trace và kết quả chi tiết tại `.tmp/member-web-hero-performance/`.

Gói ở worktree phát triển. Thiết bị thật, human acceptance và CI remote chưa
chạy. Gate phát hành theo READINESS.

## Font WOFF2 cho Member web — 03/11/2026

Gói tiếp theo từ `62324b47` trên nhánh `codex/member-web-woff2`. Trace Home
cho thấy Be Vietnam Pro 400/700 và Anton 400 tải 444.060 byte TTF lúc mở trang.
Member web ưu tiên WOFF2 từ đúng font nguồn và giữ TTF làm fallback. Snapshot
giấy đăng nhập dùng cùng hai file Be Vietnam Pro WOFF2 với CSS.
[Nguồn và cách sinh file](../../apps/user-web/public/fonts/WEB-SOURCES.md).

- Production build, Chromium 151, 5 cặp lạnh chạy luân phiên ở mỗi viewport.
  Ba font 444.060 → 157.516 byte, giảm 64,5%. Trung vị tải xong font cuối
  trên mobile 390px (CPU 4×, 4 Mbps tải xuống, độ trễ 75 ms) 3.524 → 2.333 ms.
  LCP Hero mobile 2.812 → 2.740 ms, desktop 216 → 232 ms. Hiệu quả rõ nhất
  ở tải font qua mạng giới hạn, số đo LCP phòng thử dao động theo cấu hình.
- Đối chiếu bảng font sau giải nén và 45 mẫu Chromium gồm dấu Việt dựng sẵn,
  dấu tổ hợp và giá tiền. Kích thước chữ và pixel canvas khớp. Chặn cả ba
  WOFF2 thì CSS lấy đủ ba TTF ở 1440/390px. Ảnh Hero tại cùng mốc animation
  lệch 15 pixel desktop và 1 pixel mobile, tối đa 2 mức RGB.
- Browser production fixture qua Home → Tìm sách → Trang 2 → Chi tiết → Back
  ở desktop/mobile trước và sau. Canvas lá và View Transition đều hoạt động.
  Smoke GET API local thật ở 1440/390px PASS với 0 lỗi JavaScript.
  Browser Home focus, Search recovery và Auth motion với login giả lập PASS,
  gồm luồng WebGL và phục hồi khi resize, context loss hoặc capture lỗi.
  Build, typecheck, 338 unit test, lint và docs check PASS. Detector exit 2
  với 9 cảnh báo/cố vấn ở các dòng CSS có sẵn ngoài ba khai báo font đã sửa.
  Trace và kết quả chi tiết tại `.tmp/member-web-font-performance/`.

Gói ở worktree phát triển. Thiết bị thật, human acceptance và CI remote chưa
chạy. Gate phát hành theo READINESS.

## Hiệu năng luồng demo Member web — 03/11/2026

Owner duyệt gói đầu theo luồng Trang chủ → Tìm sách → Trang 2 → Chi tiết → Back.
Nhánh `codex/member-web-demo-performance` từ `0f6e1fbc`. Production trước đó
đóng cả 118 ấn bản xem trước vào JavaScript khởi động. Bản sửa giới hạn dữ liệu
mẫu ở Vite dev và giữ đúng bốn bìa trang trí đã dùng trên banner Home.

- Hai production build trước/sau, Chromium 151, ba lượt mỗi bản ở 1440px và
  390px (CPU 4×, mạng tải xuống 4 Mbps, tải lên 0,75 Mbps, độ trễ 75 ms). HTTP fixture cố định,
  cache lạnh và quay lại có cache. Chunk chính 460.019 → 378.803 byte,
  truyền gzip 128.148 → 115.871 byte. Trung vị thời điểm nhận xong chunk trên
  mobile 957 → 907 ms. LCP Hero desktop 368 → 364 ms và mobile 3.088 → 3.152 ms,
  chưa chứng minh LCP cải thiện ổn định.
- Luồng đầy đủ PASS 12 lượt, canvas lá vẽ khi hiện và View Transition sang chi
  tiết/quay lại đạt ready ở cả hai chế độ motion đã đo. Ảnh Hero trước/sau cùng
  mốc animation chỉ lệch tối đa 4 mức RGB ở 40 pixel desktop và 1 mức ở 8 pixel
  mobile. Back giữ cursor/trang 2. Scroll về đầu theo hành vi có sẵn ở cả hai bản.
- Smoke production build dùng GET qua API local thật PASS ở 1440/390px,
  0 lỗi JavaScript. Build, typecheck và 338 unit test PASS. Lint exit 0 với
  warning ngoài diff. Detector 0 finding, browser Home focus, Search recovery
  và 42 ca màn hình/viewport phân trang PASS. Trace, harness và kết quả cục bộ
  tại `.tmp/member-web-performance/`.

Gói này ở worktree phát triển. Checkout Documents, cơ sở dữ liệu demo và
READINESS được giữ nguyên. Thiết bị mobile thật, human acceptance và CI remote
chưa chạy cho gói này.
