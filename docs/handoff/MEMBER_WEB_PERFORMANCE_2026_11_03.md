# Tối ưu Member web — 03/11/2026

Bằng chứng các gói tối ưu trên worktree phát triển, theo source và điều kiện
đo của từng mục. Đây không là nghiệm thu thiết bị thật, human review hoặc
release readiness. Trạng thái tiếp nhận hiện tại ở [SESSION_STATE](SESSION_STATE.md).

## Dừng timer đếm ngược đã hết hạn — 04/11/2026

Nhánh `codex/member-web-expired-countdown-timers`, base `e1eafee0`.
`useCountdown` cũ luôn tạo interval 1 giây khi có endAt, kể cả deadline đã
qua; sau khi đếm về 0 vẫn tiếp tục callback. MyAuctions mỗi hàng có đồng hồ
start/end/payment nên riêng thời điểm mở đã qua vẫn giữ timer chạy thừa.

[Controller clock](../../apps/user-web/src/lib/server-countdown.ts) giữ offset
server và cách tính thời gian còn lại theo Date.now, nhịp 1 giây và tick đầu.
Không tạo interval cho mốc đã hết hạn; tự clear khi tick đạt 0. Hook vẫn dọn
khi unmount/đổi props và tạo lại khi có endAt/serverTime mới. Không đổi format,
polling, quyền mở/đóng phiên, command hoặc deadline nghiệp vụ; không suy trạng
thái server từ timer. Không đổi hành vi khi hook không được cấp endAt.

[Production browser fixture](../../apps/user-web/tests/expired-countdown.mjs)
PASS trước/sau, 390/1440 × 8 hàng còn hạn/đã kết thúc ở `/my-auctions` (Tất cả).
Đồng hồ máy cố ý lệch server 10 ngày; mọi API là HTTP fixture, socket bị chặn.

| 8 hàng / cửa sổ đo 2 giây | Timer trước → sau | Callback trước → sau |
| --- | --- | --- |
| Phiên đang mở, startAt đã qua | 16 → 8 | 32 → 16 |
| Mọi phiên đã kết thúc | 16 → 0 | 32 → 0 |
| Phiên vừa đếm hết hạn | 16 → 0 timer còn giữ | Không tiếp tục tick 0 |

UI còn hạn vẫn đếm đúng 00:03 sau 2 giây, về hết hạn như trước; timer không
fetch hoặc ghi dữ liệu (mỗi ca chỉ 1 GET my-auctions trong cửa sổ đo). Back
dọn toàn bộ timer countdown. Đây là đo số timer/callback bằng browser clock,
không là đo CPU, FPS, thời lượng pin, LCP hoặc INP trên thiết bị thật.

- 7 unit mới kiểm offset, mốc đã qua/bằng hiện tại, cutoff, cleanup, không có
  serverTime, tab trễ và deadline mới sau expiry; tổng 361 unit/51 file PASS.
- Auction countdown browser 390/1440 PASS mốc giờ/0, scheduled không tự mở,
  server cập nhật deadline/giá, pagination/cleanup và motion giá 500ms dưới
  reduced-motion. PointOrder 12 ca và topup 8 ca browser PASS lại vì dùng chung
  hook; không chạy provider/DB thật.
- Build/typecheck, scoped lint/detector `[]` PASS. Đã xem ảnh MyAuctions mobile/
  desktop; 47 CSS production khớp byte, không đổi DOM/class/asset/animation.

Evidence `.tmp/member-web-expired-countdown/`, `.tmp/auction-countdown/` và
evidence browser PointOrder/topup hiện có. Native/thiết bị thật, API/DB/provider,
human acceptance và remote CI NOT RUN; READINESS và checkout demo giữ nguyên.
Vòng kiểm tra popup Wallet khi không có popup và cooldown form hết hạn còn là
ứng viên cần đo riêng, chưa suy PASS từ gói countdown này.

## Làm mới view ví sau ACK thanh toán PointOrder — 04/11/2026

Nhánh `codex/member-web-point-order-wallet-cache`, base `450e0dd3`.
Build base tái hiện: từ Ví mở phiên đã thắng, thanh toán PointOrder qua HTTP
fixture rồi mở menu/Back về Ví trong staleTime; available vẫn 100.000 dù
fixture server đã là 50.000 và giữ giao dịch 50.000. Cả SelfCollect và
CarrierOutbound đều gặp. Các callback trước chỉ refresh auction/participation/
point-order, không invalidate view ví.

[WinnerPanel](../../apps/user-web/src/pages/AuctionDetailPage.tsx) nhận owner ID
từ session ở parent và dùng helper ví ngay sau ACK `payPointOrder`. Actor cũ
được helper từ chối theo kiểm tra hiện có. Không set tiền hoặc gọi helper trong
finally/error. Không đổi payload/key/version/địa chỉ/phí, command, điều kiện
thanh toán hoặc xử lý lost ACK. Contract pay PointOrder và ADR0044 giữ nguyên.
Theo [ADR0071](../adr/0071-auction-bid-balance-check.md), bid/Auto/BuyNow chỉ
kiểm cam kết, không giữ tiền; không gắn invalidation mới vào các lệnh đó.

| Vai trò / entry | Điều kiện / kết quả | Nơi xem / bước tiếp |
| --- | --- | --- |
| Member thắng phiên → SelfCollect → Thanh toán | ACK pay, Order thành Fulfilling theo response fixture | Menu/Back về Ví đọc available và khoản giữ server mới |
| Member thắng phiên → CarrierOutbound → Thanh toán | Giữ address ID/version và phí đã xem; fixture phí 0 | Cùng view ví; không đổi lựa chọn giao nhận sau trả tiền |
| Member → retry sau mất ACK | Khóa lựa chọn, giữ key/body/version/address/fee | Chỉ ACK retry làm stale ví; không suy thành công từ lần lỗi |
| Pay pending / bị 409 từ chối | Không invalidate ví từ kết quả chưa xác nhận | Giữ xử lý lỗi và cho phép intent mới như source cũ |

[Browser fixture](../../apps/user-web/tests/point-order-wallet-cache.mjs) PASS
12 ca trước/sau: 390/1440 × SelfCollect/CarrierOutbound × success/reject/lost ACK.
Date cố định để cache không tự hết hạn, timers/motion chạy bình thường. Chặn
socket và mọi external traffic; mọi HTTP API được fulfill bằng dữ liệu giả.
Sau sửa menu/Back nhận available 50.000 và khoản giữ 50.000; pending/reject/
unknown chưa có wallet read thêm. Recovery giữ nguyên request; definitive
rejection nhả intent cũ. Kiểm payload giao nhận và addressVersion7/phí0;
không là kiểm phí khác 0, giao nhận hoặc ledger thật. Không page error.

- Build/typecheck, 354 unit/50 file, scoped lint và detector `[]` PASS.
  Helper unit hiện có kiểm owner/family và read trước ACK trả muộn.
- Đã xem ảnh Ví 390/1440. Cả 47 CSS production khớp byte; không đổi DOM/class,
  asset, timing hoặc animation. Prop owner mới không render nội dung mới.
- GET ví trong hành trình mobile 1→2, desktop 2→4 do cần đọc lại các view đã
  cache. Đây là sửa độ đúng cache; không tuyên bố giảm request hoặc cải thiện LCP/INP.

Evidence `.tmp/member-web-point-order-wallet-cache/`. Không chạy API/DB/provider,
carrier/worker/settlement thật, native/thiết bị thật, human acceptance hoặc remote
CI. READINESS và checkout demo giữ nguyên; không đóng gate giao nhận sau F2h.
Gói này chỉ xác nhận ACK pay, không suy mọi thay đổi tiền bất đồng bộ từ worker
đã được nối. Timer hết hạn được kiểm riêng ở mục mới phía trên; vòng kiểm tra
popup Wallet chưa được tối ưu bởi gói ACK này.

## Làm mới view ví sau lệnh đơn hàng / quan sát Completed — 04/11/2026

Nhánh `codex/member-web-order-wallet-cache`, base `ac71b6dc`.
Build base tái hiện trong hành trình thật của client `/orders/:id` → đúng
`/chat/:roomId`: sau thanh toán, hoặc polling thấy Completed phía người bán,
menu tài khoản vẫn dùng available cũ trong staleTime. Back về Ví vốn đã đọc
đúng số mới; không coi đây là lỗi toàn bộ màn Ví. Key mini/cashflow chưa được
invalidate bởi controller OrderDetails.

[OrderDetails](../../apps/user-web/src/pages/OrderDetails.tsx) dùng helper ví
chung sau ACK pay/cancel, trước khi chờ refetch chi tiết đơn; bỏ ba prefix ví
cũ trong vòng invalidate phía sau. Effect quan sát Completed dùng cùng helper.
Chỉ đánh dấu stale/đọc lại dữ liệu server theo owner; không tính tiền tại client,
không đổi command/key/body/version, eligibility, state, ledger hoặc nghiệp vụ.
Giữ mọi invalidation ngoài ví và đường lỗi/recovery hiện có.

| Vai trò / entry | Điều kiện / kết quả | Nơi xem / bước tiếp |
| --- | --- | --- |
| Buyer → đơn hàng trong hội thoại → Thanh toán | Chỉ sau API ACK | Mở menu hoặc Back về Ví để đọc số dư server mới |
| Buyer → Hủy đơn chưa thanh toán | ACK hủy, số dư không đổi trong fixture | Không suy đã hoàn tiền hoặc cho phép hủy đơn đã nhận |
| Buyer → Thử lại thanh toán sau mất ACK | Cùng key/body/version cũ | Chỉ ACK retry làm stale ví; reject/pending không refresh tiền |
| Buyer/Seller → đơn đang mở → polling Completed | Quan sát trạng thái API đã có sẵn | Các view ví stale; buyer kiểm khoản giữ, seller đọc available mới |

[Production browser fixture](../../apps/user-web/tests/order-wallet-cache.mjs)
PASS trước/sau 12 ca: 390/1440 × pay, reject rồi pay, lost ACK/retry, cancel
chưa trả tiền, Completed buyer và seller. Cache age đóng băng, timers/motion
giữ nguyên. Desktop menu sau sửa đọc available server mới; buyer Completed
không tự tăng available và main card nhận khoản giữ 0. Không command trong ca
polling Completed. Retry mất ACK giữ nguyên request; definitive rejection cho
phép intent mới theo cơ chế cũ. Không page error. Mọi API là HTTP fixture,
socket bị chặn; không dùng worker/settlement/DB hoặc gọi dịch vụ thật.

Suite hồi quy [order/chat workspace](../../apps/user-web/tests/order-chat-workspace.mjs)
lần đầu FAIL vì fixture còn `/messages`/query key `purchase-messages`, thiếu
`/messages/history` mà source chat đang gọi. Sửa fixture thêm response page
`items/olderCursor` và dùng key `purchase-message-history` cho ca lỗi lịch sử;
giữ mọi assertion. Chạy lại PASS: buyer/seller eligibility, private details,
403 che cache, 503 giữ dữ liệu, liên kết đúng phòng, message/shipping/pay/cancel
lost-response retry, nháp và mobile 320/390 chữ 130%. Suite này dùng HTTP và
Socket.IO giả riêng; không là bằng chứng provider/chat server thật.

- Build/typecheck, 354 unit/50 file, scoped lint và detector `[]` PASS.
  Helper unit hiện có kiểm owner/family và bỏ read trước ACK về muộn.
- Đã xem ảnh desktop và mobile 390 chữ 130% của hành trình Order/chat mới chạy.
  Cả 47 CSS production khớp byte trước/sau; không đổi markup/class/asset/motion.
- Desktop hành trình có 3→4 GET wallet vì mini phải đọc lại khi mở; mobile
  giữ 2. Đây là sửa độ đúng cache, không là giảm request hoặc nghiệm thu tiền.

Evidence `.tmp/member-web-order-wallet-cache/`, `.tmp/order-chat-workspace-qa/`.
Node24.22.1/pnpm11.19.0. Không thay READINESS hoặc checkout demo. API/DB/provider
thật, native/thiết bị thật, human acceptance và remote CI NOT RUN.
ACK pay PointOrder được kiểm riêng ở mục mới phía trên; ADR0071 xác nhận bid
không giữ tiền, nên không suy mọi thao tác đấu giá đều thay đổi số dư ví.

## Làm mới các view sau khi nạp ví được ghi có — 04/11/2026

Nhánh `codex/member-web-wallet-credit-cache`, base `9a86b8e9`.
Build base tái hiện trên desktop: trang Ví nhận 125.000 sau kết quả topup
`credited: true`, nhưng mở lại menu tài khoản trong staleTime vẫn hiện
100.000. Cả đường return `?topup=…` và checkout từ Ví đều bỏ sót family
`member-wallet-mini`; dashboard cashflow dùng family history riêng cũng
không được đánh dấu stale. Không suy số dư mới từ callback trình duyệt.

[WalletPage](../../apps/user-web/src/pages/WalletPage.tsx) dùng lại
[helper ví](../../apps/user-web/src/lib/wallet-cache.ts) ở đúng hai effect
`credited`/`checkoutCredited` hiện có. Helper kiểm owner hiện tại, đánh dấu
stale các view và đọc lại server khi cần; không set số tiền hoặc sửa state
topup. Giữ polling, popup allowlist, intent/key, request, receipt và retry.
SRS FR-W01/W02 và contract topup/summary giữ nguyên.

| Vai trò / entry | Điều kiện / kết quả | Nơi xem / bước tiếp |
| --- | --- | --- |
| Member → Ví → Nạp tiền VNPay | API xác nhận topup `credited: true` | Trang Ví và mở lại menu nhận số dư server mới |
| Member → quay về `/wallet?topup=…` | Cùng điều kiện ghi có, không tin query URL | Xem số dư; các history view stale đọc lại khi mở |
| Topup pending hoặc `Succeeded` nhưng `credited: false` | Không suy đã ghi có, không invalidate ví | Giữ số dư từ server đã đọc; không sửa quy tắc xử lý topup |

[Browser fixture](../../apps/user-web/tests/wallet-credit-cache.mjs) chạy
build production, login/session thật phía client, mọi HTTP API là dữ liệu giả.
8 ca PASS trước/sau: 390/1440 × return/checkout × credited true/false.
Freeze Date để cache không tự hết hạn, giữ timers/animation; chỉ ca có ghi
có mới làm mới ví. Main card vốn đúng ở base; lỗi menu chỉ tái hiện ở desktop
có menu này. Mobile kiểm không hồi quy. Không page error. Context chặn mọi
external request: destination VNPay allowlist được fulfill bằng HTML fixture,
không gọi VNPay Sandbox, provider, API hoặc DB thật.

- Build/typecheck, 354 unit/50 file, scoped lint và detector `[]` PASS.
  Unit helper hiện có kiểm family/owner và read trước ACK trả muộn.
- Wallet layout browser PASS 320/390/768/1440 và 390 chữ 125%; focus dialog,
  filter, action và sheen đủ 8 giây với reduced-motion vẫn giữ nguyên.
  Cả 47 CSS production khớp byte; không đổi markup/class/timing/asset/animation.
- Request thêm đúng ở mini view cần số dư mới: desktop return 3→4 và checkout
  4→5 GET wallet trong cả hành trình; mobile giữ 2/3. Các ca chưa ghi có không
  tăng read. Đây là sửa cache đúng, không là giảm request hoặc chứng minh ledger.

Evidence `.tmp/member-web-wallet-credit-cache/`. Native, thiết bị thật,
provider/DB/API integration, human acceptance và remote CI NOT RUN.
READINESS và checkout demo giữ nguyên. Order được kiểm riêng ở mục mới phía trên.

## Làm mới view ví sau ACK trao đổi — 04/11/2026

Nhánh `codex/member-web-exchange-wallet-cache`, base `19950968`.
Lỗi đã tái hiện trên build base: từ Ví sang Exchange legacy, xác nhận funding
bằng HTTP fixture rồi mở lại menu tài khoản hoặc Back về Ví trong staleTime.
API fixture đã trả available 50.000 nhưng UI vẫn dùng cache 100.000. Callback
cũ chỉ invalidate prefix `wallet`, trong khi view dùng `wallet-summary`,
`member-wallet-mini` và các key history khác. Retry sau mất ACK không đi lại
callback onFund nên chỉ sửa callback đó sẽ chưa đủ.

[Service Exchange](../../apps/user-web/src/services/exchange.ts) hiện gọi
[helper ví](../../apps/user-web/src/lib/wallet-cache.ts) sau Promise ACK của
command/retry. Helper chỉ invalidate đúng owner hiện tại và các flat key legacy
exact; không set dữ liệu/số dư. Query đang đọc trước ACK được thay bằng lượt
đọc sau ACK; view inactive đánh dấu stale và đọc lại khi trở về. Bỏ invalidate
prefix cũ ở page để không có đường cập nhật khác cho retry hoặc gửi chat.
Không đổi backend, contract, body/key/version, receipt, ledger, hold hoặc nghiệp vụ.

| Vai trò / entry | Kết quả được xác nhận | Nơi xem tiếp |
| --- | --- | --- |
| Member → Exchange legacy → funding | Command client nhận ACK thuộc phiên hiện tại | Menu ví hoặc Back về Ví đọc số dư server mới |
| Member → khôi phục thao tác → retry | Giữ nguyên key/body; chỉ ACK mới làm stale cache | Cùng các view ví, không cần gửi funding mới |
| Lệnh đang chờ/bị từ chối hoặc phiên đã đổi | Không làm mới ví theo kết quả chưa xác nhận/actor cũ | Giữ error/recovery và xác nhận hiện có |

[Production browser](../../apps/user-web/tests/exchange-wallet-cache.mjs)
390×900/1440×900, reduced-motion bật, Date cố định để không hết staleTime;
route/command client thật và HTTP fixture cho mọi API. Sáu cấu hình PASS:
ACK thường, definitive rejection rồi thành công, lost ACK rồi retry. Base
đều giữ tiền cũ; sau sửa đều nhận tiền mới ở view đã đi qua. Khi pending/error
không có wallet read thêm; retry giữ key/body. Không page error. Mọi số tiền
trong test là dữ liệu tổng hợp, không có thanh toán hay ledger thật.

- Unit kiểm đúng family/owner, không đổi cached money, bỏ actor cũ/guest và
  read trước ACK về muộn không ghi đè read mới. Service unit kiểm late command
  response sau đổi account và chỉ invalidate sau ACK/recovery thành công.
- Build/typecheck, 354 unit test/50 file, lint, detector `[]` PASS. Đã xem ảnh
  ví 390/1440; cả 47 CSS production khớp byte. Không đổi class/variant/timing/asset.
- Đây là sửa tính đúng của cache, không là giảm request: GET đọc lại là cần
  thiết sau ACK. Không nghiệm thu ledger/settlement, API/DB/provider thật,
  native, thiết bị thật, human acceptance hoặc remote CI. READINESS và demo
  checkout giữ nguyên. Evidence `.tmp/member-web-exchange-wallet-cache/`.

Ca Exchange không chứng minh mọi nguồn ACK khác đã nối: nạp ví và Order được
kiểm riêng ở các mục mới phía trên; PointOrder chưa được suy PASS.

## Khôi phục avatar sau khi URL được cấp lại

Nhánh `codex/member-web-avatar-url-recovery`, base `901383dd`.
[Hook avatar](../../apps/user-web/src/hooks/useCurrentMemberAvatar.ts) trước đây
giữ failedAvatarId. Ảnh từng lỗi thì Header/Sidebar luôn hiện chữ cái, kể cả
khi query đã nhận URL hợp lệ mới cho cùng avatar. Đây là sửa lỗi liên quan
ảnh/cache, không phải tuyên bố tăng tốc hay giảm request.

Giữ failure theo owner/avatar/URL. URL mới không bị chặn bởi lỗi của URL cũ;
URL lỗi không đổi vẫn dùng fallback, tránh vòng onError/render/tải lại.
Không đổi query key, staleTime 60 s, lịch refetch, API hay cách cấp quyền/URL.

[Browser production](../../apps/user-web/tests/avatar-recovery.mjs) dùng login
và Header/Sidebar thật, HTTP fixture chặn mọi API; 390×900 và 1440×900,
reduced-motion bật. Clock giả tiến hai lần 61 s rồi phát visibilitychange:

- Base: ảnh 404 về initials; cùng URL không bị tải lặp. URL mới cho cùng
  avatar vẫn không xuất hiện ở cả hai hook consumer, lỗi đã tái hiện.
- Sau: hai ảnh nhận URL mới, decode thành công; mở disclosure mobile thấy
  avatar. Mỗi cấu hình vẫn ba lượt xin URL (ban đầu, refetch URL lỗi cũ,
  refetch URL mới), không tăng so với base. Không page error.
- Build/typecheck, 349 unit test, lint và detector `[]` PASS. Profile-reputation
  fixture PASS 1440/1000/390/320 và chữ 130%, stale503,404/retry, guard nháp,
  cache public/summary và phản hồi muộn sau đổi account; không mutation hồ sơ/
  đánh giá hoặc DB/provider. Đã xem ảnh QA; cả 47 CSS production khớp byte.
- Không sửa class/variant/timing/asset. Evidence `.tmp/member-web-avatar-recovery/`.
  Clock/HTTP fixture không chứng minh thời gian hay refresh token thật. Thiết bị/
  provider/API thật, native, human acceptance và remote CI NOT RUN. Giữ READINESS
  và local work checkout demo.

## Đánh giá tách route Home — không áp dụng

Nhánh đánh giá `codex/member-web-home-route-loading`, base `b5b36d22`.
Thử lazy Home và tải sớm graph JS/CSS chỉ khi mở `/`; thử thêm cách chờ CSS
đã có trong head để Home không mount thiếu style. Không sửa source/CSS/motion
của Home. Browser thử nghiệm PASS 390/1440 cho Login → Home, Back/Forward,
giữ canvas/loop, giữ Home tới khi CSS sẵn sàng, lỗi JS/CSS và reload phục hồi.

Đo cuối cùng: 5 cặp xen kẽ cho mỗi route, Chromium 390×844/DPR2, CPU4×,
500.000 B/s xuống, trễ 80 ms, context/cache mới; static JS/CSS/HTML gzip.
CDP Fetch trả fixture cho mọi request API trước network, không tắt cache static.
20 lượt đã xác nhận intercept API; LCP Home cùng là `hero-lettering.webp`.

| Trung vị đo cách ly | Base | Ứng viên |
| --- | ---: | ---: |
| Home có DOM nội dung | 1,593 s | 1,587 s |
| Home LCP | 1,648 s | 1,664 s |
| Home JS/CSS truyền | 297.037 B / 31 file | 300.527 B / 36 file |
| Login có DOM form | 1,699 s | 1,448 s |
| Login LCP | 1,988 s | 1,720 s |
| Login JS/CSS truyền | 455.592 B / 46 file | 409.970 B / 35 file |

Login giảm tải nhưng Home thêm file/byte và chưa có cải thiện ổn định. FCP
nhanh hơn ở ứng viên có thể là RoutePending, không chứng minh Hero sẵn sàng.
Chưa chứng minh lợi ích cho toàn luồng Login → Home với animation thành công.
Giữ Home nguyên trạng cho demo; không áp dụng thay đổi route hoặc Vite này.

Các lượt đo sơ bộ **không dùng để kết luận**: harness ban đầu chưa intercept
đầy đủ base API trong bundle; request public read có thể đi tới loopback API.
Không có command đăng nhập/DB/provider ở những lượt đo đó. Đã sửa harness và
đo lại với API fixture ở request stage. Các file sơ bộ được đánh dấu invalid
trong `.tmp/member-web-home-route/measurement-status.json`; báo cáo hợp lệ là
`isolated-measure.json`. Bản dựng trước/sau và source thử giữ riêng trong `.tmp/`.

Đã khôi phục hai file tracked đúng byte từ base, chuyển hai file thử mới vào
`.tmp/`; git xác nhận source/config/package không có diff. Build sau khôi phục
PASS, HTML production khớp base. Chỉ tài liệu đánh giá được lưu vào Git.
Không phải kết luận Home đạt Web Vitals trên thiết bị thật hoặc toàn web đã tối ưu.

## Xin link bìa riêng khi tới gần kệ đang đọc

Nhánh `codex/member-web-owner-photo-visibility`, base `6c5751f8`.
[OwnerListingRow](../../apps/user-web/src/components/OwnerListingRow.tsx) và
[DashboardMyBooks](../../apps/user-web/src/pages/profile/components/DashboardMyBooks.tsx)
chỉ bắt đầu xin link bìa khi frame gần viewport 200 px. Tùy chọn `once` của
[hook dùng chung](../../apps/user-web/src/hooks/useNearViewport.ts) giữ activation
sau lần đầu: rời/quay lại không đổi enabled của query đã đọc. Không có observer
thì fallback tải như trước. Giữ staleTime/refetch policy hiện có, không đổi TTL.

[Query ảnh](../../apps/user-web/src/lib/owner-listing-queries.ts) giữ key đầy đủ
owner/listing/revision/media của Owner row, dùng cùng key cho kệ Tổng quan.
Giữ đúng signed URL, không bỏ quyền tại API hoặc dùng URL của người khác.
Unit kiểm dùng chung giữa hai consumer và tách owner/revision; guest hoặc không
có media không được tự đọc. Không đổi API/contract/session hay màn sửa ảnh.

[Browser production](../../apps/user-web/tests/owner-photo-visibility.mjs),
Chromium 390×900 và 1440×900, reduced-motion bật, dữ liệu/ảnh HTTP fixture.
Build base lưu riêng; số dưới đây chỉ đếm GET media/read của ảnh riêng:

| Lúc mới mở trang | Trước | Sau |
| --- | ---: | ---: |
| Kệ sách, danh sách 390 px | 20 | 1 |
| Kệ sách, danh sách 1440 px | 20 | 3 |
| Kệ Tổng quan dưới viewport, 390/1440 px | 8 | 0 |

- Lưới 1440 sau sửa xin 8/20 bìa gần viewport; cuộn tới cuối tải đúng bìa cuối.
  Thiếu observer tải đủ 20. Quay lại hàng đã đọc, kể cả sau 16 s vượt staleTime
  mặc định, không tự ký lại. Từ Tổng quan sang kệ đầy đủ và Back dùng lại cache.
- Giữ hover scale 1,04 của row, 1,06 của grid và 1,05 của Dashboard, đã đo trên
  browser với reduced-motion. Đã xem ảnh QA 390/1440. Không đổi CSS/asset;
  47 CSS production vẫn khớp byte. Dashboard có thêm frame DOM ổn định để observe.
- Phát hiện lỗi cũ: ảnh Tổng quan tải 404 sau khi xin link thành công thì ảnh
  vỡ, không có retry. Tái hiện trên base; thêm onError theo URL và retry xin link
  mới, giữ frame. Browser kiểm cả lỗi xin link và lỗi tải ảnh ở hai consumer.
- Build/typecheck, 349 unit test/49 file, lint và detector `[]` PASS. Hồi quy
  search-covers (8 ca) và auction-photo-visibility PASS, gồm hidden, expired,
  fallback và cleanup/Back; consumer mặc định của hook không đổi sang `once`.
  Evidence `.tmp/member-web-owner-photo-visibility/`. Chưa đo CPU/pin/FPS,
  Web Vitals, ảnh provider thật, API/DB thật, native, thiết bị thật, human acceptance
  hoặc remote CI. READINESS và checkout demo giữ nguyên.

Phương án đã loại: thử nén lossless ảnh lời chào bằng Sharp. PNG gốc 1.040.797 B;
PNG thử 2.038.554 B, WebP lossless thử 1.244.560 B, RGBA khớp nhưng dung lượng
lớn hơn. Không thay ảnh gốc; evidence riêng `.tmp/member-web-greeting-image/`.

## Dùng chung bản xem trước thông báo trên Tổng quan

Nhánh `codex/member-web-shared-notification-preview`, base `5bbe9685`.
[notificationPreviewQuery](../../apps/user-web/src/services/notifications.ts)
dùng cùng key theo owner và trang đầu 8 mục cho chuông, sidebar, lời chào và
[hoạt động](../../apps/user-web/src/pages/profile/components/DashboardLiveAuctions.tsx).
Trước đó là ba query đọc 8/1/4 mục; query 1 mục đã dùng chung giữa sidebar và
lời chào. Sau sửa hoạt động vẫn lấy bốn mục đầu, danh sách con vẫn ba link.
Chuông giữ poll 30 s và refetch khi mở; không thêm poll ở consumer khác.
Giữ staleTime 30 s của summary, mặc định chung ở nơi còn lại. Infinite inbox
giữ key/cursor riêng, không dùng mảng preview thay cho dữ liệu phân trang.

Production Chromium fixture 390×900 và 1440×900, reduced-motion bật, từ
login UI và route `/account`. [Harness](../../apps/user-web/tests/notification-preview.mjs)
so sánh build base đã lưu với build sau sửa, không chạy API hoặc DB:

| Lần đọc notification ban đầu | Trước | Sau |
| --- | ---: | ---: |
| Request | 3 | 1 |
| Mục truyền qua các response | 13 | 8 |
| JSON fixture chưa nén | 3.482 B | 2.101 B |

Giảm 66,7% request và 39,7% JSON của riêng preview trong fixture. Không suy
ra tỷ lệ cho API thật, toàn trang, CPU/FPS hoặc Web Vitals.

Lỗi liên quan FR-N04 đã tái hiện ở base: link Support được dựng thành
`/auctions/:id`; các link Order/Exchange cũng dùng cùng hàm đấu giá.
Đã dùng `notificationPath` có sẵn cho cả card và list. Cảnh báo outbid chỉ
theo `kind=AuctionOutbid` và target Auction, không đoán từ chữ “trả giá”.
Card thường dùng nhãn thông báo/cập nhật, không khẳng định phiên LIVE từ
notification. Link xem tất cả bỏ số lượng preview dễ bị hiểu là tổng hộp thư.

| Vai trò / entry | Lệnh và kết quả | Bước tiếp |
| --- | --- | --- |
| Member → Tổng quan / chuông | GET trang đầu theo phiên; count và preview chung | Xem tối đa 8 mục; hoạt động dùng 4 mục đầu |
| Member → mục hoạt động | Lệnh đánh dấu đã đọc hiện có, invalidate preview; mở đúng target type/ID | Trang đích tự đọc quyền/state; Back về Tổng quan |
| Member → Xem thông báo | GET inbox phân trang riêng | Giữ cursor/filter và retry hiện có |

- Browser PASS: guest không đọc preview; một invalidation cập nhật mọi vùng
  sau đọc một mục/đọc tất cả; command lỗi không giả ACK, lỗi GET có retry;
  mở Support và Back, link Order/Exchange/Auction đúng; inbox đọc limit 30.
  Logout/login tài khoản thứ hai trong cùng SPA không lộ notice cũ. Tiêu đề
  Support có chữ “trả giá” không thành cảnh báo outbid. Kiểm poll 30 s riêng.
- Build/typecheck, 348 unit test/49 file, lint và hồi quy dashboard-chunk PASS.
  Detector exit 0, một advisory `animate-bounce` có từ trước ở lời chào;
  giữ theo chính sách motion owner. Cả 47 CSS production khớp byte với base.
  Không đổi variant/timing hay asset. Ảnh QA ở `.tmp/member-web-notification-preview/`.
- Source API/contract/session không đổi. Fixture trang đích trả lỗi read có
  kiểm soát, không là nghiệm thu Support/Order/Exchange thật. API thật, DB,
  thiết bị thật, native, human acceptance và remote CI NOT RUN. Giữ READINESS
  và local work ở checkout demo.

## Chỉ chạy vòng Lenis khi đang cuộn mượt

Nhánh `codex/member-web-demand-scroll`, base `598689fe`.
[Hook cuộn](../../apps/user-web/src/hooks/useSmoothScroll.ts) trước đây gọi
Lenis mỗi frame kể cả lúc đứng yên. [DemandScroll](../../apps/user-web/src/lib/demand-scroll.ts)
giữ nguyên Lenis và thông số duration 1,15 s, easing, wheel 0,9/touch 1,5.
Lệnh `scrollTo` (gồm đường wheel nội bộ của Lenis) đánh thức vòng frame;
kết thúc hoặc chuyển sang cuộn native thì dừng. Khi thức lại, đặt mốc thời
gian mới để thời gian đứng yên không làm animation nhảy tới cuối. Cleanup
hủy frame, kể cả callback cũ hoặc lệnh mới từ callback hoàn tất.

Phát hiện thêm lỗi motion: Lenis đang cài mặc định `respectReducedMotion: true`.
Ở source base, bật preference này khiến cuộn tới anchor thành tức thời và
wheel mất nội suy. Đặt rõ `false` theo chính sách owner trong AGENTS;
không thay preference máy hay cắt animation. CSS, hình ảnh và motion khác giữ nguyên.

[Browser fixture](../../apps/user-web/tests/smooth-scroll.mjs) dùng hook thật,
Lenis thật và StrictMode trên surface định tuyến tối giản, Chromium 390×844
(touch/mobile mô phỏng) và 1440×844, cả `reduce`/`no-preference`. Base đọc bằng
`git show 598689fe`; đếm riêng lời gọi `lenis.raf`, không đếm mọi animation trang.

| Cửa sổ đứng yên 1 giây | Trước | Sau |
| --- | ---: | ---: |
| Sau mount | 60–61 | 0 |
| Sau wheel hoàn tất | 60–61 | 0 |
| Sau anchor hoàn tất | 60–61 | 0 |

- Sau sửa: wheel 600 tới 540 px, anchor tới 1800 px; có vị trí trung gian
  ở 40–250 ms dưới cả hai preference. Giữ stop/start khi modal mở, nested
  scroll, PageDown, pan qua CDP touch trên mobile, đổi route/Back khi đang
  cuộn và thức lại sau idle. Chat/order room giải phóng Lenis. Không page error.
- Production browser PASS card-text 390/1440 (0 lượt fit lại chữ do wheel),
  search-recovery 9 ca (gồm filter/scroll lock) và book-transition 320/390/768/1440
  cùng fallback thiếu View Transition; chuyển động 0,44 s vẫn chạy. Đã xem ảnh
  chi tiết 390/1440. Không đổi CSS hoặc asset hình/font.
- Build/typecheck, 346 unit test/49 file (5 ca lifecycle mới), lint và detector
  PASS; lint còn cảnh báo cũ. Node 24.22.1, pnpm 11.19.0. Evidence local
  `.tmp/member-web-smooth-scroll/` và `.tmp/smooth-scroll-*.log`.
- Đây là giảm lượt xử lý idle, chưa đo mức giảm CPU/pin, FPS hoặc Web Vitals.
  Fixture không dùng backend/DB; API thật, thiết bị thật, native, human acceptance
  và remote CI NOT RUN. Không đổi READINESS hay checkout demo.

## Tải ảnh nền Auth theo kích thước màn hình

Nhánh `codex/member-web-responsive-auth-scene`, base `ad49aac4`.
[AuthLayout](../../apps/user-web/src/layouts/AuthLayout.tsx) dùng srcSet
960w/1920w/3000w. Sizes tính theo chiều rộng cần cho cover và scale 1,035,
kể cả viewport dọc. JPEG gốc phục vụ màn hình cần thêm điểm ảnh và dùng
lại một lần khi bản WebP tải lỗi. Giữ ảnh high priority trong Auth.
[Ảnh gốc và quy trình nén](../../apps/user-web/public/photography/README.md).

Hai build production, Chromium, cache lạnh, 5 cặp xen kẽ ở 390×844/DPR2,
CPU4×, 500.000 byte/s tải xuống và độ trễ 80 ms. Reduced-motion bật.
Tài nguyên tĩnh HTTP fixture, JS/CSS/HTML gzip. Trung vị từ điều hướng:

| Mục | JPEG | WebP 1920w |
| --- | ---: | ---: |
| Dung lượng ảnh nền | 607.891 B | 225.244 B |
| Nhận xong ảnh nền | 4,29 s | 3,42 s |
| Sau giải mã và marker texture giấy sẵn sàng | 8,49 s | 8,59 s |

Giảm 382.647 B (62,9%) ở viewport đo. Thời gian chuẩn bị texture dao động
và chưa cho thấy cải thiện ổn định. Chưa đo LCP hoặc thời gian đăng nhập
với API thật. Entry vẫn 31 file và 985.861 B raw. Cả 47 CSS production khớp
byte. Hai WebP thêm 321.154 B vào thư mục tài nguyên.

- Production fixture PASS một request mỗi lượt bình thường. 390/DPR1
  dùng 960w/95.910 B, 390/DPR2 và 1440/DPR1 dùng 1920w, 1440/DPR3 dùng
  JPEG gốc. Home không đọc ảnh. Ép 1920w trả 404 thì lấy JPEG một lần, giữ
  node ảnh đã giải mã qua Login, Register và Forgot Password.
- CSS tính được khớp cover, vị trí 60%/52%, blur 4 px, scale 1,035 và lớp
  phủ. Đã xem ảnh 390/1440. Sai khác mỗi kênh tối đa 1 mức trên desktop và
  phần nền mobile. Một cặp mobile lệch trên 1 mức ở 18 pixel góc dưới của
  mép giấy, không nằm trên ảnh nền. Bản WebP có thu nhỏ và nén quality 88.
- [Auth browser](../../apps/user-web/tests/auth-auction-arrival.mjs) kiểm
  đúng ứng viên ảnh và giữ luồng giấy WebGL, gió, Back, đổi kích thước,
  mất WebGL và lỗi capture ở 1366/390. Build/typecheck, 341 unit test,
  lint, docs/diff PASS. Lint có cảnh báo cũ.
- Bằng chứng local ở `.tmp/member-web-auth-scene/`, HTTP fixture PASS.
  API thật, thiết bị thật, native, human acceptance và CI remote NOT RUN.
  READINESS giữ nguyên.

## Gửi đúng từ khóa Tìm sách khi nhập và submit cùng lượt

Nhánh `codex/member-web-search-submit-race`, base `a98db891`. Phát hiện
trong Search recovery khi tối ưu ảnh thương hiệu. Tái hiện bằng input event
và `requestSubmit()` cùng lượt. Router đã cập nhật browser history với từ khóa
mới, nhưng DOM input và handler vẫn có thể ở render cũ. Handler cũ ghi lại từ
khóa cũ và không đọc truy vấn mới.

[BookSearchPage](../../apps/user-web/src/pages/BookSearchPage.tsx) đọc
`window.location.search` tại submit, trim q và truyền cùng snapshot params
cho đường cập nhật hiện có. Giữ các bộ lọc, reset cursor và kết thúc trạng thái
ghép dấu. Nhập bình thường vẫn debounce 300 ms. Enter dùng để ghép dấu vẫn
không submit. Không thêm flushSync, thay CSS hoặc đổi animation.

[Search recovery](../../apps/user-web/tests/search-recovery.mjs) giữ ca blur
và IME Enter. Ca submit được đặt cùng task với input cuối để tránh phụ thuộc
thời gian render. Bản cũ FAIL với từ khóa trước, bản mới PASS cả 9 ca trên dev
và production fixture. Kiểm q đã trim, giữ tham số `data`, network error,
timeout/retry và nút mobile. Build/typecheck, 341 unit test, lint và docs/diff
PASS. Bằng chứng cùng thư mục `.tmp/member-web-brand-lossless/`.
Kiểm bằng Chromium và HTTP fixture. Bộ gõ trên thiết bị thật, API thật, native,
human acceptance và CI remote NOT RUN. READINESS giữ nguyên.

## Nén lossless logo và chữ Hero

Nhánh `codex/member-web-lossless-brand-art`, base `1728dc55`.
[BrandArtwork](../../apps/user-web/src/components/BrandArtwork.tsx) giữ thẻ
img và ưu tiên WebP cho hai ảnh. Khi tải lỗi, mỗi ảnh chuyển sang PNG một
lần. Header, footer và BrandIcon dùng chung URL logo; Home preload WebP
với type `image/webp`. Giữ kích thước, cửa sổ cắt, chữ ẩn trong H1 và nhãn
logo. [Nguồn và công thức nén](../../apps/user-web/public/brand/README.md).

Hai build production, 5 cặp xen kẽ Chromium, cache lạnh tại 390×844/DPR2,
CPU4×, mạng 500.000 byte/s và độ trễ 80 ms. Reduced-motion bật. HTTP fixture
cục bộ, JS/CSS/HTML gzip. Mốc responseEnd tính từ điều hướng.

| Mục | PNG | WebP |
| --- | ---: | ---: |
| Logo tải qua mạng | 55.273 B | 17.920 B |
| Hero tải qua mạng | 91.425 B | 51.636 B |
| Hai ảnh đầu trang | 146.698 B | 69.556 B |
| Trung vị nhận xong Hero | 1,26 s | 1,19 s |
| Trung vị nhận xong logo | 2,17 s | 1,80 s |

Giảm 77.142 B (52,6%) ảnh. Mỗi lượt vẫn đúng hai request cho hai ảnh, Hero
dùng lại preload và logo dùng chung một lần tải. 47 CSS production khớp
byte. Entry 31 file, thêm 120 B raw / 42 B gzip. Chưa đo LCP hoặc thiết bị thật.

- Sharp giải mã RGBA khớp byte cho cả hai ảnh. Chromium canvas khớp tuyệt
  đối logo. Hero có 11.410 pixel bán trong suốt khác giá trị RGB khi đọc
  canvas. Alpha và pixel đục khớp, chênh premultiplied tối đa 1,28 mức màu.
  Ảnh chụp thật 390/1440: logo khớp từng pixel, Hero lệch tối đa 1 mức/kênh.
  Đã xem chữ Hero và phần cắt logo.
- [Home browser](../../apps/user-web/tests/home-search-focus.mjs) PASS: Search
  deep link không tải ảnh Hero, Home tái sử dụng preload, ép hai WebP trả 404
  thì cả hai PNG tải được. Pause/resume lá, hover/focus, phím và truy vấn giữ
  hành vi. Fixture production kiểm header thu gọn và trở lại sau khi cuộn.
- Build/typecheck, 341 unit test, lint và docs/diff PASS. Search recovery phát
  hiện race khi gửi ngay sau nhập IME. URL trình duyệt đã có từ khóa mới trong
  lúc input và handler còn ở render cũ. Race được xử lý ở commit riêng.
  Lint có cảnh báo cũ. Bằng chứng local ở `.tmp/member-web-brand-lossless/`.
  API thật, thiết bị thật, native, human acceptance và CI remote NOT RUN.

## Sửa ví tràn ngang và mất chỗ hiển thị trên mobile

Nhánh `codex/member-web-wallet-mobile-layout`, base `70dfa333`. Lỗi được
phát hiện trong phép so ở mục tách CSS bên dưới. Lưới một cột trước đây có
minimum theo nội dung. Ở 390 px, huy hiệu VNPay ép tiêu đề hẹp và các hàng
thẻ, thao tác, biên nhận vượt khung 347 px. Hộp thoại 320 px cũng có hàng mệnh
giá rộng hơn vùng chứa. [CSS trang ví](../../apps/user-web/src/pages/WalletPage.module.css).

- Lưới một cột co từ 960 px. Đến 600 px, huy hiệu xuống dưới tiêu đề,
  nạp tiền có hàng riêng, các hàng phụ có thể ngắt dòng. Số dư và ký quỹ
  nằm trong thẻ. Thông tin Sandbox cho phép ngắt ở khoảng trắng; nút chép
  và tab lọc có vùng bấm 44 px. Tab lọc tiếp tục cuộn trong hàng riêng.
  Biên nhận hẹp đặt số tiền dưới phần mô tả. Mệnh giá popup tự chọn số cột.
- CSS chỉ đổi hai media query trong file ví đã tải theo route. Desktop
  giữ bố cục hai cột. Các keyframe, thời lượng, DOM, auth và lệnh tiền giữ nguyên.
- [Browser production](../../apps/user-web/tests/wallet-layout.mjs) PASS
  320/390/768/1440 và 390 với chữ 125%, reduced-motion. So sổ fixture có
  số dư dài, ký quỹ, tên dài, nút thẻ và dòng tiền trong khung. Popup kiểm
  chiều ngang, nhập nháp, Escape và focus trả về. Tab cuối chọn bằng bàn
  phím và gửi lọc fixture đúng. Ánh sáng thẻ 8 s, keyframe 0/80/100%.
  Build cũ FAIL đúng kiểm hồi quy 390 px: content 382 / frame 347,
  document scrollWidth 396. Build mới 347 / 347, document scrollWidth 375.
  320 px có content 277 / frame 277. Đã xem ảnh 320 và 390 chữ 125%.
- Dashboard browser PASS gồm guest callback, sidebar và tải lại khi
  stylesheet ví lỗi. Build/typecheck, 341 unit test, lint, docs/diff PASS.
  Lint có cảnh báo cũ. Bằng chứng ở `.tmp/member-web-wallet-layout/`.
  HTTP fixture chỉ mô phỏng đăng nhập và dữ liệu ví. Giao dịch, Mongo,
  VNPay thật, thiết bị thật, native, human acceptance và CI remote NOT RUN.

## Tách CSS ví khỏi lần tải đầu Member web

Nhánh `codex/member-web-split-wallet-styles`, base `e7b8f65c`.
`VNPayReturnGate` có mặt ở entry và chỉ dùng một class khung, nhưng trước
đây import cả `WalletPage.module.css`. Chuyển nguyên block .page sang
[WalletFrame](../../apps/user-web/src/pages/WalletFrame.module.css) để
[trang ví](../../apps/user-web/src/pages/WalletPage.tsx) và
[trang quay về VNPay](../../apps/user-web/src/pages/VNPayReturnGate.tsx)
dùng cùng khung. CSS còn lại và mapping class đi cùng route ví. Các nhánh
route, URL, BroadcastChannel, session, lệnh ví, keyframe và timing giữ nguyên.

So hai build production với cùng cấu hình API `/api/v1`. Tổng đo các JS/CSS
tham chiếu trực tiếp từ HTML entry. Gzip mức 9, từng file độc lập.

| Dung lượng entry | Trước | Sau | Giảm |
| --- | ---: | ---: | ---: |
| CSS raw | 167.312 B | 146.450 B | 20.862 B |
| CSS gzip | 32.665 B | 28.590 B | 4.075 B |
| JS và CSS raw | 1.011.983 B | 985.741 B | 26.242 B |
| JS và CSS gzip | 302.641 B | 296.810 B | 5.831 B |

Vẫn 31 file entry. Wallet CSS riêng 20.792 B raw / 4.783 B gzip. Home ở
390 và 1440 px nhận đúng 4.075 B CSS gzip ít hơn qua HTTP fixture.
Kiểm request xác nhận Home và Thông báo không tải file CSS của ví, route
ví nhận file trước khi hiển thị. Route ví có thêm một request CSS riêng.
Số liệu trên là dung lượng tải, chưa đo LCP hay thời gian mở ví.

- [Dashboard browser](../../apps/user-web/tests/dashboard-chunk.mjs) PASS
  390/1440, login return URL, Back và sidebar. Guest quay về VNPay được làm
  sạch URL, không đọc endpoint riêng. Từ chối tải CSS ví hiện màn lỗi và
  tải lại phục hồi đường dẫn đăng nhập. Assertion CSS riêng tái hiện FAIL
  đúng điều kiện trên build cũ.
- Production fixture riêng PASS 390/reduced-motion và 1440/motion thường:
  xem số dư, lịch sử, lọc giao dịch, mở hộp thoại nạp, nhập nháp, Escape
  trả focus. Chỉ login giả lập, không gửi lệnh tiền. Guest callback phát
  tín hiệu qua BroadcastChannel, không đọc endpoint riêng. Khung và giá trị
  CSS khớp trước/sau. Sheen thẻ ví giữ vòng lặp 8 s, easing và 3 keyframe.
- Đã so ảnh wallet, popup và callback trước/sau. Callback cả hai viewport,
  wallet desktop và popup mobile khớp từng pixel. Wallet mobile có chênh
  pixel và cùng số đo bố cục. Popup desktop lệch 2 pixel. Ở 390 px, nội dung
  ví đã rộng 382 px trong khung 347 px trên cả hai build. Đây là lỗi tràn
  có sẵn ở trang ví, chưa sửa trong gói tách CSS.
- Build/typecheck, 341 unit test, lint, docs/diff PASS. Có cảnh báo lint cũ
  ngoài diff. Bằng chứng ở `.tmp/member-web-wallet-styles/`. API/Mongo và
  VNPay thật, thiết bị thật, native, human acceptance, CI remote NOT RUN.
  READINESS giữ nguyên.

## Dùng chung observer cho ảnh gần viewport

Nhánh `codex/member-web-shared-cover-observer`, base `e667389a`.
[useNearViewport](../../apps/user-web/src/hooks/useNearViewport.ts) dùng một
IntersectionObserver cho các target cùng viewport và root margin 200 px.
Mỗi entry đi tới đúng subscriber theo target. Khi node được đăng ký lại, entry
cũ không đổi trạng thái đăng ký mới. Cleanup unobserve từng target và disconnect
khi subscriber cuối rời trang. Eager và trình duyệt thiếu IntersectionObserver
vẫn cho ảnh tải theo cơ chế cũ. Giữ query key, cache, expiry, retry và luồng ảnh.

Hai build production, Chromium, REST/ảnh fixture. Mỗi lượt mở danh sách với
8 Live và 8 Scheduled, chờ font rồi cuộn lần lượt tới thẻ 8, 16 và 1.
Một cặp trước/sau mỗi viewport, reduced-motion bật. Đếm callback của observer
với margin 200 px và cả entry được trình duyệt giao tới. Trình duyệt vẫn theo
dõi đủ 16 target.

| Trong kịch bản mở và cuộn danh sách | Trước | Sau |
| --- | ---: | ---: |
| Observer được tạo, cả hai viewport | 16 | 1 |
| Mobile 390 px, tổng callback | 29 | 5 |
| Mobile, tổng entry | 29 | 29 |
| Desktop 1440 px, tổng callback | 52 | 4 |
| Desktop, tổng entry | 52 | 52 |

Cùng danh sách ID đọc link ảnh trước/sau và mỗi ID chỉ đọc một lần. Khi mở
trang: 1 ảnh mobile, 4 desktop. Sau cả ba lần cuộn: 7 ảnh mobile, 16 desktop.
Rời trang bản mới unobserve đủ 16 target, disconnect một lần. Đây là số đếm
trong kịch bản cụ thể. Chưa đo chênh lệch CPU, FPS hoặc INP. 46 CSS production
khớp byte. 31 asset JS/CSS trong HTML entry giữ nguyên số lượng, thêm 248 byte
raw cho logic dùng chung.

- [Browser Đấu giá](../../apps/user-web/tests/auction-photo-visibility.mjs)
  PASS 390/1440 và bốn cấu hình fallback. Cover ngoài vùng chờ tải, quay lại
  dùng cache, revision mới giữ phạm vi visibility, hover/lỗi ký link/lỗi ảnh
  và viewer hoạt động. Đi Home giải phóng hết target, Back tạo đúng một
  observer mới cho 16 target. Assertion 1 observer bắt đúng 16 trên build cũ.
- Browser production riêng PASS Tìm sách 24 thẻ dùng một observer và ảnh cuối
  tải khi cuộn tới. Sang Chi tiết, 24 target được giải phóng và 5 thumbnail dùng
  observer mới. Chọn ảnh 5, mở lớn, chuyển ảnh bằng phím, Escape, quay về kệ.
  Ảnh chính/viewer dùng cache. Đã xem ảnh gallery ở 390 px.
- Search covers 8 ca PASS, gồm hidden, link hết hạn, lỗi ảnh và retry.
  Book transition 5 cấu hình PASS, gồm 440 ms cả hai chiều và giảm chuyển động.
  Build/typecheck, 341 unit test, lint, docs/diff PASS. Lint có cảnh báo cũ.
- Bằng chứng ở `.tmp/member-web-cover-observer/`. API, Socket.IO và ảnh trong
  harness là fixture. API thật, thiết bị thật, native, human acceptance và CI
  remote NOT RUN. READINESS giữ nguyên.

## Chọn kích thước bìa Hero theo màn hình

Nhánh `codex/member-web-responsive-hero-covers`, base `b9187a4a`. Ba bìa
Frieren, One Piece và Dược sư tự sự chiếm 521.441 byte trong tám bìa trang
chủ. Hero dùng `srcSet` và `sizes` cho ba vị trí đó. Kích thước đích theo
bố cục ở breakpoint 1100 px và tính phần phóng khi hover trên desktop.
Giữ ảnh gốc trong danh sách ứng viên và dùng lại khi bản nhỏ tải lỗi.
Thêm 282.940 byte vào thư mục tài nguyên để trình duyệt chọn đúng một bản
cho mỗi vị trí. Giữ đủ tám bìa, tải eager, DOM, lớp CSS và lịch chuyển động.
Xem [HeroCovers](../../apps/user-web/src/pages/HomePage.tsx) và
[nguồn ảnh, cách nén](../../apps/user-web/public/illustrations/README.md).

Hai build production, Chromium 151, cache trình duyệt lạnh, 5 cặp xen kẽ
cho mỗi cấu hình. Viewport 390×844/DPR2/touch/CPU4× và 1440×900/DPR1/CPU1×.
CDP giả lập 500.000 byte/s tải xuống và độ trễ 80 ms, reduced-motion bật.
HTTP fixture cục bộ, HTML/JS/CSS gzip. Mốc giải mã đo từ lúc bắt đầu điều
hướng tới lúc 8 lời gọi `img.decode()` hoàn thành sau khi ảnh được tải.

| Trung vị | Trước | Sau |
| --- | ---: | ---: |
| Nội dung 8 bìa ở cả hai cấu hình | 747.499 byte | 323.456 byte |
| Resource Timing gồm phần header | 749.899 byte | 325.856 byte |
| Mobile nhận xong bìa cuối | 4,26 s | 3,08 s |
| Mobile 8 bìa giải mã xong | 4,41 s | 3,24 s |
| Desktop nhận xong bìa cuối | 3,93 s | 2,80 s |
| Desktop 8 bìa giải mã xong | 3,95 s | 2,82 s |

Bớt 424.043 byte nội dung ảnh (56,7%). Trình duyệt tải 8 ảnh bìa, mỗi vị
trí một ứng viên trong hai cấu hình đo. CLS trong đoạn đo giữ 0,00058
mobile và 0,00070 desktop. Mốc giải mã bao gồm chi phí quan sát của harness.
Phép đo tập trung vào bộ bìa trong lab. LCP, INP và thiết bị thật chưa đo.

- Browser production PASS chọn 200w ở 390/DPR2, 768/DPR2 và 1440/DPR1.
  1440/DPR2 chọn 400w cho Frieren và Dược sư, giữ One Piece gốc; tổng
  521.278 byte. 1440/DPR3 chọn ba ảnh gốc. Bản Frieren 200w trả 404 thì
  ảnh gốc tải đúng một lần và hai vị trí còn lại tiếp tục dùng bản nhỏ.
- 46 CSS production khớp từng byte. 390/1440 giữ kích thước hộp ảnh và
  16 CSS animation: tám gather 600 ms, tám sway 6–7,5 s. Danh sách timing
  trước/sau khớp, kể cả delay, easing và direction khi reduced-motion bật.
  Desktop hover kiểm được translateY −8 px và scale 1,12.
- Đã xem ảnh Hero 390/1440 chụp ở cùng pha animation. Bản WebP thu nhỏ và
  nén quality 92 nên pixel có khác; giữ toàn khung bìa, bố cục và chữ chính.
  Ảnh gốc tiếp tục đáp ứng cấu hình cần độ phân giải cao.
- Build/typecheck, 341 unit test, lint, browser Home focus và docs/diff PASS.
  Bằng chứng ở `.tmp/member-web-hero-cover-assets/`. Browser dùng HTTP
  fixture. API thật, thiết bị thật, native, human acceptance và CI remote
  NOT RUN. READINESS giữ nguyên.

## Nén font tiêu đề và con dấu Auth bằng WOFF2

Nhánh `codex/member-web-auth-woff2`, base `42fe9871`. Member web dùng WOFF2
Bricolage Grotesque trong cả CSS Auth và snapshot giấy. CSS khai báo TTF dự
phòng. Snapshot đọc TTF khi không lấy được WOFF2. Hai nơi dùng cùng URL ưu tiên
nên lần đọc cho snapshot dùng lại HTTP cache trong fixture. Mã dựng cảnh, số lớp,
keyframe và thời lượng giữ nguyên. Mã nguồn và hướng dẫn tái tạo ở
[Auth CSS](../../apps/user-web/src/layouts/AuthLayout.module.css),
[snapshot](../../apps/user-web/src/components/auth/wind/capture.mjs) và
[font README](../../apps/user-web/public/fonts/auth/README.md).

FontTools 4.63.0 + Brotli 1.2.1 nén đúng TTF nguồn. Giữ 597 glyph và 527
codepoint, kiểm tra dấu tiếng Việt, bảng `fvar`/`gvar` và các bảng font theo
byte. Khác biệt nằm ở DSIG và trường checksum/cờ nén của container. Hai file
giữ cùng attribution/OFL. Không thêm dependency runtime.

Hai build production, Chromium 151, cache lạnh, 5 cặp chạy luân phiên tại
390×844/DPR2/CPU4×, băng thông tải xuống 500.000 byte/s, độ trễ cấu hình 80 ms.
Mỗi lượt mở `/login` và chờ marker `data-flight-ready`, báo năm texture đã sẵn
sàng. Tài nguyên tĩnh từ HTTP fixture cục bộ, JS/CSS/HTML có gzip. Bảng ghi
trung vị, thời gian tính từ lúc bắt đầu điều hướng.

| Phép đo | TTF | WOFF2 |
| --- | ---: | ---: |
| Nội dung file font | 408.496 byte | 208.496 byte |
| Font truyền qua mạng theo Resource Timing | 408.796 byte | 208.796 byte |
| Tải xong font CSS | 4,06 s | 3,27 s |
| Texture giấy sẵn sàng | 5,78 s | 4,93 s |

Mỗi lượt bình thường truyền một bản font, lần fetch cho snapshot có transferSize
0. Năm SVG data URL ngắn hơn tổng 1.587.250 ký tự ở mỗi viewport. Mốc
`data-flight-ready` là chuẩn bị texture trong lab. Chưa đo LCP, tốc độ hoàn tất
đăng nhập với API thật hoặc hiệu năng thiết bị thật.

- Chromium production 390/1440 px với reduced-motion. So SHA-256 của RGBA
  cho từng texture đã rasterize, cả 5 texture đều khớp TTF ở mỗi viewport.
  Ép WOFF2 HTTP 404 và xác nhận CSS lẫn snapshot lấy TTF, 5 texture vẫn khớp.
  Ảnh cắt giấy desktop khớp từng pixel. Ảnh mobile lệch 18 pixel ở hai góc
  mép dưới và cùng mức lệch khi ép TTF dự phòng. Vùng chữ khớp.
- `pnpm --filter @used-books/user-web test:auth-motion:browser` PASS desktop
  1366 và mobile 390 khi reduced-motion bật. Login 401 giữ nháp, Login 200
  chạy WebGL 3 tờ, gió giấy và focus trang đích. Back, resize, mất WebGL và
  lỗi capture đều hoàn tất theo cơ chế dọn dẹp của luồng. REST fixture và
  không dùng DB. Suite cũng xác nhận trang đấu giá hiện hành không tải rèm cũ.
- Build/typecheck, 341 unit test, lint, docs và diff check PASS. Lint có cảnh
  báo cũ ngoài diff. Bằng chứng ở `.tmp/member-web-auth-font/`. Thiết bị thật,
  API thật, native, human acceptance và CI remote NOT RUN.

## Tránh dựng lại tin nhắn không đổi khi soạn chat

Nhánh `codex/member-web-chat-input-render`, base `2aa1350a`.
[ChatPage](../../apps/user-web/src/pages/ChatPage.tsx) tách hàng tin nhắn thành
`ChatMessage` dùng `React.memo` với so sánh props mặc định: message object,
sender label và own flag. Nhập nháp không dựng lại40 hàng cũ; object/nội dung/
thời gian/người gửi mới vẫn render. Không dùng comparator theo ID, cache riêng
hoặc sửa hàm định dạng ngày. Giữ cập nhật immutable hiện có; key, DOM, CSS,
query/history/cursor, merge/socket, send/receipt, scroll effects và motion không
đổi. Phạm vi là phòng chat Member web, không là phân trang hộp hội thoại.

Hai production build, Chromium151,5 cặp luân phiên mỗi viewport; REST fixture
40 tin, đăng nhập bằng UI, chờ font và hiệu ứng đăng nhập kết thúc rồi focus
composer/chờ500ms. Gõ8 ký tự `Xin chao`, delay15ms giữa ký tự. Viewport390×844/
DPR2/touch/CPU4× và1440×844/DPR1/CPU1×, reduced-motion bật. Không bóp mạng
trong đoạn gõ hoặc dùng clock giả. CDP Performance đo cửa sổ thao tác;
input→callback rAF lấy40 event mỗi viewport/build. Fixture hiệu năng trả503
cho socket; fixture hồi quy bên dưới dùng Socket.IO cục bộ hoạt động.

| Trung vị trong đoạn nhập8 ký tự | Trước | Sau |
| --- | ---: | ---: |
| Viewport390: tạo Intl.DateTimeFormat | 320 | 0 |
| Viewport390: ScriptDuration | 307,2ms | 133,5ms |
| Viewport390: TaskDuration | 608,1ms | 476,0ms |
| Viewport390: input→callback rAF | 50,9ms | 28,1ms |
| Desktop: tạo Intl.DateTimeFormat | 360 | 0 |
| Desktop: ScriptDuration | 47,8ms | 17,1ms |
| Desktop: TaskDuration | 112,7ms | 85,6ms |
| Desktop: input→callback rAF | 10,4ms | 9,5ms |

Các cửa sổ có thể gồm poll/socket callback; tổng định dạng desktop có thêm
render ngoài8 input, không quy mọi lời gọi cho thao tác gõ. Callback rAF không
là paint hoàn tất/INP hoặc số đo điện thoại thật. Không suy thành mức tăng tốc
chung cho mọi phòng chat.46 CSS production khớp byte; HTML entry vẫn31 asset
JS/CSS và1.010.927byte raw, không thêm dependency hoặc tải đầu trang.

- [Browser production](../../apps/user-web/tests/chat-input.mjs) PASS390/1440:
  8 ký tự không dựng lại timestamp cũ; text/class/time, draft và focus giữ nguyên;
  socket thêm tin, dedup; representation mới cùng history ID đổi body/time/owner;
  poll đổi tên partner; refetch403 xóa hàng cache khỏi UI và giữ nháp.0 pageerror.
  Source cũ bị bắt320 lượt định dạng ở assertion yêu cầu0; không hạ assertion.
  Chạy lại sau build:`pnpm --filter @used-books/user-web test:chat-input:browser`.
- Đã xem ảnh hàng tin nhắn. So ảnh cố định cùng kích thước:390px khớp pixel;
  desktop lệch254pixel, tối đa33 mức kênh màu. Không kết luận mọi frame motion
  khớp pixel; source CSS/DOM và các effect không đổi.
- Build/tsc,341 unit test/48file, lint phạm vi và detector ChatPage0 PASS;
  lint chỉ có warning cũ ngoài diff. Harness lịch sử85 tin PASS390/1440:
  mới nhất40, retry cùng cursor, giữ anchor dưới3px, tin đến khi đọc cũ và hết
  lịch sử. Chạy:`pnpm --filter @used-books/user-web exec node tests/chat-guidance.mjs --message-history-only`.
- Harness chat chức năng PASS với tùy chọn sẵn có `CHAT_GUIDANCE_SCREENSHOTS=0`:
  mua/đổi, nháp/lỗi, gửi lại sau mất phản hồi, retry order/payment. Tùy chọn này
  bỏ toàn bộ helper captures(), gồm assertion bố cục, không chỉ bỏ file ảnh.
  **Suite đầy đủ còn FAIL** tại selector giá75.000 trong captures()/seller-ready
  (`chat-guidance.mjs:165`, gọi ở363). Đã tái hiện cùng lỗi với ChatPage trước
  thay đổi; không sửa harness hoặc assertion để che lỗi. Gate chụp/bố cục cũ
  chưa đạt và cần điều tra riêng; functional PASS không thay thế gate đó.
- Toàn bộ REST/Socket.IO ở các harness là fixture; không DB/provider hoặc kiểm
  quyền server thật. API local health ECONNREFUSED, không khởi động dịch vụ.
  Native, thiết bị thật, human acceptance, CI remote NOT RUN; READINESS giữ nguyên.
  Docs/diff check PASS. Bằng chứng local ở
  `.tmp/member-web-chat-input-performance/` và `.tmp/chat-input/`; không commit
  artifact hoặc đồng bộ checkout demo.

## Tránh dựng lại thẻ không đổi khi nhập tìm kiếm đấu giá

Nhánh `codex/member-web-auction-input-render`, base `e4ee224a`.
[AuctionCard](../../apps/user-web/src/components/AuctionCard/index.tsx) dùng
`React.memo` với so sánh props mặc định; không thêm comparator theo ID hoặc
cache dữ liệu riêng. Nhập liệu/toggle tại trang cha không dựng lại thẻ khi
auction object và serverTime không đổi. Props mới vẫn render; state riêng của
thẻ, clock con và query ảnh vẫn cập nhật bình thường. Giữ immutable updates
hiện có của TanStack Query. Không thay query, debounce250ms, URL/filter/sort,
DOM, CSS, duration/easing hoặc policy motion.

Hai production build, Chromium151,5 cặp luân phiên mỗi viewport, REST fixture
8 Live+8 Scheduled. Chờ font/viewport ổn định, focus search rồi chờ800ms; gõ
`Phien QA` gồm8 ký tự bằng keyboard, delay15ms giữa ký tự. Width390×844/DPR2/
CPU4× và1440×844/DPR1/CPU1×, reduced-motion. Không bóp mạng trong đoạn nhập.
CDP Performance metrics lấy từ trước gõ đến requestAnimationFrame sau ký tự
cuối; mọi lượt xác nhận URL vẫn `/auctions`, chưa áp dụng debounce cuối.

| Trung vị trong đoạn nhập8 ký tự | Trước | Sau |
| --- | ---: | ---: |
| Viewport390: gọi định dạng ngày | 215 | 0 |
| Viewport390: ScriptDuration | 535,8ms | 102,0ms |
| Viewport390: TaskDuration | 758,8ms | 341,1ms |
| Viewport390: input→callback rAF,40 event | 65,6ms | 15,7ms |
| Desktop: gọi định dạng ngày | 212 | 0 |
| Desktop: ScriptDuration | 46,1ms | 11,7ms |
| Desktop: TaskDuration | 79,2ms | 42,6ms |
| Desktop: input→callback rAF,40 event | 10,4ms | 8,8ms |

Đây là các cửa sổ thao tác theo script, có thể gồm công việc UI khác chạy cùng
lúc. Tổng định dạng không đồng nghĩa mọi lời gọi đều thuộc một event input.
Callback rAF không là paint hoàn tất, INP hoặc số đo điện thoại thật; không
suy thành tốc độ gõ của người dùng. Lợi ích rõ nhất ở viewport390/CPU4×. Không
dùng clock giả hoặc bỏ motion để lấy số đo. CSS production46 file khớp byte;
HTML entry giữ31 JS/CSS và1.010.927byte raw, không thêm dependency.

- [Browser production](../../apps/user-web/tests/auction-input.mjs) PASS390/
  1440px: gõ8 ký tự không tính lại ngày, debounce/URL/focus giữ nguyên, Escape
  và empty→clear phục hồi kết quả, sort giá thật đổi thứ tự. Bản cũ bị bắt215
  lượt định dạng khi yêu cầu0. Không hạ assertion để bản cũ đi qua.
- Response REST mới cố ý giữ nguyên serverTime nhưng thay object auction:
  giá60k→180k, bidder2→4, title/point/endAt mới đều xuất hiện; sort đưa đúng
  card lên đầu. Giữ WAAPI giá500ms với frame vàng và FLIP đổi vị trí220ms khi
  reduced-motion bật. Clock tiếp tục đổi sau update. WebSocket fixture bị từ
  chối; không là bằng chứng push/bid/payment thật.
  Chạy lại:`pnpm --filter @used-books/user-web test:auction-input:browser`.
- Đã xem card sau cập nhật giá. Fixture ngày cố định để so ảnh: desktop khớp
  pixel,390px lệch323pixel tối đa29 mức kênh màu trong hai ảnh cùng kích thước;
  không tuyên bố pixel-perfect mobile hoặc mọi frame motion. CSS/DOM không đổi,
  các hiệu ứng giá/đổi vị trí được kiểm độc lập với ảnh đứng.
- Build/tsc,341 unit test, lint exit0, input, auction-stage, countdown và6 cấu
  hình ảnh đấu giá PASS; ảnh gần viewport/revision/cache/error/retry vẫn chạy
  dù thẻ dùng memo. Detector AuctionCard0 finding; warning lint/chunk/plugin
  timing cũ ngoài diff. Docs/diff check PASS.
- API thật BLOCKED: GET `/api/v1/auctions` ECONNREFUSED. Không khởi động dịch vụ,
  ghi DB hoặc chạy command. Thiết bị thật/human acceptance/CI remote chưa chạy.
  READINESS giữ nguyên; API/session/permission/contract không đổi.
- Harness,20 lượt đo với160 input event, probe, JSON và so ảnh tại
  `.tmp/member-web-auction-input-performance/`; test/ảnh tại `.tmp/auction-input/`.
  `.tmp` chỉ trên máy hiện tại; browser regression mới được đưa vào Git.

Chỉ ở worktree phát triển, checkout demo với local work được bảo toàn. Không
push/PR/merge. Đây là tối ưu đoạn nhập/filter UI, không kết luận mọi trang/vai
trò hoặc mọi trường hợp đấu giá đã được benchmark.

## Xin link ảnh thẻ đấu giá khi bìa gần viewport

Nhánh `codex/member-web-auction-photo-visibility`, base `966b581a`.
[AuctionCard](../../apps/user-web/src/components/AuctionCard/index.tsx) quan sát
chính link bìa với `useNearViewport`, rootMargin200px. Chỉ bật query ảnh khi
observer báo gần màn hình. Không thêm wrapper nên selector `cover > img`, hình
học và hover/focus cũ giữ nguyên. Hook chỉ thêm generic cho ref anchor; runtime
của các consumer div hiện có không đổi.

[AuctionPhoto](../../apps/user-web/src/components/AuctionGallery.tsx) thêm prop
`active` mặc định true. Gallery chi tiết, viewer lớn, Hero source và MyAuctions
không được chuyển sang policy trì hoãn này. Query key theo auction/revision/
media, staleTime60s, retry:false và nút tải lại giữ nguyên. Bật lại query áp dụng
quy tắc stale/error của TanStack Query hiện có. Link đã có trong cache vẫn dùng
được; rời viewport không hủy request đang chạy. Đây là
trì hoãn công việc chưa cần, không giảm chất lượng ảnh hoặc motion.

Hai production build trên Chromium151,5 cặp lạnh luân phiên mỗi viewport; HTTP
fixture8 Live+8 Scheduled có ảnh trên danh sách thật. Width390×844/DPR2/CPU4×
và1440×844/DPR1/CPU1×, reduced-motion; mạng4Mbps xuống/0,75Mbps lên/latency75ms.
Ảnh WebP fixture16.708byte lấy từ asset có sẵn. Đo đến ảnh đầu của card đầu load
xong, font sẵn sàng và800ms chờ; chưa cuộn. Byte là encoded response body ảnh,
không gồm header/API/JS/CSS. Không dùng clock giả cho phép đo này.

| Trung vị lúc mở danh sách | Trước | Sau |
| --- | ---: | ---: |
| Viewport390: request lấy link ảnh | 16 | 1 |
| Viewport390: ảnh đã tải | 6 | 1 |
| Viewport390: body ảnh | 100.248byte | 16.708byte |
| Viewport390: ảnh đầu load, từ navigation | 2.803ms | 2.716ms |
| Desktop: request lấy link ảnh | 16 | 4 |
| Desktop: ảnh đã tải | 16 | 4 |
| Desktop: body ảnh | 267.328byte | 66.832byte |
| Desktop: ảnh đầu load, từ navigation | 2.275ms | 2.198ms |

Số request và ảnh giữ đúng các mức trên ở cả5 cặp mỗi viewport. Lợi ích chính
là tránh xin link/tải ảnh xa ban đầu; cuộn tới vẫn phải tải. Số byte và thời
gian phụ thuộc fixture, không đại diện kích thước ảnh Supabase hoặc độ trễ API
thật. Không suy ảnh load thành LCP/paint hay mức giảm tải MongoDB.

Chi phí đi kèm: bundler tách hook dùng chung thành thêm1 JS preload ở entry,
30→31 file JS/CSS; tổng body tăng196byte raw/218byte gzip fixture. Ba cặp lạnh
bổ sung cho Home mỗi viewport, cùng mạng/CPU: mobile FCP/LCP1.952/1.952→
1.888/1.888ms, desktop1.108/1.848→1.124/1.856ms. Mẫu nhỏ chưa cho thấy hồi quy
lớn hoặc cải thiện Home chắc chắn; không so trực tiếp với gói cũ khác điều kiện.
Đệm200px không bảo đảm mọi ảnh đã load trước khi cuộn rất nhanh; giữ loading/
error hiện có. Cần kiểm cảm nhận cuộn trên điện thoại thật trước nghiệm thu.

- [Browser production](../../apps/user-web/tests/auction-photo-visibility.mjs)
  PASS6 cấu hình:390/1440px, không ảnh, không IntersectionObserver, lỗi link,
  lỗi tải pixel. Bắt bản cũ gọi ảnh xa1 lần khi yêu cầu0. Khi cuộn tới thì ảnh
  tải; quay lại trước staleTime tái dùng query; revision mới nhận dữ liệu mới
  sau khi observer báo gần. Bìa giữ kích thước và img trực tiếp dưới link;
  hover translateY(-3px) vẫn hoạt động khi reduced-motion bật.
- Không có IntersectionObserver thì giữ đường tải toàn bộ ảnh. Không có ảnh
  không gọi endpoint ảnh. Lỗi ở thẻ giữ link chi tiết; gallery vẫn tải/cho retry
  và viewer eager dùng chung query.0 page error ở cả6 cấu hình. Các endpoint
  và ảnh đều fixture; WebSocket bị từ chối. Không bid/command/provider thật.
  Chạy lại:`pnpm --filter @used-books/user-web test:auction-photo-visibility:browser`.
- Toàn bộ46 CSS production khớp byte. Đã xem ảnh bìa390/1440px; không dùng ảnh
  đứng để kết luận mọi frame motion khớp pixel. Hiệu ứng giá500ms và đồng hồ
  vẫn qua bộ countdown của gói trước.
- Build/tsc,341 unit test, lint exit0, bộ auction-stage390/1440px, countdown,
  8 ca ảnh Search và5 cấu hình chuyển cảnh sách PASS. Detector3 file đổi0
  finding; warning lint/chunk/plugin timing cũ ngoài diff. Docs/diff check PASS.
  Harness auction-stage cũ tìm checkbox trong panel đóng và nhãn “Xóa bộ lọc”
  đã lỗi thời. Source AuctionListPage không đổi: test thêm mở panel và dùng
  đúng nhãn “Xóa tất cả”, giữ toàn bộ assertions nghiệp vụ rồi chạy lại PASS.
- API local thật BLOCKED: GET `/api/v1/auctions` trả ECONNREFUSED. Không khởi
  động dịch vụ hoặc ghi DB. Human acceptance, native/điện thoại thật và CI
  remote chưa chạy; READINESS giữ nguyên.
- Harness,20 lượt đo, JSON, probe và log tại
  `.tmp/member-web-auction-photo-performance/`; browser/ảnh ở `.tmp/auction-photo-visibility/`.
  `.tmp` chỉ ở máy hiện tại; bộ test browser và sửa harness được đưa vào Git.

Chỉ ở worktree phát triển. Checkout demo có40 file tracked thay đổi và14 file
untracked được bảo toàn, HEAD5bd0b360. Không push/PR/merge. Phạm vi là ảnh trên
AuctionCard; không kết luận toàn web đã hết điểm nghẽn.

## Tách đồng hồ khỏi phần còn lại của thẻ đấu giá

Nhánh `codex/member-web-auction-countdown`, base `2abb5c52`.
[AuctionCard](../../apps/user-web/src/components/AuctionCard/index.tsx) giữ
`useCountdown` trong component con chỉ dựng badge thời gian. Trước đó mỗi nhịp
đồng hồ gọi lại toàn bộ thẻ, gồm định dạng ngày kết thúc/mở phiên, giá và hooks
ảnh. Không memo hóa dữ liệu auction nên giá/người trả giá/giờ/điểm mới từ server
vẫn đi qua render cha bình thường. Hook đồng hồ, interval1000ms, server offset,
phase/sort, query, API/command, keyframe, easing và class CSS không đổi.

Hai production build, Chromium151,5 cặp luân phiên mỗi viewport. REST HTTP
fixture8 phiên Live +8 Scheduled được dựng trên danh sách thật. Chờ font và
render đầu ổn định rồi đo khoảng4,2giây bằng CDP Performance metrics; có đếm
callback interval1000ms và gọi `Date.toLocaleString`. Width390×844/DPR2/CPU4×
và1440×844/DPR1/CPU1×; reduced-motion theo owner. Không bóp mạng trong đoạn idle.

| Trung vị trong khoảng4,2giây | Trước | Sau |
| --- | ---: | ---: |
| Callback đồng hồ, cả hai viewport | 64 | 64 |
| Gọi định dạng ngày, cả hai viewport | 96 | 0 |
| Viewport390: ScriptDuration | 231,9ms | 79,8ms |
| Viewport390: TaskDuration | 548,1ms | 380,0ms |
| Desktop: ScriptDuration | 22,9ms | 7,8ms |
| Desktop: TaskDuration | 57,6ms | 42,1ms |

Cả5 cặp mỗi viewport đều giữ64 callback và giảm96→0 lần định dạng. Tính cả
16 thẻ đang mount, gồm thẻ ngoài viewport. ScriptDuration là tổng JS trong đoạn
đo, có phần app/socket retry/Lenis khác đang chạy; không suy thành thời gian
một click, FPS, INP hoặc số đo điện thoại thật. Đồng hồ vẫn tick như trước,
không giảm tần suất hoặc dừng các thẻ ngoài viewport để lấy số đẹp.

- [Browser production](../../apps/user-web/tests/auction-countdown.mjs) bắt bản
  cũ48 lần định dạng khi yêu cầu0 sau2 giây, bản sửa PASS390/1440px. Clock browser
  được điều khiển riêng cho ca chức năng, không dùng cho bộ đo hiệu năng phía trên.
  Ngày máy sai10 ngày vẫn dùng offset server; mốc1:00:01→59:59 đổi màu urgent,
  hết giờ về0; Scheduled đếm tới start và không tự chuyển Live khi về0.
- Đổi giá70k→90k, bidder2→3, endAt và điểm giao nhận qua response REST mới vẫn
  cập nhật cùng card; hiệu ứng giá500ms có frame vàng được quan sát qua WAAPI
  khi reduced-motion bật. Có kiểm phân trang và hủy interval khi SPA về Home.
  WebSocket bị từ chối trong fixture: không là kiểm push thật, bid, thanh toán
  hoặc chuyển trạng thái server. Không chạy command/ghi DB.
  Chạy lại: `pnpm --filter @used-books/user-web test:auction-countdown:browser`.
- Toàn bộ46 CSS production khớp byte. Ảnh thẻ sau cập nhật giá: desktop khớp
  pixel,390px lệch6pixel tối đa8 mức kênh màu. Đã xem layout; không coi ảnh đứng
  là bằng chứng mọi frame animation. Ảnh toàn trang lần đầu có header/footer
  animation chưa đồng bộ mốc capture, được loại khỏi kết luận so pixel.
- Build/tsc,341 unit test, lint exit0,42 ca actual screen/viewport của bộ phân
  trang và browser đồng hồ PASS. Detector AuctionCard0 finding; warning lint/
  chunk/plugin timing cũ ngoài diff. Docs/diff check PASS.
- API local thật BLOCKED: GET health/auctions `ECONNREFUSED`; cổng3000/5173/
  5174 không listen,27017 còn listen. Không tự khởi động dịch vụ. Không suy
  kiểm fixture thành tích hợp API/provider hoặc nghiệm thu người thật.
- Harness,20 lượt đo, probe, JSON và so ảnh tại
  `.tmp/member-web-auction-performance/`; test browser/ảnh tại `.tmp/auction-countdown/`.
  `.tmp` chỉ ở máy hiện tại; bộ test browser mới được đưa vào Git.

Chỉ ở worktree phát triển; checkout demo có local work được bảo toàn. Thiết bị
thật, API/WebSocket thật cho gói này, human acceptance và CI remote chưa chạy.
READINESS giữ nguyên. Đây là điểm nghẽn mới ở thẻ đấu giá, không kết luận mọi
trang/vai trò của web đã được khảo sát hiệu năng.

## Tải khung tài khoản theo route

Nhánh `codex/member-web-dashboard-chunk`, base `aa023b21`.
[Router](../../apps/user-web/src/app/router.tsx) chuyển `DashboardLayout` từ
static import sang route `lazy`, cùng cơ chế đang dùng cho các trang con.
Giữ nguyên source component, sidebar, spring/motion, session và guard hiện có.
Dashboard JS/CSS chỉ được yêu cầu khi một route tài khoản khớp; mở trực tiếp
vẫn tải chúng trước khi route render. Không thêm prefetch ngầm hoặc cache dữ
liệu riêng. Lần đầu vào khu vực tài khoản cần tải thêm hai file JS/CSS.

Production Home, Chromium151, HTTP fixture48 sách, 5 cặp lạnh luân phiên ở
mỗi viewport; mạng4Mbps xuống/0,75Mbps lên/latency75ms. Mobile390×844/DPR2/
CPU4× và desktop1440×844/DPR1/CPU1×; reduced-motion theo owner. Resource Timing
đếm JS/CSS đã tải; gzip của server fixture, không suy tỷ lệ nén môi trường deploy.

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| JS/CSS Home sau giải nén | 1.026.631byte | 1.010.731byte |
| JS/CSS Home body nén truyền thực | 305.352byte | 302.059byte |
| File JS/CSS Home | 30 | 30 |
| Mobile FCP/LCP trung vị | 1.532/1.532ms | 1.540/1.540ms |
| Desktop FCP/LCP trung vị | 1.084/1.856ms | 1.080/1.844ms |

Tiết kiệm chắc chắn15.900byte raw/3.293byte body gzip (khoảng1,1% JS/CSS nén).
Không xác nhận cải thiện FCP/LCP. Ba cặp bổ sung ở desktop1440px, cùng mạng,
CPU1×: đăng nhập fixture về Home rồi lần đầu bấm Tổng quan; trung vị click
capture→DOM khung tài khoản418→426ms. Dashboard JS/CSS mới yêu cầu song song
với mã trang con. Đây là mẫu nhỏ, không chứng minh không có overhead trên mọi
mạng/thiết bị; không đánh đổi thời lượng animation để cải thiện số đo.

- Component Dashboard/Sidebar không đổi.44 CSS khác khớp byte;9.070byte CSS
  Dashboard tách khỏi entry giữ nguyên nội dung; entry mới đúng bằng entry cũ
  sau khi gỡ đoạn này. Hai ảnh tài khoản trước/sau ở390/1440px chỉ lệch47/70pixel,
  tối đa2/7 mức kênh màu; đã xem layout. Ảnh đứng không thay kiểm mọi frame motion.
- [Browser production](../../apps/user-web/tests/dashboard-chunk.mjs) PASS5
  cấu hình: Home không tải khung hay đọc dữ liệu private khi guest, direct link
  `/account/notifications?source=qa` đi qua login và trả đúng URL, login UI thật
  với HTTP giả, menu mobile, sidebar desktop68↔240px và điều hướng route con/Back
  tái sử dụng khung. Lỗi HTTP JS và CSS kiểm riêng, hiện RouteError và reload
  phục hồi về login đúng returnUrl. Callback thanh toán fixture giữ màn không
  credential, lọc metadata khỏi URL và0 private API read; không là giao dịch
  VNPay thật.0 page error trong hai luồng tài khoản thành công.
  Chạy lại: `pnpm --filter @used-books/user-web test:dashboard-chunk:browser`.
- Build/tsc,341 unit test, lint, Home focus/leaf pause-resume và5 cấu hình chuyển
  cảnh sách PASS. Detector router0 finding; warning lint/chunk/plugin timing
  có sẵn, không đổi nghiệp vụ để xử lý ngoài phạm vi. Docs/diff check PASS.
- Smoke API thật BLOCKED: GET health/listings đều `ECONNREFUSED`; không có
  listener3000/5173/5174 tại lúc kiểm, Mongo27017 còn listen. Harness timeout
  vì Home không có dữ liệu; đây là môi trường đang tắt, chưa có bằng chứng API
  thật cho gói này. Không khởi động dịch vụ, migration, seed hoặc ghi DB.
- Evidence local, harness,20 lượt Home,6 lượt vào tài khoản, so CSS/ảnh tại
  `.tmp/member-web-dashboard-performance/`; bộ browser tại `.tmp/dashboard-chunk/`.

Lợi ích giảm dần: gói này giảm tải ban đầu một lượng nhỏ, không có thêm bằng
chứng để hứa mở trang nhanh hơn. Các bước tiếp nên lấy trace từ thiết bị thật
và thao tác cụ thể ở bản định demo; không tiếp tục chia chunk/đổi timer hàng
loạt chỉ để có commit. Chưa khảo sát hiệu năng mọi vai trò/trang với dữ liệu
đại diện, không kết luận toàn dự án hết việc tối ưu. Thiết bị thật, human
acceptance và CI remote chưa chạy. Checkout demo/DB và READINESS giữ nguyên.

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
