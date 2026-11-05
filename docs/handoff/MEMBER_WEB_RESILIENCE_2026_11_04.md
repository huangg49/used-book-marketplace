# Gia cố khả năng phục hồi Member web — 04/11/2026

Owner chưa tiện kiểm hệ thống thật và giao tiếp tục rà các tính năng khác bằng
source/kiểm thử cô lập. Phạm vi Member React/Vite, giữ animation và nghiệp vụ;
không thao tác DB/provider/GHN, bật API/Mongo/worker hoặc sửa checkout demo.
Harness chỉ mở preview frontend tạm và tự đóng khi kết thúc.
Đây là vòng gia cố hành vi lỗi, tách với [vòng hiệu năng đã chốt](MEMBER_WEB_PERFORMANCE_2026_11_03.md).
Không suy browser fixture thành API/Mongo/native/người thật nghiệm thu.

## Hỗ trợ: phục hồi bộ chọn giao dịch và trang trống còn cursor —05/11/2026

Nhánh `codex/member-web-support-target-recovery`, base `a43ee000`; checkpoint subject
`fix(user-web): preserve support target choices across transient page errors`.
[SupportTargetPicker](../../apps/user-web/src/features/support/SupportTargetPicker.tsx)
trước ẩn mọi radio khi trang sau503 và retry root thay vì cursor lỗi; empty chỉ
nhìn trang đầu nên vẫn nói chưa có giao dịch sau khi trang sau đã trả lựa chọn.
Nay lỗi tạm thời giữ lựa chọn đã tải, retry đúng cursor;401/403/404 ẩn lựa chọn/
load-more và retry root. Flatten toàn bộ pages để xét empty, còn cursor chỉ nói
trong dữ liệu đã tải; khóa nút khi fetching và không cancel/refetch chồng nhau.
Không đổi quyền chọn target, detail validation, support command hay ADR0062.

[Fixture production](../../apps/user-web/tests/support-target-recovery.mjs),
`pnpm --filter @used-books/user-web test:support-target-recovery:browser`:
baseline8/after8 PASS,390/1440 × next503/next403/sparse/complete-empty.503 giữ2
lựa chọn rồi thêm thứ3 bằng retry cursor,3GET thay vì4;403 ẩn và đọc lại root.
Trang đầu trống/trang sau2lựa chọn không còn câu empty sai. Tiêu đề/nội dung giữ
nguyên, chọn target đọc detail và trả focus đúng. Baseline harness ban đầu dùng
radio.check đợi actionability sau khi picker đã unmount; sửa thành click label,
giữ nguyên assertions và baseline cuối PASS.4profile resource-recovery hồi quy
PASS (cart/support, replay create/reply và remount), không bỏ assertion.

PASS build/typecheck,449unit/57file, scoped lint JSON0, docs/diff, detector0finding.
Đã xem captures390/1440;46 CSS khớp byte, không style/motion/asset đổi. Evidence
`.tmp/member-web-support-target-recovery/`. All-origin HTTP mock/chặn WS/external,
synthetic login/GET, không support mutation/DB/provider/native/human;401 refresh
thật NOT RUN. Demo54file/status giữ nguyên fingerprint, READINESS giữ nguyên;
không push/PR/deploy. Đây là phục hồi UI với responses kiểm soát, chưa chứng minh
hệ thống thật không rớt server hay mọi giao dịch đã được liệt kê.

## Trao đổi: phục hồi số lượng cùng danh sách sau lỗi đọc —05/11/2026

Nhánh `codex/member-web-exchange-count-recovery`, base `b9c98749`; checkpoint subject
`fix(user-web): recover exchange counts together with the list`.
[ExchangeMinePage](../../apps/user-web/src/pages/ExchangeMinePage.tsx) counts và
list là2query riêng cùng đọc `/exchanges`. Trước counts lỗi bị bỏ qua, lỗi sau
cache giữ số cũ; nút Thử tải lại chỉ refetch list, nên list đã mới còn số cũ hoặc
“—” không phục hồi. Nay counts lỗi hoặc list401/403 ẩn số cache thành “—”, không
thành0; list denied có copy quyền/phiên rõ. Khi chỉ counts lỗi, vẫn mở danh sách
và có alert/nút thử lại riêng; retry cập nhật cả2query, khóa trong lúc fetching.
Kết quả0thật vẫn hiển thị0. Không đổi service/cache keys/actor scope, tab/count
phân loại,100exchange hiện có, contract/quyền hay trạng thái giao dịch.

[Production fixture](../../apps/user-web/tests/exchange-count-recovery.mjs),
`pnpm --filter @used-books/user-web test:exchange-count-recovery:browser`:
baseline10/after10 PASS,390/1440 × initial503/cached403/cached503/counts-only/
confirmedzero. Cố định responses ban đầu7/1/1/1, sau retry2/0/0/0: trước retry
chỉ list2card, counts vẫn cũ/unknown; sau cả list2card và counts2/0/0/0. Lỗi chỉ
counts trước không alert/retry, sau có và đọc lại cả2query. Counts-only fixture
gây lỗi request đầu ứng với hook counts đăng ký trước, list request2 vẫn200;
không suy API thực phân biệt hai query hoặc endpoint mới. Tab nhận được sau phục
hồi0và empty đúng.16route-param/keyboard/page/Back hồi quy PASS trên build cuối.

PASS build/typecheck,449unit/57file, scoped lint JSON0, docs/diff, detector0finding.
46 CSS khớp byte; không style/motion/asset đổi; thêm alert/retry bằng lớp hiện có,
đã xem capture390/1440. Evidence `.tmp/member-web-exchange-count-recovery/`.
All-origin HTTP mock/chặn WS/external, chỉ synthetic login/GET, không Exchange
command/DB/provider/native/human;401 refresh thật NOT RUN. Demo54file/status nguyên
vẹn, READINESS không đổi; không push/PR/deploy. Counts/list vẫn là2read độc lập,
không cùng snapshot transaction; không suy số lượng luôn đồng bộ khi backend đang
đổi hoặc hết mọi lỗi Exchange từ fixture ổn định này.

## Trao đổi: tham số tab chỉ nhận đúng bốn giá trị —05/11/2026

Nhánh `codex/member-web-exchange-route-params`, base `08b49c41`; checkpoint subject
`fix(user-web): reject inherited exchange tab names in URLs`.
[ExchangeMinePage](../../apps/user-web/src/pages/ExchangeMinePage.tsx) trước dùng
`rawTab in TAB_CONFIG`; constructor/__proto__/toString được chấp nhận từ prototype
nhưng không phải ExchangeTab. Không tab nào selected/tabIndex0, panel trỏ nhãn
không tồn tại và lọc ra0giao dịch dù nhóm sent có dữ liệu. Nay Object.hasOwn chỉ
nhận sent/received/active/done, giá trị lạ fallback sent như intent cũ. Không có
prototype mutation/exploit được chứng minh; đây là lỗi đọc URL và điều hướng UI.

[Production fixture](../../apps/user-web/tests/exchange-route-params.mjs),
`pnpm --filter @used-books/user-web test:exchange-route-params:browser`:
baseline16/after16 PASS,390/1440 ×3prototype names/unknown/4validtabs. Trước6profile
prototype không selected,0card; sau selected sent và5card/trang đầu. Unknown cũ
vẫn fallback; các tab hợp lệ giữ1/5card phù hợp. Nhóm sent7item kiểm trang2/Back;
ArrowRight tới tab tiếp, focus/tabpanel aria đúng. Chỉ synthetic login/GET,
all-origin HTTP mock/chặn WS/external, không command/DB/provider/native/human.

PASS build/typecheck,449unit/57file, scoped lint JSON0, docs/diff.46 CSS khớp byte,
không JSX/style/motion/asset đổi; không rerun detector cho predicate URL. Source
khác không có mẫu rawTab-in-config tương tự qua rg phạm vi Member pages. Evidence
`.tmp/member-web-exchange-route-params/` before/after/log/preservation. Demo54file/
status giữ nguyên, READINESS không đổi; không push/PR/deploy. Giới hạn100exchange
và trạng thái đọc counts là phần riêng, không suy đã xử lý từ whitelist tab.

## Việc đang chờ: trang rỗng còn cursor chưa là hết việc —05/11/2026

Nhánh `codex/member-web-work-inbox-sparse-pages`, base `d96f1aa6`; checkpoint
subject `fix(user-web): scope work inbox empty states to loaded pages`.
[WorkInboxService](../../apps/api/src/modules/work-inbox/work-inbox.service.ts)
resolve danh sách ID từ cursor thành items, bỏ row không còn tìm được và vẫn
trả nextCursor. Contract cho items rỗng với cursor. [WorkInbox](../../apps/user-web/src/components/WorkInbox.tsx)
trước nhìn items.length0 để báo cả nhóm không có việc dù còn trang sau. Nay chỉ
empty hoàn chỉnh khi không next; nếu còn cursor báo chưa thấy trong dữ liệu đã
tải và hướng dẫn nút tải thêm hiện có. Không auto-scan/thay request/page size,
poll/filter/lanes/rule/permission hay thêm nghiệp vụ.

[Production fixture](../../apps/user-web/tests/work-inbox-sparse-pages.mjs),
`pnpm --filter @used-books/user-web test:work-inbox-sparse-pages:browser`:
baseline8/after8 PASS,390/1440 ×2trang rỗng rồi thấy việc/lỗi trang2 retry/empty
thực từ đầu/có việc rồi refetch thành empty. Còn cursor không kết luận hết nhóm;
retry vẫn cursor cũ, không request tự động để tìm hết. Hết cursor và GET mới
items0 vẫn empty thực; item/link mới hiện sau user tải trang kế tiếp.8ca denial/
503/dedupe/recovery gói trước PASS lại. Backend chỉ synthetic login/GET all-origin,
không obligation/order/payment/DB/provider thật hoặc native/human nghiệm thu.

PASS build/typecheck,449unit/57file, scoped lint JSON0, docs/diff, detector0finding.
46 CSS khớp byte; không style/asset/motion đổi, đã xem sparse390/1440 capture.
Evidence `.tmp/member-web-work-inbox-sparse-pages/` before/after/regression/log/
preservation. Demo54file/status nguyên vẹn, READINESS không đổi; không push/PR/
deploy. Backend mutation giữa2lần đọc là tình huống fixture, không là integration
race test Mongo; không suy readiness hoặc nguyên nhân server rớt đã được giải quyết.

## Việc đang chờ: denial không để cursor và mốc cập nhật cũ —05/11/2026

Nhánh `codex/member-web-work-inbox-read-access`, base `6505ccf8`; checkpoint subject
`fix(user-web): reset denied work inbox reads to the first page`.
Theo [ADR0053](../adr/0053-state-derived-work-inbox.md), inbox là lời nhắc từ trạng
thái hiện tại, không quyền thực hiện nghĩa vụ. [WorkInbox](../../apps/user-web/src/components/WorkInbox.tsx)
đã ẩn item401/403 nhưng còn load-more/serverTime cache, next-page denial Thử lại
vẫn đi cursor cũ. Nay denial ẩn load-more/time, copy quyền/phiên rõ và refetch root;
503 giữ item/time lần trước và retry cursor cũ. Không đổi filter/lanes/status,
quyền ExistingObligation, poll30giây, schema hoặc `workTarget`.

[Production fixture](../../apps/user-web/tests/work-inbox-read-access.mjs),
`pnpm --filter @used-books/user-web test:work-inbox-read-access:browser`:
baseline8/after8 PASS,390/1440 × refresh/next-page ×403/503.5item→lỗi→retry→tải
trang2: denial không item/load-more/time/empty,200 refetch root rồi mở tiếp đúng;
503 giữ5item, next retry cursor cũ. Trang2 có ID trùng version2 và1ID mới, dedupe
đúng6item, hết cursor ẩn load-more; link đầu đúng order ID. Chỉ login giả lập/GET,
all-origin HTTP mock và chặn WS/external, không obligation/payment/order mutation,
DB/provider/native/human.401 refresh thật NOT RUN, không suy API real auth PASS.

PASS build/typecheck,449unit/57file, scoped lint JSON0, docs/diff, detector0finding.
46 CSS khớp byte; không style/asset/motion đổi. Đã xem capture denial390/1440,
error/retry dùng layout hiện có. Evidence `.tmp/member-web-work-inbox-read-access/`.
Demo54file/status giữ nguyên; READINESS không đổi, không push/PR/deploy. Trang rỗng
còn cursor và dữ liệu thay đổi giữa lần tải là ca rà kế tiếp, không suy tất cả
state đọc đã được xác minh từ ca denial này.

## Hộp hội thoại: lỗi tên sách không thành bài đăng đã gỡ —05/11/2026

Nhánh `codex/member-web-chat-listing-read-recovery`, base `23632beb`; checkpoint
subject `fix(user-web): recover inbox listing reads without false unavailability`.
[ConversationInbox](../../apps/user-web/src/components/conversation/ConversationInbox.tsx)
trước mọi lỗi đọc public listing đều hiện “Bài đăng không còn công khai”, không
retry; refetch403 vẫn giữ tên/ảnh cache. Nay403/404 ẩn public cache và giữ nhãn
không công khai, các lỗi khác chưa có dữ liệu hiện chưa tải được tên sách.503 có
cache giữ tên và báo thông tin lần trước. Alert có nút tải lại thông tin riêng;
200 bỏ alert và hiện tên. Hội thoại/partner/status/link mở phòng giữ nguyên:
listing public không quyết định quyền participant đọc giao dịch. Không đổi API,
room/message/history/schema hoặc tạo mutation/giới hạn dữ liệu mới.

[Production fixture](../../apps/user-web/tests/chat-listing-read-recovery.mjs),
`pnpm --filter @used-books/user-web test:chat-listing-read-recovery:browser`:
baseline8/after8 PASS,390/1440 × initial503/initial404/cached403/cached503. Kiểm
title/alert→retry200→Mở cuộc trao đổi→Thỏa thuận giao dịch thật trong client.
Visibility và Date giả lập kiểm refetch stale60giây, không tắt animation.3profile
chat-card-visibility hồi quy PASS: lazy/focus404/loadMore/room/Back, gồm fallback
không IntersectionObserver. Không sửa legacy card hoặc suy hội thoại paging đã
thoát giới hạn100rooms. All-origin API mock/chặn WS/external; chỉ synthetic login/
GET, không chat/order/payment/DB/provider thật hoặc native/human nghiệm thu.

PASS build/typecheck,449unit/57file, scoped lint JSON0, docs/diff, detector0finding.
46 CSS production khớp byte base, không style/motion/asset đổi; thêm alert/retry
bằng class hiện có, đã xem capture390/1440. Evidence
`.tmp/member-web-chat-listing-read-recovery/` before/after/capture/log/preservation.
Demo54file/status giữ nguyên, READINESS không đổi; không push/PR/deploy. Tình trạng
đọc WorkInbox/legacy cache được rà riêng, không suy mọi lỗi chat đã được xử lý.

## Danh sách đơn: ẩn cache bị từ chối quyền và phục hồi phân trang —05/11/2026

Nhánh `codex/member-web-order-list-read-access`, base `09e809d7`; checkpoint subject
`fix(user-web): recover denied order list reads without stale cards`.
[DirectOrderListPage](../../apps/user-web/src/pages/DirectOrderPage.tsx) trước vẫn
hiện thẻ/số đếm/pager sau refetch hoặc next-page403, mô tả như server gián đoạn.
[Orders controller](../../apps/api/src/modules/orders/orders.controller.ts) dùng
ExistingObligation cho list nhưng service/current auth vẫn quyết định quyền;
không đổi API/contract/permission để hợp thức hóa giao diện.

Nay401/403 ẩn thẻ/cache, badge vai trò và pager, không báo0đơn/empty. Alert giải
thích quyền/phiên và Thử lại qua refetch.503 giữ dòng đã tải và copy báo thông tin
lần trước; lỗi next-page503 vẫn retry cursor cũ. Filter/số trang đã xem giữ qua
phục hồi. [usePagedCollection](../../apps/user-web/src/components/Pagination/usePagedCollection.ts)
thêm reset callback ổn định để cancel scan/clear lỗi transient khi consumer thấy
denial; consumer khác không gọi thì giữ hành vi cũ. Test đầu phát hiện next-page
error còn sót sau refetch200; reset xử lý đúng lỗi đó, không che lỗi khi bị từ chối.

[Production fixture](../../apps/user-web/tests/order-list-read-access.mjs),
`pnpm --filter @used-books/user-web test:order-list-read-access:browser`:
baseline8/after8 PASS (390/1440 × refresh/next-page ×403/503). Đọc20đơn→trang3→
lỗi→retry→đổi role filter. Denied ẩn cả thẻ/badge/pager, không empty;200 hiển thị
lại trang3,503 giữ4thẻ. Next denial refetch root,503 retry đúng cursor; sau phục
hồi không alert cũ, filter Đơn mua vẫn đúng. Fixture all-origin chỉ login giả lập/
GET, chặn WS và HTTP ngoài; không order/payment/chat mutation/DB/provider thật.
401 có predicate nhưng refresh/session revoke thật NOT RUN.

Hồi quy [list-pagination](../../apps/user-web/tests/list-pagination.mjs) ban đầu
FAIL vì fixture dùng BrowserRouter trong khi MyBooksPage mới có useBlocker cần
data router. Fixture đã chuyển RouterProvider/createBrowserRouter, giữ toàn bộ
assertion và mock transport; không bỏ guard hoặc sửa product để làm test xanh.
Chạy cuối PASS shared state/error/race/cursor và42screen/viewport checks; không
suy production API/native/human từ fixture. PASS Member build/typecheck,
449unit/57file, scoped lint JSON0,
detector0finding.46 CSS khớp byte base; không style/motion/asset đổi, đã xem alert
390/1440. Evidence `.tmp/member-web-order-list-read-access/` before/after/log/
capture/preservation. Demo54file/status nguyên vẹn; READINESS không đổi, không
push/PR/deploy.

## Quản lý ảnh: pin đúng target và đồng bộ URL với tệp gửi —05/11/2026

Nhánh `codex/member-web-listing-photo-identity`, base `bd9e5a95`; checkpoint subject
`fix(user-web): keep listing photo edits bound to their targets`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) trước remove/replace
theo index render. Click lặp xóa2ảnh; URL ảnh thứ2 bị bỏ không revoke khi rời.
Chooser ảnh phụ đợi trong lúc cover crop trả về chèn index0 có thể thay nhầm cover;
gửi duyệt sau đó chứa thứ tự/bytes khác ảnh người dùng muốn thay. Target đã xóa
trước chooser trả còn làm thay nhầm ảnh kế tiếp.

Nay remove/replace pin URL đã chọn. Mỗi lần cập nhật giữ URL/tệp trong snapshot
ref đồng bộ và cùng cập nhật React state; crop accept/reposition/append/remove/
replace/reset dùng cùng đường này. Cover đến muộn giữ các ảnh phụ vừa sửa, index
được tính lại tại thao tác thay, mất target báo chọn lại trước cấp preview. Click
lặp cùng URL chỉ xóa1ảnh. Focus vẫn theo vị trí hiện tại sau đổi, cleanup luôn
thấy danh sách mới. Không đổi giới hạn1cover+7ảnh phụ/10MB/MIME, body/key/version/
receipt, crop chất lượng, model/storage hoặc animation.

[Production fixture](../../apps/user-web/tests/listing-photo-identity.mjs),
`pnpm --filter @used-books/user-web test:listing-photo-identity:browser`:
baseline10/after10 PASS,390/1440 × cover-double/support-double/chooser khi cover
chèn/mất target/giới hạn. Trước click lặp xóa2 và để live1 sau Back; sau xóa đúng1,
live0. Chooser khi crop chèn trước thay nhầm cover,3ảnh upload sai intent; sau
cover giữ2URL, thay đúng ảnh phụ,3digest theo đúng thứ tự. Chỉ so boolean trong
memory, không in bytes/hash/body. Mất target trước thay ảnh kế tiếp; sau báo rõ và
cấp0URL thừa. Batch8ảnh phụ bị từ chối trước cấp URL;7ảnh phụ+cover vẫn đủ8.
Chooser completion/target removal là thứ tự sự kiện cô lập; không suy người dùng
thao tác được vào trang khi native OS picker đang khóa tương tác.

22profile hồi quy PASS trên build cuối: crop lifecycle8/reset-lostACK6/submit
guard8.2profile target-removed capture riêng, không ghi đè JSON10ca đầy đủ.
PASS build/typecheck,449unit/57file, scoped lint JSON0diagnostic, docs/diff.
Detector3color advisory cũ,46 CSS khớp byte, không style/asset/motion đổi; đã xem
capture alert390/1440. Evidence `.tmp/member-web-listing-photo-identity/`.
Toàn bộ API/upload/publishing all-origin fake, không DB/provider/native/human/
heap máy thật; không suy nghiệm thu listing thực. Demo54file/status giữ nguyên,
READINESS không đổi, không push/PR/deploy. Tiếp theo rà màn danh sách/phục hồi
dữ liệu; không suy toàn web hết lỗi từ gói ảnh.

## Vị trí cắt lỗi: khôi phục preview đã chấp nhận và dọn đúng lỗi —05/11/2026

Nhánh `codex/member-web-cover-position-recovery`, base `c7455f48`; checkpoint subject
`fix(user-web): restore accepted cover positioning after crop failure`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) trước giữ optimistic
offset mới khi decode/Canvas/encode lỗi, dù file đang giữ vẫn crop cũ; retry thành
công vẫn giữ alert lỗi cũ. Nay catch current rollback meta về ref đã chấp nhận,
giữ raw/cropped URL và file cũ. Error crop có owner message riêng: thử lại/bỏ cover
chỉ xóa alert đang khớp lỗi crop đó, không xóa lỗi khác; reset dọn ref. New-cover
error dùng cùng reporter, giữ copy hiện có. Stale error vẫn bị lifecycle loại.

[Production keyboard fixture](../../apps/user-web/tests/cover-position-recovery.mjs),
`pnpm --filter @used-books/user-web test:cover-position-recovery:browser`:
baseline6/after6 PASS,390/1440 × decode/context/blob failure. End từ50→100 bị lỗi:
trước giữ100 sai với file, sau về50; raw URL/2preview đang dùng không bị revoke.
Home/End retry thành công: trước còn alert, sau hết. Chọn tệp sai MIME rồi crop
thành công vẫn giữ lỗi tệp đó; không dọn nhầm alert. Các retry cuối created5/
revoked3/live2,2là cover còn dùng.6ca first-crop error/recovery hồi quy PASS lại.
Fixture chỉ synthetic login/GET, không upload/save/submit/DB/provider thật.

PASS build/typecheck,449unit/57file, scoped lint JSON0diagnostic, docs/diff.46 CSS
khớp byte, không JSX/style/asset/motion đổi; đã xem alert capture390/1440. Không
rerun detector cho rollback/error-owner logic,3color advisory cũ giữ nguyên ở
source. Evidence `.tmp/member-web-cover-position-recovery/` before/after/log/
capture/preservation. Demo54file/status giữ nguyên; READINESS không đổi. Native/
human/heap máy thật NOT RUN, không push/PR/deploy. Ảnh phụ và thao tác theo index
được rà riêng, không suy đã hết lỗi quản lý ảnh.

## Gửi duyệt chờ đúng lượt crop hiện tại —05/11/2026

Nhánh `codex/member-web-cover-crop-submit-guard`, base `d689f33d`; checkpoint subject
`fix(user-web): wait for the current cover crop before publishing`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) trước cho Gửi duyệt
khi crop mới đang pending, nên upload ảnh/vị trí cũ rồi crop mới mới cập nhật UI.
Nay [lifecycle](../../apps/user-web/src/lib/cover-crop-lifecycle.ts) theo dõi pending
của generation hiện tại. UI khóa Gửi duyệt ở bước5, có status/busy giải thích;
handler kiểm cả state và pending đồng bộ để chặn submit event đến trước render.
Vẫn chuyển bước/kéo/cắt bình thường. Lượt cũ đã obsolete không giữ lock, lỗi/
invalidate/remove/reset nhả guard, không tự gửi khi crop xong. Chỉ user bấm lại
sau kiểm tra. Không đổi payload/key/version/receipt hoặc nghiệp vụ gửi duyệt.

[Production fixture](../../apps/user-web/tests/cover-crop-submit-guard.mjs),
`pnpm --filter @used-books/user-web test:cover-crop-submit-guard:browser`:
baseline8/after8 PASS,390/1440 × thay ảnh/đổi vị trí/obsolete còn pending/current
crop lỗi. Trước2ca đầu gửi bytes của crop cũ, sau tất cả đúng crop được chấp nhận;
so SHA trong memory, không in bytes/hash/body. Trong pending mới, submit event
thủ công vẫn0catalog/draft/media/upload/save/submit; resolve rồi user mới gửi1lần.
Lượt cũ pending không cản gửi current đã xong; failure mở lại nút, giữ cover đã
chấp nhận.5unit guard mới kiểm stale resolve/reject không nhả lock current,
invalidate/dispose và current failure.6ca reset/lostACK hồi quy PASS; ca reset
pending cập nhật để giữ một lượt obsolete, settle current trước submit theo gate
mới. Không bỏ assertion pending: suite mới kiểm trực tiếp0command khi pending.

PASS build/typecheck,449unit/57file, scoped lint0warning, docs/diff. Detector3color
advisory đã có, literal giữ nguyên;46 CSS khớp byte, không style/asset/motion đổi.
Thêm status bằng class help hiện có, đã xem capture390/1440; không giảm hiệu ứng.
Evidence `.tmp/member-web-cover-crop-submit-guard/` before/after/unit/regression/
capture/log/preservation. Backend/upload all-origin giả lập, không DB/provider/
native/human/heap máy thật; READINESS giữ. Demo54file/status giữ nguyên, không
push/PR/deploy. Preview vị trí cắt optimistic khi xử lý lỗi còn cần đối chiếu
với crop đã chấp nhận; không suy đã hết lỗi editor.

## Đăng cuốn khác: tách trạng thái trợ lý giá của cuốn cũ —05/11/2026

Nhánh `codex/member-web-price-assist-restart`, base `69779bb6`; checkpoint subject
`fix(user-web): reset price assistance for a new listing attempt`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) trước giữ assist/
reference/phase/busy qua reset. Cuốn mới hiển thị range cũ dù đã stale; request
cuốn cũ còn pending khiến nút cuốn mới tiếp tục disabled. Nay reset về idle/null/
catalog, tăng token và nhả busy của lượt cũ. Phase/finally chỉ cập nhật nếu token
còn đúng, không nhả lock hoặc đổi phase của lượt mới khi request cũ kết thúc.
finish/fail/reference vẫn theo guard token hiện có. Không tự hỏi AI, hủy HTTP,
đổi receipt/key/body/quota, hoặc sửa dữ liệu gợi ý đã lưu với bài trước.

[Production fixture](../../apps/user-web/tests/price-assist-restart.mjs),
`pnpm --filter @used-books/user-web test:price-assist-restart:browser`:
baseline4/after4 PASS,390/1440 × ready/pending. Điền cuốn1→xin gợi ý→gửi duyệt→
Đăng cuốn khác→điền cuốn2→xin gợi ý mới. Trước giữ40–60k từ cuốn1 hoặc disabled
tới khi request cũ xong; sau không hiện range cũ, user có thể bấm xin gợi ý cho
cuốn mới. After pending còn giữ response mới, trả response cũ trước: không ghi
đè range/trạng thái mới, loading vẫn khóa; release mới mới hiện70–90k. Mỗi cuốn
có catalog/draft/media/upload/finalize riêng khi user chủ động hỏi; chỉ cuốn1
save/submit1lần. Harness sửa locator range để chọn paragraph thay parent actions.

Mọi API/upload/AI là synthetic all-origin, không provider/DB thật. API thật vẫn
có thể từ chối theo quyền/quota hoặc Pending/member; fixture không chứng minh
được gọi2model đồng thời. PASS build/typecheck,444unit/57file, scoped lint0warning,
docs/diff.46 CSS khớp byte, không JSX/style/asset/motion đổi; không rerun detector
cho reset/token guard. Local evidence `.tmp/member-web-price-assist-restart/`.
Demo54file/status giữ nguyên; READINESS không đổi; native/human NOT RUN, không
push/PR/deploy. Crop đang xử lý khi gửi bài vẫn là đường tiếp tục kiểm riêng.

## Đăng cuốn khác: dọn cover và bỏ crop của lượt trước —05/11/2026

Nhánh `codex/member-web-listing-restart-previews`, base `50cf63db`; checkpoint
subject `fix(user-web): release cover state when restarting a listing`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) sau ACK→Đăng cuốn
khác trước chỉ thu hồi cropped URL của form; raw cover/meta còn giữ. Crop pending
từ lượt cũ trả về còn có thể đưa ảnh vào form mới. Nay reset invalidate crop,
thu hồi raw hiện tại và xóa metadata/ref cùng phần reset cũ; không đổi receipt,
fresh DraftAttempt, catalog/upload stage keys, guard hay hiệu ứng confirmation.

[Production fixture](../../apps/user-web/tests/listing-restart-previews.mjs),
`pnpm --filter @used-books/user-web test:listing-restart-previews:browser`:
baseline6/after6 PASS (390/1440 × success/mất ACK submit/crop pending tới sau reset).
Đi từ login→Đăng sách→điền các bước→Gửi duyệt→Đã gửi duyệt→Đăng cuốn khác. Trước
live1/1/2, sau0/0/0; title form mới trống, không lặp catalog/draft/media/bytes/
finalize/save đã ACK. Mất ACK vẫn đúng key/body cho submit retry. Pending crop
trong fixture dùng canvas callback giữ lại, không là evidence đã khóa submit khi
đang crop; đường đó còn kiểm riêng. Mọi publishing/upload/backend là all-origin
fixture, không ghi DB/storage/provider hoặc chứng minh review Staff/AI thật.

PASS build/typecheck,444unit/57file, scoped lint0warning, docs/diff.46 CSS khớp
byte, không JSX/style/asset/motion đổi; không rerun detector cho reset handler.
Local evidence `.tmp/member-web-listing-restart-previews/` before/after/log/
preservation. Demo54file/status giữ nguyên; READINESS không đổi. Native/human/
heap máy thật và AI trợ lý xuyên reset chưa kiểm ở gói này; không push/PR/deploy.

## Tiến độ đăng sách theo đúng địa chỉ hiện tại —05/11/2026

Nhánh `codex/member-web-origin-progress`, base `817ac3f5`; checkpoint subject
`fix(user-web): refresh listing progress with origin validity`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) memo progressFields
trước bỏ dependency của hasValidOriginAddress. Sửa/chọn nơi gửi không tăng tiến
độ, hoặc GET mới bỏ địa chỉ/khu vực nhưng tiến độ vẫn tính là hợp lệ. Nay callback
ổn định theo addresses.data/serviceAreas.data/selected ID/form, memo phụ thuộc
callback đó. Giữ nguyên validation, vùng luân chuyển, guard gửi/tiếp tục, dữ liệu
form và API; không tự lưu địa chỉ hoặc đổi quy tắc fallback của địa chỉ.

[Production fixture](../../apps/user-web/tests/origin-progress.mjs),
`pnpm --filter @used-books/user-web test:origin-progress:browser`: baseline8/
after8 PASS (390/1440 × chọn/bỏ địa chỉ đã lưu/nhập mới+invalid phone/địa chỉ bị bỏ
sau GET mới/khu vực bị bỏ sau GET mới). Trước5→5 dù chọn/nhập hợp lệ; sau5→6,
invalid trở về5. Sau xác lập memo hợp lệ, refetch bỏ dữ liệu trước giữ6, sau về5.
Refetch đi qua visibility và cache hết staleTime bằng Date giả lập, không tắt
timer/animation; fixture không POST ngoài synthetic login và không ghi DB/provider.
Harness ban đầu thiếu hậu tố `(VNĐ)` ở label giá, sửa selector theo source; không
sửa product cho phù hợp test. Lượt cuối baseline/after dùng cùng selector đúng.

PASS build/typecheck,444unit/57file, scoped lint0warning, docs/diff.46 CSS khớp
byte, không JSX/style/asset/motion đổi. Không chạy lại detector cho dependency/
callback diff;3color advisory đã ghi ở gói trước giữ nguyên literal tại base.
Evidence local `.tmp/member-web-origin-progress/` before/after/log/preservation.
Không là native/human hoặc xác minh API/address storage thật. Demo54file/status
giữ nguyên; READINESS không đổi, không push/PR/deploy.

## Ảnh bìa: giữ lượt cắt mới nhất, bỏ kết quả sau xóa/rời trang —05/11/2026

Nhánh `codex/member-web-cover-crop-lifecycle`, base `012cfde5`; checkpoint subject
`fix(user-web): discard obsolete cover crop results`.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) trước áp dụng mọi
crop response theo thứ tự trả về: ảnh/vị trí cũ ghi đè mới, xóa rồi ảnh xuất hiện
lại, hoặc ảnh tạo URL sau unmount không còn owner. [Lifecycle](../../apps/user-web/src/lib/cover-crop-lifecycle.ts)
gắn generation mỗi lượt; chỉ lượt mới nhất khi còn mounted được áp dụng. Xóa
cover invalidate, cleanup dispose, activate giữ StrictMode cũ không sống lại.
Response stale thu hồi cropped URL, raw URL chỉ thu hồi nếu chính lượt đó tạo;
reposition mượn raw hiện tại giữ nó. Error stale không thay error/focus mới; error
current vẫn theo đường lỗi có sẵn. Khi accept, revoke crop thực sự đang giữ ở ref
thay snapshot render cũ. Không khóa/rút ngắn kéo cắt hoặc đổi chất lượng/crop rule.

[Production `/sell` fixture](../../apps/user-web/tests/cover-crop-lifecycle.mjs),
`pnpm --filter @used-books/user-web test:cover-crop-lifecycle:browser`:
baseline8/after8 PASS,390/1440 ×2ảnh đảo thứ tự/Trái→Phải đảo thứ tự/xóa khi pending/
Back xác nhận Rời trang khi pending. Giữ toBlob callbacks rồi trả lượt sau trước.
Trước ảnh đầu/vị trí Trái ghi đè lựa chọn sau; sau giữ ảnh mới/Phải100. Live URL
trước4/3/2/2 theo4ca; sau2/2/0/0,2là raw+crop đang dùng. Browser đi qua entry
login→kệ→Đăng sách, thao tác và modal rời thật; backend synthetic all-origin,
không upload/draft/save/submit/provider. [8unit lifecycle](../../apps/user-web/src/lib/cover-crop-lifecycle.test.ts)
kiểm order, borrowed URL, invalidate/dispose/reactivate và late/current error.
6ca failure/recovery gói trước PASS lại trên production cuối.

PASS build/typecheck,444unit/57file, scoped lint exit0 (1warning memo dependency
đã có), docs/diff. Detector3 advisory literal color đã có ở base; không có thay
đổi palette/JSX/style/asset/motion.46 CSS production khớp byte, so block memo và
literal xác nhận cảnh báo không do diff này. Evidence
`.tmp/member-web-cover-crop-lifecycle/` before/after/unit/regression/log/preservation.
Demo54file/status giữ nguyên; READINESS không đổi. Native/human/heap máy thật
NOT RUN. Reset sau Đăng cuốn khác, crop đang chạy khi submit và memo theo địa chỉ
là các đường caller còn cần kiểm riêng; không suy hoàn tất toàn bộ wizard.

## Ảnh bìa: thu hồi URL khi crop lỗi, giữ ảnh gốc khi đổi vị trí —05/11/2026

Nhánh `codex/member-web-cover-crop-failure`, base `bde3c790`; checkpoint subject
`fix(user-web): release failed cover crop previews`.
[cropImageToCover](../../apps/user-web/src/lib/image-crop.ts) trước tạo raw URL
rồi decode/Canvas/encode; nếu lỗi, URL không được trả cho caller nên không có
owner thu hồi. `/sell` vẫn cho chọn lại ảnh tốt nhưng URL lỗi bị sót lại. Nay
wrapper thu hồi raw URL do chính lần gọi tạo khi crop thất bại; caller đưa raw
URL có sẵn để đổi vị trí thì không thu hồi nó, giữ ảnh cũ dùng được. Thành công
vẫn chuyển ownership raw/cropped URL cho SellBookPage. Decode error có thông báo
tiếng Việt hướng dẫn chọn ảnh khác, giữ cause; không đổi crop/format/chất lượng.

[Unit](../../apps/user-web/src/lib/image-crop-failure.test.ts):10ca ownership,
decode/context/blob-null/encode-throw cho URL mới/caller, success/reposition.
Baseline4fail/6pass; sau10pass. [Production `/sell` fixture](../../apps/user-web/tests/cover-crop-failure.mjs),
`pnpm --filter @used-books/user-web test:cover-crop-failure:browser`: baseline6/
after6 PASS,390/1440 × ảnh hỏng/Canvas-null/toBlob-null, rồi chọn ảnh tốt, xóa và
về bước1. Mỗi ca trước created3/revoked2/live1; sau3/3/0, title giữ nguyên,
error phục hồi và không pageerror. Chỉ synthetic login, GET; API/upload/catalog/
AI/provider không ghi hay gọi thật. Canvas lỗi là fault injection trong fixture,
không thay cài đặt máy hoặc chứng minh browser mọi thiết bị đã được kiểm.

PASS build/typecheck,436unit/56file, scoped lint/docs/diff.46 CSS production khớp
byte base; không JSX/style/asset/motion đổi. Đã xem capture decode error390/1440;
không chạy lại detector cho helper/copy lỗi, không có layout mới. Evidence local
`.tmp/member-web-cover-crop-failure/` baseline/after/unit/capture/log/preservation.
Demo54file/status giữ nguyên; READINESS không đổi. Không native/human/heap máy
thật/push/PR/deploy. Async crop trả về sau rời trang hoặc nhiều crop chồng nhau
là vòng đời caller riêng, chưa suy đã giải quyết từ cleanup failure này.

## Ảnh Autofill: thu hồi preview StrictMode và bỏ đúng ảnh khi click lặp —05/11/2026

Nhánh `codex/member-web-autofill-preview-lifetime`, base `76553495`; checkpoint
subject `fix(user-web): own autofill previews outside state updaters`.
[PhotoAutofill](../../apps/user-web/src/components/PhotoAutofill/index.tsx) trước
tạo URL trong updater của setFiles: React dev StrictMode gọi lại updater, chọn3
ảnh tạo6URL nhưng remove/unmount chỉ thu hồi3. Production không có leak này ở
ca đã thử. Remove dùng index trong updater: double click cùng node ảnh đầu xóa
2ảnh khác nhau, tái hiện ở cả dev và production.

Nay handler tạo preview1lần sau validation, filesRef cập nhật đồng bộ với state
để cleanup luôn thấy selection mới; không cấp URL trong render/updater. Remove
pin vào URL của ảnh đã bấm, click lặp không xóa ảnh khác. Giữ ảnh còn lại, thứ tự,
giới hạn3ảnh/10MB/MIME, disabled/read lock và error copy. Không đổi preview render,
crop/AI/upload/key/body/receipt hoặc motion. Cleanup vẫn thu hồi ảnh khi rời panel.

[Lifetime fixture](../../apps/user-web/tests/autofill-preview-lifetime.mjs),
`pnpm --filter @used-books/user-web test:autofill-preview-lifetime:browser`:
baseline8/after8 PASS (StrictMode dev/production ×390/1440 ×1/3ảnh). Trước dev
live URL1/3 sau unmount; sau mọi profile created=revoked, live0. Batch sai MIME/
quá3ảnh cấp0URL. Với3ảnh, click lặp Bỏ ảnh1 trước còn1ảnh, sau còn2; cleanup cuối
thu hồi đủ ảnh được nhận. Harness reset NODE_ENV theo mode để Vite dev không
làm bundle production dùng nhầm React development; không suy dev PASS thành prod.
Không auth/API/upload/AI/provider trong fixture; không đo heap máy thật hoặc
native/human. PASS lại6ca `/sell` ISBN/error/exact AI retry trên production cuối.

PASS build/typecheck,426unit/55file, scoped lint/docs/diff và detector0finding;
46 CSS production khớp byte baseline, không style/asset/motion đổi. UI không có
bố cục mới, capture hồi quy `/sell` giữ ở gói read-lock. Local evidence
`.tmp/member-web-autofill-preview-lifetime/`; demo54file/status giữ nguyên theo
fingerprint. READINESS không đổi, không DB/provider/push/PR/deploy.

## Điền nhanh từ ảnh: khóa đọc tức thời, giữ retry sau mất ACK —05/11/2026

Nhánh `codex/member-web-autofill-read-lock`, base `d0ba6b52`; checkpoint subject
`fix(user-web): guard repeated photo autofill reads`.
[PhotoAutofill](../../apps/user-web/src/components/PhotoAutofill/index.tsx) trước
chỉ dùng reading state làm guard;2click cùng lượt JavaScript vượt guard trước
React commit, gây2POST ISBN. Draft/upload stages và AI ask đã coalesce ở service;
không suy có2draft/media hoặc gọi model2lần. Theo [ADR0048](../adr/0048-listing-photo-autofill.md)
và [ADR0056](../adr/0056-listing-assist-fast-paths.md), giữ ISBN trước AI, không
tự điền, xác nhận trước ghi đè. Nay ref lock đặt đồng bộ trước await, nhả finally;
đồng thời kiểm disabled từ parent. Không đổi phase/copy/JSX/motion hoặc services.

[Production app fixture](../../apps/user-web/tests/autofill-read-lock.mjs),
`pnpm --filter @used-books/user-web test:autofill-read-lock:browser`: baseline6/
after6 PASS, Member login→`/sell`→Tự nhập→chọn ảnh→Đọc,390/1440 × ISBN nhiều mã/
lookup503 rồi retry/force AI mất ACK rồi retry. ISBN mỗi lần bấm lặp2→1request;
lookup lỗi rồi thử lại3→2 tổng. Mỗi profile vẫn1draft/media/upload/finalize, không
upload lại; lỗi giữ ảnh và tên đang nhập. ISBN Ambiguous không gọi AI tự động.
Force AI mất ACK có2HTTP tổng (thử đầu+retry), key/body y nguyên; retry giữ ý định
AI và không quay lại ISBN. AI trả title không tự ghi đè; người dùng bấm Dùng rồi
xác nhận mới đổi tên. Key/body chỉ so sánh boolean trong memory, không in payload.

Mọi API/upload all-origin mô phỏng, HTTP ngoài fixture/WS bị chặn. Không gọi AI,
barcode/storage thật, save/submit, DB hay provider. Đây là production Member web
entry với synthetic backend, không thay native/AI chất lượng/human nghiệm thu.
PASS build/typecheck,426unit/55file, scoped lint/docs/diff và detector0finding.
46 CSS production khớp byte baseline; đã xem capture sau phục hồi390/1440, không
đổi style/asset/motion. Evidence local `.tmp/member-web-autofill-read-lock/`.
Demo54file/status giữ nguyên theo fingerprint; READINESS không đổi, không push/
PR/deploy. Các vấn đề object URL/lifecycle ảnh được rà riêng, không suy gói này
đã xử lý mọi lỗi Autofill hoặc nguyên nhân server rớt.

## Giá tham chiếu: phục hồi khi hết hạn, không xác nhận nhầm kết quả mới —05/11/2026

Nhánh `codex/member-web-price-reference-expiry`, base `3f8a6ba2`; checkpoint
subject `fix(user-web): bind reference confirmation to its current result`.
Theo [ADR0056](../adr/0056-listing-assist-fast-paths.md), khoảng theo quy tắc có
hạn5phút và quyết định áp dụng là thủ công, không attribution AI.
[PriceReferencePanel](../../apps/user-web/src/components/PriceReferencePanel.tsx)
đã có guard fresh lúc click/confirm nhưng trước không tự đổi UI khi hết hạn:
nút có thể còn enabled mà không phản hồi. Nếu response mới về khi modal đang mở,
selected amount cũ vẫn áp dụng được vào kết quả mới; cùng vấn đề khi kết quả quá
hạn đã bị unmount rồi được thay bằng kết quả fresh, modal cũ có thể xuất hiện lại.

Panel dùng lại expiry hook của gói trước: hết hạn bỏ lựa chọn cũ khỏi UI, báo cách
yêu cầu lại hoặc tự nhập giá nếu chưa có AI ready. Click quá hạn khi timer trễ
cũng refresh trạng thái. Xác nhận được pin vào object kết quả đã chọn; response
khác đóng xác nhận cũ, người dùng chọn lại mức trong kết quả mới. Không đổi hạn
dùng, nguồn/rule/giá thủ công, clearAiPriceAttribution, API/quota hoặc tạo request
mới tự động. Không sửa provider hay AI auto review/readiness.

[Browser component fixture](../../apps/user-web/tests/price-reference-expiry.mjs),
`pnpm --filter @used-books/user-web test:price-reference-expiry:browser`:
baseline12/after12 PASS (390/1440 × direct expired/confirm expired/timer expired/
response replacement/refresh sau expiry/valid). Trước replacement áp dụng40k từ
modal cũ dù kết quả mới70–90k; sau không đổi55k đã nhập, chọn lại70k mới apply.
Các ca hết hạn không apply, có hướng dẫn, ca hợp lệ vẫn confirm1lần. PASS lại10ca
AI expiry trên component build cuối để kiểm consumer chung. Fixture bundle Vite
production với font/CSS hiện có, chặn external HTTP/WS/API; **không** chứng minh
toàn wizard/catalog/upload/AI thật, native hoặc human nghiệm thu.

PASS Member build/typecheck,426unit/55file, scoped lint, docs/diff; detector0finding.
Đã xem capture quá hạn390/1440;46 CSS production khớp byte checkpoint, không đổi
style/motion/asset. Evidence local `.tmp/member-web-price-reference-expiry/`;
AI regression giữ log riêng. Demo54file/status giữ nguyên theo fingerprint;
READINESS không đổi, không DB/provider/push/PR/deploy.

## Gợi ý giá: kiểm hạn lúc áp dụng và khi hộp xác nhận đang mở —05/11/2026

Nhánh `codex/member-web-price-assist-expiry`, base `865d8266`; checkpoint subject
`fix(user-web): enforce price suggestion expiry at apply time`.
Theo [ADR0028](../adr/0028-listing-price-assistant.md) và `isStale` của shared
session-client, gợi ý hết hạn không được áp dụng; seller vẫn tự nhập giá được.
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) bước4 nhận onApply
từ [PriceAssistPanel](../../apps/user-web/src/components/PriceAssistPanel.tsx).
Panel trước chỉ tính stale trong render: để màn hình yên hoặc mở xác nhận chờ
qua expiresAt vẫn áp dụng được giá cũ. Không là lỗi tiền/ledger hoặc auto review.

Panel nay kiểm `isStale` ngay lúc bấm chọn và lúc xác nhận; quá hạn giữ nguyên giá
đang nhập, hiện cảnh báo cũ và khóa nút áp dụng. [Expiry hook](../../apps/user-web/src/hooks/useExpiryRefresh.ts)
đặt một timeout tới deadline, kiểm lại khi tab visible, có cleanup timer/listener
và giới hạn delay32bit; không thêm polling/rerender mỗi giây. Guard lúc bấm vẫn
bắt được hết hạn khi timer bị trì hoãn. Không đổi rule/nguồn giá, API/quota/model,
key/body/receipt, save attribution, hoặc quyền seller nhập tay/thoát màn hình.

[Browser component fixture](../../apps/user-web/tests/price-assist-expiry.mjs),
`pnpm --filter @used-books/user-web test:price-assist-expiry:browser`: baseline10/
after10 PASS,390/1440 × direct quá hạn/confirm quá hạn/timer quá hạn/direct còn
hạn/confirm còn hạn. Fixed Date kiểm race mà không chạy timer; Playwright clock
runFor kiểm deadline tự khóa. Bản trước dùng giá quá hạn trong cả2 đường, nút
không tự khóa; bản sau không thay ô giá hoặc đếm apply, ca hợp lệ vẫn apply1lần,
nhập tay vẫn được. Bundle component thật qua Vite production, CSS/font hiện có;
chặn external HTTP/WS và mọi API. Đây là component cô lập, **chưa kiểm entry toàn
wizard**, không auth/upload/catalog/provider/AI thật và không nghiệm thu human.

PASS Member build/typecheck,426unit/55file, scoped lint, docs/diff; detector0finding.
Đã xem capture390/1440 của trạng thái quá hạn.46 CSS production khớp byte với
checkpoint trước; không style/motion/asset đổi. Local evidence
`.tmp/member-web-price-assist-expiry/` before/after build/JSON/capture/log và
preservation; fixture tạm ở app `.tmp/` ignored. Demo54file/status giữ nguyên;
READINESS không đổi, không DB/provider/push/PR/deploy. Rule-based reference đã có
guard fresh ở mỗi click/confirm, chưa sửa UI deadline của nó trong gói này.

## Lịch sử Ví: ẩn cache khi bị từ chối quyền đọc —05/11/2026

Nhánh `codex/member-web-wallet-history-access`, base `cc42b67f`; checkpoint
subject `fix(user-web): hide wallet history after denied reads`.
[WalletHistory](../../apps/user-web/src/pages/WalletHistory.tsx) trước vẫn render
các giao dịch/số dư sau giao dịch đã cache khi refetch403. Nếu fetch trang tiếp
403 còn giữ dòng cũ và hướng dẫn bấm Sau như lỗi mạng. [Controller](../../apps/api/src/modules/wallet/wallet.controller.ts)
và [history service](../../apps/api/src/modules/wallet/wallet.service.ts) vẫn yêu
cầu Member/current actor qua readObligation; ExistingObligation không tự cấp mọi
quyền. Đây là trạng thái từ chối đọc ở UI, không sửa backend/ledger/contract.

Sau sửa401/403 ẩn các dòng/số dư lịch sử và pager, không hiện empty hay hướng dẫn
giữ cache. Alert hiện có giải thích quyền/phiên và có Thử lại. Cả refetch và next
page denial đều dùng đường phục hồi refetch hiện có; chỉ đọc thành công mới cho
hiện dữ liệu lại. Giữ filter, numeric pagination/focus và withdrawal state badge.
503 giữ các dòng đã tải cùng alert; next page503 vẫn retry đúng cursor, không tự
đổi trang hoặc hiện trống. Không xóa cache chung hay đổi session/token transport.

[Production browser fixture](../../apps/user-web/tests/wallet-history-access.mjs),
`pnpm --filter @used-books/user-web test:wallet-history-access:browser`: baseline8/
after8 profile PASS (390/1440 × refetch/next-page ×403/503). Các ca tải20 dòng,
mở trang2, gây lỗi, kiểm cache/pager/error/empty, phục hồi rồi kiểm dòng/badge.
Next-page403 phục hồi từ root,503 retry cursor cũ; mọi thao tác sau synthetic
login chỉ GET. Mock all-origin HTTP, chặn WS/provider. Không body/key/PII thật.
Harness đầu gọi số trang3 chưa tải và timeout; sửa selector theo component thật:
chỉ các trang đã tải có số, dùng nút Sau để mở trang mới; không sửa product để
phù hợp test. Baseline và after cuối cùng đều PASS cùng harness đã sửa.

PASS build/typecheck,426unit/55file, scoped lint, docs/diff; detector WalletHistory
0finding. Đã xem capture lỗi403390/1440: error/retry trong receipt hiện có, không
overflow;46 CSS production khớp byte base, không style/animation/asset thay đổi.
Evidence local `.tmp/member-web-wallet-history-access/` before/after JSON/capture,
build/typecheck/unit/lint/detector và preservation. Demo54file/status giữ nguyên
theo fingerprint.401 có predicate nhưng refresh/revoke session thật, API/Mongo,
provider/native/người thật NOT RUN; fixture403 không chứng minh server thực tế
đang có lỗi phân quyền. READINESS không đổi, không push/PR/merge/deploy.

## Ví: chặn vòng cursor và dừng tải đếm đơn khi rời trang —05/11/2026

Nhánh `codex/member-web-pending-withdrawal-pagination`, base `504c4b0b`; checkpoint
subject `fix(user-web): bound pending withdrawal pagination lifecycle`.
[PendingWithdrawalNotice](../../apps/user-web/src/pages/PendingWithdrawalNotice.tsx)
trước tải liên tiếp mọi trang Requested mà không kiểm cursor lặp hoặc query bị
hủy. Source backend [withdrawal service](../../apps/api/src/modules/wallet/withdrawal.service.ts)
lọc owner/state, sắp createdAt/id và trả cursor; không đổi contract/giới hạn/quyền.

[Collector](../../apps/user-web/src/lib/pending-withdrawals.ts) giữ thứ tự ID đầu
tiên, loại trùng, chỉ đếm Requested và chỉ trả tổng khi đọc trọn danh sách. Cursor
đã đọc xuất hiện lại thì reject qua error/retry hiện có, không gửi lại trang đó.
Query signal được kiểm trước/sau mỗi await: rời Ví dừng trang kế tiếp. Shared
session transport hiện sở hữu AbortController timeout riêng; gói này **không hủy
HTTP đang chạy**, không sửa transport/session hoặc tự giới hạn số trang hợp lệ.
Polling15giây theo visibility và invalidate summary/history giữ nguyên.

| Ca390/1440 / production fixture | Trước → sau |
| --- | --- |
| Cursor A→B→A | Trước fixture phải chặn ở request6 bằng503; sau dừng ở3 và hiện error, không hiện tổng thiếu |
| Rời Ví sang Giỏ sách khi trang đầu chưa trả | Trước tiếp tục đủ3 request; sau1 request đang chạy hoàn tất, không đọc A/B |
| Trang2 lỗi rồi Thử lại | Không xuất bản tổng thiếu; retry từ đầu đọc đủ3 trang và đếm4 ID duy nhất |
| Ba trang hợp lệ, có ID trùng | Vẫn3 request, tổng4; không cắt dữ liệu để giảm request |

[Browser fixture](../../apps/user-web/tests/pending-withdrawal-pagination.mjs),
`pnpm --filter @used-books/user-web test:pending-withdrawal-pagination:browser`:
baseline8/after8 profile PASS, mock all-origin HTTP và chặn WS/provider. Timing
rời trang được tái hiện bằng giữ response đầu; unit deferred race kiểm xác định
signal hủy trước resolve không được đọc tiếp.7unit mới còn kiểm abort trước đọc,
vòng cursor, trang rỗng có cursor, empty hoàn chỉnh, lọc/dedupe và retry sạch.

PASS Member build/typecheck,426unit/55file, scoped lint, docs/diff.46 CSS production
khớp byte với base; không JSX/style/animation mới, không chạy lại detector cho
diff điều phối. Đã xem capture error/retry390/1440. Evidence local
`.tmp/member-web-pending-withdrawal-pagination/` gồm before/after JSON/capture,
build/typecheck/unit và CSS. Không API/Mongo/provider/native/người thật nghiệm
thu trong gói này, không suy nguyên nhân server rớt đã được giải quyết. Demo giữ
nguyên54file theo fingerprint; không push/PR/deploy, READINESS không đổi.

## Rút tiền: giữ yêu cầu sau mất ACK rồi bị từ chối quyền —05/11/2026

Nhánh `codex/member-web-withdrawal-retry-permission`, base `ebc04445`; commit cùng
điểm lưu có subject `fix(user-web): retain withdrawal intent after permission refusal`.
Tiếp tục gia cố sau tích hợp main. Đối chiếu ADR0073, protocol auth trước replay
và [withdrawal service](../../apps/api/src/modules/wallet/withdrawal.service.ts):
quyền hiện tại vẫn phải được kiểm trước trả receipt. Không đổi nghiệp vụ/quyền,
API/contract/ledger/hold, không cho gửi vượt available hoặc bỏ phiên hiện tại.

[WalletWithdrawals](../../apps/user-web/src/pages/WalletWithdrawals.tsx) trước
nhả pending khi403. Nếu POST đã commit nhưng ACK thất lạc, rồi lần kiểm lại bị403,
UI mở form và cấp key mới ở lần gửi tiếp;403 không chứng minh POST cũ chưa thành
công. Bỏ403 khỏi nhóm refusal xác định: giữ payload/key cũ, trạng thái uncertain,
preview số dư đã pin và khóa chỉnh sửa; chỉ receipt hợp lệ mới kết thúc yêu cầu.
Người dùng không được tự mở quyền; retry vẫn có thể bị API từ chối tiếp.

| Member → Ví → Rút tiền / ca | Bằng chứng |
| --- | --- |
| Submit → ACK mất → kiểm lại403 → gửi tiếp | Baseline390/1440 dùng key mới ở request3; sau sửa3request cùng key/body, giữ số tài khoản có0đầu và chỉ mở detail sau receipt |
| ACK mất → kiểm lại408/429/503 → receipt | Hồi quy giữ nguyên intent, không cho Chỉnh sửa trong trạng thái chưa rõ kết quả |
| Submit409 xác định | Giữ hành vi mở lại form, giữ số tiền/nội dung cho người dùng sửa; không tự submit tiếp |
| Bấm xác nhận2lần cùng lượt | Ref guard hiện có vẫn1POST trước retry; không sửa handler hoặc stage khác |

[Production fixture](../../apps/user-web/tests/withdrawal-retry-permission.mjs),
`pnpm --filter @used-books/user-web test:withdrawal-retry-permission:browser`.
Baseline4/after10 profile390/1440 PASS. Fixture mô phỏng commit/hold, mất ACK,
refusal và receipt; chặn all-origin HTTP ngoài fixture và WS. Key/body chỉ so
sánh boolean trong memory, không ghi request body vào evidence. Synthetic auth,
recipient/withdrawal/summary đều không là giao dịch thật hoặc chứng minh API đã
giữ/chi tiền nguyên tử. Không gọi Admin approval, DB hoặc ngân hàng/provider.

PASS build/typecheck,419 unit/54 file, scoped lint.46 CSS production khớp byte
với base; không đổi JSX/style/animation/asset. Đã xem capture review pending390/
1440; input vẫn khóa, preview/copy hiện có giữ nguyên. Không chạy lại detector
cho diff chỉ sửa predicate và comment, không có JSX/style mới. Evidence local
`.tmp/member-web-withdrawal-retry-permission/` before/after/build/CSS/capture.

Giới hạn: chưa kiểm401 refresh, actor đổi giữa request, native/thiết bị thật,
API/Mongo auth/replay/ledger hoặc nghiệm thu người thật trong gói này. Pending
còn component-local; guard hiện có chặn rời khi uncertain, không bền qua reload.
Không suy đã đóng mọi lỗi rút tiền hoặc READINESS. Checkout demo không thay đổi.

## Thẻ Ví: chưa đọc được tiền ký quỹ không thành0 — hoàn tất05/11/2026

Nhánh `codex/member-web-wallet-summary-read-states`, base `b1a177ad`; commit cùng
điểm lưu có subject `fix(user-web): distinguish unknown wallet held balances`.
Owner yêu cầu xử lý nốt gói đang dở. Baseline8 profile đã có từ04/11;05/11 kiểm
lại branch/working tree và không còn process fixture chạy. Chỉ harness mới chưa
tracked, source chưa sửa trước khi tiếp quản.

[WalletPage](../../apps/user-web/src/pages/WalletPage.tsx) trước che số dư khả dụng
khi GET lỗi nhưng ký quỹ vẫn format fallback0 hoặc giữ số cũ. Sau sửa hai số có
cùng semantics: đang tải hiện chữ chờ, lỗi hiện “—”; GET200 có0 vẫn hiện0 thật.
Thông báo lỗi dùng style chung sẵn có, liên kết với nút làm mới qua aria-describedby.
Nút hiện có chỉ refetch summary/invalidate history; không đổi lệnh hay quyền.

| Member → Ví / ca | Trước | Sau |
| --- | --- | --- |
| GET đang chờ, chưa có dữ liệu | Ký quỹ0 | Đang tải… |
| GET đầu503 | Ký quỹ0 dù khả dụng là “—” | Cả hai “—”, thông báo chưa tải được và làm mới |
| Đã đọc ký quỹ25.000 → làm mới503 | Ký quỹ cũ vẫn hiện như hiện tại | Không trình bày số cũ như xác nhận mới; “—” tới GET thành công |
| Làm mới thành200 / số0 hoặc khác0 | Giá trị xác nhận từ API | Giữ đúng0/25.000 và75.000; lỗi biến mất sau phục hồi |

[Production fixture](../../apps/user-web/tests/wallet-summary-read-states.mjs),
`pnpm --filter @used-books/user-web test:wallet-summary-read-states:browser`:
baseline8/after8 profile390/1440 ×initial-error/cached-error/zero/nonzero PASS.
Mọi origin/WS chặn hoặc fixture; recovery chỉ GET, không topup/payment/ledger.
Hồi quy `test:wallet-layout:browser`5 profile320/390/768/1440, gồm390 chữ125%,
thao tác/dialog focus/history filter PASS. Sheen vẫn8000ms với keyframe0/0.8/1.
Đã xem capture phục hồi390/1440; không overflow ở các ca đã kiểm.

PASS build/typecheck,399 unit/53 file, scoped lint, detector0 và docs check.
46 CSS production khớp byte; không sửa CSS/motion/asset, session/API/contract,
ledger, provider hoặc READINESS. Evidence local
`.tmp/member-web-wallet-summary-read-states/` before/after/build/CSS/capture;
hồi quy bố cục ở `.tmp/member-web-wallet-layout/result.json`.

Không sửa DashboardExchangeFocus: source còn file nhưng tìm consumer hiện tại
không có, AccountOverview không mount component này. Không suy mã chưa gắn vào
UI thành lỗi runtime. API/Mongo/provider/native/human acceptance NOT RUN; gói
này sửa diễn đạt trạng thái đọc, không chứng minh hay sửa nguyên nhân server rớt.
Đã hoàn tất gói dở, không mở gói mới trong lượt xử lý này. Các giới hạn runner
qua remount, địa chỉ/AI và môi trường thật vẫn theo SESSION_STATE.

## Thông báo: loading/error không thành đã đọc hết; denial không hiện cache cũ

Nhánh `codex/member-web-notification-read-states`, base `7871737f`; commit cùng
điểm lưu có subject `fix(user-web): distinguish unknown notification read states`.
[NotificationsPage](../../apps/user-web/src/pages/NotificationsPage.tsx) trước
fallback unreadCount0 khi chưa có data: header báo đã đọc hết cả lúc loading/503.
Refetch403/404 vẫn hiện nội dung đã cache; lỗi403 ở trang sau không có nút retry
toàn danh sách. Không đổi endpoint, session client, mark-read hay nghiệp vụ.

| Member → entry / ca | Kết quả sau sửa |
| --- | --- |
| Menu Thông báo → GET đang chờ | Header đang tải; không số0 giả ở tab hoặc thông báo đã đọc hết |
| Lần đọc đầu503 → Thử tải lại | Chưa xác minh; retry GET thành công mới hiện count/nội dung |
| Có cache (cả unread0) → Giỏ sách → Back → GET503 | Giữ dữ liệu cũ và ghi rõ lần tải trước; không kết luận hiện tại đã đọc hết |
| GET403/404 sau cache | Ẩn body, số đếm, read-all và pager; giữ thông báo lỗi/retry. Không dùng cache để thay quyền hiện tại |
| Sau trang1 → tải trang2 bị403 → retry → tải trang2 lại | Ẩn cả cache trang1 trong lúc denial, retry toàn danh sách được; trang2 trở lại sau GET hợp lệ |
| GET200 thực sự rỗng / unread0 | Vẫn hiện trạng thái rỗng và đã đọc hết; không biến mọi zero thành lỗi |

[Production fixture](../../apps/user-web/tests/notification-read-states.mjs),
`pnpm --filter @used-books/user-web test:notification-read-states:browser`.
Baseline12/after14 profile390/1440, thêm denial trang sau ở after. Giữ request GET
để xem trạng thái pending, rồi trả503/403/404 và phục hồi200; không gọi mark-read
hay ghi DB. Harness đợi trang cũ unmount trước Back, đợi layout motion kết thúc
trước capture thay vì tắt motion. Không suy ảnh giữa animation là lỗi layout.

PASS build/typecheck,399 unit/53 file, scoped lint và detector0 finding.
46 CSS production khớp byte; các khai báo motion/AnimatePresence/layout/duration
giữ nguyên. Đã xem capture loading/error/giữ cache và denial390/1440. Evidence
local `.tmp/member-web-notification-read-states/` before/after/build/CSS/capture.
Predicate có401 nhưng browser gói này kiểm403/404, không claim auth-refresh401.
Backend auth/notification delivery/native/người thật NOT RUN; READINESS không đổi.
Preview bell/overview đã có error branch riêng; gói này sửa inbox page, không
claim mọi consumer notification hay toàn bộ permission đã được nghiệm thu.

Tiếp theo kiểm fallback số0 ở ký quỹ trên thẻ Ví và số đếm Trao đổi ở Tổng quan;
source có nhánh error chưa đồng nhất, cần fixture trước sửa. Không đổi ledger,
provider hoặc gate thanh toán/giao nhận.

## Đăng mới → nhận ACK → quay về kệ còn cache mới

Nhánh `codex/member-web-publish-owner-cache`, base `665c90fa`; commit cùng điểm
lưu có subject `fix(user-web): refresh owner shelf after publishing acknowledgement`.
Giữ ADR0009/0042/0048, các stage và payload hiện có. Source
[SellBookPage](../../apps/user-web/src/pages/SellBookPage.tsx) trước chỉ đổi sang
màn thành công; cache `my-listings` còn trong staleTime15s khiến kệ tiếp tục trống.
Sau ACK, invalidate prefix kệ theo đúng owner; owner hiện tại phải khớp snapshot
gửi trước khi báo thành công. Không invalidate/publicize bài PendingReview hoặc
tự cộng số bài vào cache. Không đổi backend, upload/AI, key/body/version hay form.

| Member → entry / ca | Trước | Sau |
| --- | --- | --- |
| Kệ trống → Đăng sách → manual/ảnh/tình trạng/Đổi sách/Kiểm tra → gửi → Header về kệ | Receipt thành công nhưng cache mới vẫn trống | Đọc kệ lại khi quay về, hiện đúng bài PendingReview/Chưa công khai |
| Submit đã commit, mất ACK → Thử gửi lại | Stage protocol đã giữ đúng key; kệ vẫn trống sau ACK retry | Giữ protocol; chỉ ACK retry mới làm stale kệ |
| Submit409 → chấp nhận cảnh báo rời form → về kệ | Không có thành công | Không invalidate kệ hoặc bịa bài mới |

[Production fixture](../../apps/user-web/tests/publish-owner-cache.mjs),
`pnpm --filter @used-books/user-web test:publish-owner-cache:browser`.
Baseline/after6 profile:390/1440 ×success/lost-ACK/refused. Fix Date sau login
để giữ cache trong cửa sổ15s, không pause timer/RAF/animation. Trước GET kệ1 lần
kể cả sau ACK; sau2 lần với ACK, vẫn1 khi từ chối. Catalog/draft/reserve/bytes/
finalize/save mỗi stage1 lần; lost-ACK submit2 request cùng key/body/version.
Entry manual và Exchange không có tạo địa chỉ; không claim đã kiểm địa chỉ/AI.
Mọi HTTP/auth/storage/media/Ready là QA giả, không dùng DB/provider thật.

PASS build/typecheck,399 unit/53 file, scoped lint exit0 (1 dependency warning
`hasValidOriginAddress` có từ base).46 CSS production khớp byte; xem capture kệ
390/1440, không sửa animation/asset. Không chạy lại detector cho diff chỉ hook và
cache/identity predicate, không thay JSX/class/style. Evidence local
`.tmp/member-web-publish-owner-cache/` before/after/build/CSS/capture.
Guard identity có source nhưng browser đổi actor giữa submit chưa chạy. Native,
server auth/race, AI và moderation người thật NOT RUN; READINESS giữ nguyên.

Tiếp theo kiểm trạng thái header/số đếm thông báo khi GET loading/error, tránh
fallback0 bị diễn đạt thành “đã đọc hết”. Không suy đã hoàn tất audit cả web.

## Sau Save đã ACK: đọc lại để tiếp tục sửa, không upload/lưu lại

Nhánh `codex/member-web-listing-save-result`, base `6569beb7`; commit cùng điểm
lưu có subject `fix(user-web): reconcile editor state after acknowledged saves`.
Giữ Save Draft khác Submit/Approved replacement theo ADR0009/0012. Không đổi
API/contract/provider hoặc tự duyệt bài.

[EditListingPage](../../apps/user-web/src/pages/EditListingPage.tsx) trước báo
đã lưu nhưng giữ baseline và ảnh mới trong form. GET thành công không reseed vì
form đã tồn tại: rời trang vẫn cảnh báo chưa lưu; lần lưu tiếp theo upload ảnh đó
lần nữa. Read sau ACK cũng mở form quá sớm, dễ ghi đè chỉnh sửa mới nếu tự reseed.

| Ca | Sau sửa / bằng chứng |
| --- | --- |
| Save có receipt đúng bài → GET thành công | Đọc lại version≥receipt rồi đặt form/baseline/media IDs đã lưu; rời trang không cảnh báo giả |
| Save đã ACK → GET503 | Region riêng nói bản nháp đã được lưu; chỉ retry GET, không Save/Submit/upload. Giữ nội dung và khóa chỉnh sửa tới khi đọc lại được |
| GET chậm hoặc trả version cũ hơn receipt | Form tiếp tục khóa; kết quả cũ không được dùng làm baseline, có thể retry đọc |
| Ảnh mới đã lưu → đọc lỗi/phục hồi → sửa tiếp/lưu | Dùng media IDs đã lưu; fixture số reservation từ2 còn1, không upload lại cùng file |
| Sau Save → sửa tiếp → rời trang/chọn ở lại → hoàn tác phần sửa thêm | Ẩn thông báo thành công cũ khi sửa; dirty guard vẫn hoạt động, hoàn tác về baseline mới thì không cảnh báo. Giữ lựa chọn cam kết local hiện có |
| Receipt có entityId của bài khác | [createDraftSave](../../apps/user-web/src/services/listing-revision.ts) validate ngay trong remembered stage; không cache receipt sai; retry đúng key/body/version.1 unit mới, không là bằng chứng backend trả receipt sai |

[Production fixture](../../apps/user-web/tests/listing-save-result.mjs),
`pnpm --filter @used-books/user-web test:listing-save-result:browser`.
Baseline6 profile (saved/photo-read-error/slow-read ×390/1440) tái hiện warning giả,
reservation lặp và form mở trước read. After8 thêm stale-read ×390/1440 PASS.
Harness đợi ConfirmDialog đóng hoàn toàn trước nhập lại; không sửa dirty guard
để hợp thức hóa ca nhập trong lúc modal còn đóng. Mọi auth/HTTP/upload ticket,
bytes/finalize/Ready/media read đều fixture, không có storage/API/worker thật.

PASS build/typecheck,399 unit/53 file, scoped lint exit0 (1 seed-form warning cũ).
Hồi quy draft14 và photo lifetime4 profile PASS sau phần thay đổi liên quan.
Detector3 advisory màu cũ;46 CSS khớp byte với base, không sửa motion/asset.
Đã xem recovery390/1440 và xác nhận khoảng cách CTA bằng class chung hiện có.
Evidence local `.tmp/member-web-listing-save-result/` before/after/build/CSS/capture.

Actor/listing/alive được kiểm sau read trước khi reseed; không claim đã chạy
browser đổi tài khoản giữa GET trong gói này. Runner command chưa ACK vẫn trong
component và có cảnh báo rời; memory không bền qua reload. Không kiểm storage
thật/native/human, không đóng READINESS hoặc chữa nguyên nhân server thực tế.
Tiếp theo rà entry đăng mới và địa chỉ trong form; không đổi AI/provider/backend.

## Ảnh tạm trong editor: chặn preview thừa và thu hồi khi rời trang

Nhánh `codex/member-web-editor-photo-lifetime`, base `060a5eb1`; commit cùng điểm
lưu có subject `fix(user-web): release editor photo previews after use`.
[EditListingPage](../../apps/user-web/src/pages/EditListingPage.tsx) trước có
cleanup effect với dependency rỗng nhưng đọc `photos` của render đầu tiên (mảng
rỗng). Chọn nhiều ảnh còn tạo URL cho cả ảnh bị slice khỏi giới hạn8 ảnh.

[Production browser fixture](../../apps/user-web/tests/editor-photo-lifetime.mjs),
`pnpm --filter @used-books/user-web test:editor-photo-lifetime:browser`, instrument
create/revoke để đếm URL còn giữ; không ghi URL, file user hay gọi upload thật.
Baseline/after4 profile:390/1440 ×chọn3/10 ảnh, có1 ảnh cũ. Đổi ảnh bìa, xóa một
ảnh mới rồi chấp nhận rời form. Ảnh mới fixture PNG tạo từ Canvas và kiểm decode.

| Ca | Trước | Sau |
| --- | --- | --- |
| Chọn3, đổi bìa, xóa1, rời editor |2 URL vẫn được giữ |0 URL còn giữ |
| Chọn10, còn7 chỗ → hiển thị7 ảnh mới | Tạo10 URL; sau xóa1/rời vẫn giữ9 | Chỉ tạo7 URL; sau rời0 |
| Đổi bìa/xóa ảnh | Ảnh còn dùng phải tiếp tục hiển thị | PASS: reorder không revoke ảnh giữ lại, ảnh còn lại decode được |

Registry riêng cho preview do editor tạo, dọn URL không còn trong photo state sau
commit; unmount dọn mọi URL còn sở hữu. Giới hạn slot trước create, giữ validation
JPEG/PNG/WebP≤10MB và thứ tự chọn. Không chạm signed URL ảnh cũ, upload pipeline,
API/contract hoặc animation. Ref theo listing hiện tại cập nhật sau commit thay
vì ghi trong render, vẫn bảo vệ ACK archive sau khi chuyển listing.

PASS build/typecheck,398 unit/53 file, scoped lint exit0 (còn1 warning seed-form
set-state-in-effect có từ base), draft browser14 profile. Detector vẫn3 advisory
màu cũ.46 CSS production khớp byte; đã xem capture preview390/1440 với hiệu ứng
trang còn hoạt động. Evidence `.tmp/member-web-editor-photo-lifetime/`.
Đây là đếm resource handle, không phải số đo heap/RAM/CPU trên máy người dùng.
Chưa thử reset photo form qua lỗi command, upload/storage thật hoặc native.

Tiếp theo kiểm trạng thái editor sau Save đã ACK: source hiện chỉ refetch và
thông báo lưu, không cập nhật baseline form/loại ảnh mới thành ảnh đã lưu. Cần
tái hiện bằng fixture stage trước khi sửa, tránh ghi đè nháp mới trong lúc đọc
phục hồi. Runner Save/Submit qua remount vẫn là giới hạn riêng, không tự mở rộng
nghiệp vụ lưu nháp Approved. READINESS, checkout demo và gate thật giữ nguyên.

## Ẩn/gỡ bài đăng: phục hồi qua remount và đọc404 sau archive

Nhánh `codex/member-web-listing-action-recovery`, base `8036649e`; commit cùng
điểm lưu có subject `fix(user-web): recover listing lifecycle actions across navigation`.
Đối chiếu [ADR0012](../adr/0012-listing-lifecycle.md) và
[controller/service](../../apps/api/src/modules/listings/listing-lifecycle.service.ts):
archive replay kiểm quyền hiện tại nhưng cho đọc target đã deleted trong receipt
authorization; GET nội dung đã gỡ trả404. Không đổi API/contract/quyền/nghiệp vụ.

[listing-actions](../../apps/user-web/src/lib/listing-actions.ts) giữ một intent
memory-only cho mỗi bài, dùng session client hiện có. Retry giữ nguyên path,
method, key, body và expectedVersion; concurrent calls dùng chung flight.
Không tạo token store hay ghi intent xuống storage. Logout/đổi owner xóa pending;
auth/generation được kiểm trước dispatch và sau ACK/read, phản hồi owner cũ
không xóa intent owner mới. Receipt sai entityId giữ pending, không báo thành công.

| Entry / ca | Trước | Sau / bước tiếp |
| --- | --- | --- |
| Kệ sách hoặc editor → ẩn/gỡ → mất ACK → chuyển trang/quay lại | Service tạo key mỗi lần; lỗi row/editor không có retry xuyên remount | Recovery chung giữ đúng intent; ref guard chặn click lặp; khóa thao tác cạnh tranh tới ACK/đối chiếu |
| Archive đã commit → GET404, row biến mất | Không còn nút trên row; editor là trang lỗi đọc | Recovery ở ngoài danh sách và trong nhánh lỗi editor; replay receipt được mà không cần GET deleted content; editor về kệ sau ACK |
| Lệnh network/schema/401/403/408/429/5xx | Chưa có lifecycle intent dùng chung | Giữ nguyên intent; server vẫn kiểm quyền hiện tại khi retry |
| Refusal400/404/409/422 | Chưa có đối chiếu lifecycle dùng chung | Freeze intent theo ADR0012; không replay lệnh bị từ chối, không tự rebase. Nút đối chiếu chỉ GET; đọc lỗi giữ pending, đọc thành công hoặc404 mới đóng intent bị từ chối để người dùng quyết định tiếp |
| Rời trang khi unresolved | Không có cảnh báo riêng ở kệ | Kệ/editor cảnh báo, chọn ở lại giữ yêu cầu; chấp nhận rời vẫn giữ qua navigation trong phiên. Before-unload cảnh báo tại hai trang này; UI nói rõ reload/đóng trang làm mất memory intent |

[Production fixture](../../apps/user-web/tests/listing-action-recovery.mjs),
`pnpm --filter @used-books/user-web test:listing-action-recovery:browser`:
baseline8 profile (kệ/editor ×ẩn/gỡ ×390/1440) không có recovery sau remount.
After12 thêm409 ×2 entry ×2 viewport: lost-ACK replay đúng request sau remount,
archive404 vẫn phục hồi, đọc lại503 không nhả refusal, thành công mới mở khóa;
cảnh báo ở lại/rời trang, focus sát mép và không overflow. HTTP/media/auth đều QA
giả lập, không gọi API/DB/provider thật. Key/body so sánh boolean trong memory.
Evidence local `.tmp/member-web-listing-action-recovery/` before/after/build,
CSS và capture; đã xem region recovery390/1440.

PASS production build/typecheck,398 unit/53 file và scoped lint.18 unit lifecycle
gồm concurrent/replay, refusal/read fail, receipt sai, actor đổi trước dispatch,
late ACK/read và logout. Hồi quy draft browser14 profile cùng source PASS.
Detector3 advisory màu inline đã có ở editor/base, không có finding mới ở
Recovery/Row/MyBooks.46 CSS production khớp byte với base; không sửa motion,
asset, duration, reduced-motion hay hiệu ứng modal/điều hướng hiện có.

Giới hạn: memory intent không bền qua reload/tab mới; đây không phải kiểm backend
idempotency/auth/race. Save/Submit runner vẫn component-local, chỉ có cảnh báo
rời trang (gói trước); chưa chứng minh giữ intent qua remount. Không kiểm storage,
API/Mongo/provider/native/người thật; không kết luận nguyên nhân server thực tế
hoặc đóng READINESS. Checkout demo giữ nguyên, không copy/sync/push/PR.

## Lưu nháp/sửa bài: retry đúng thao tác và giữ nháp khi reload lỗi

Nhánh `codex/member-web-listing-draft-recovery`, base `460a0a5e`; commit cùng
điểm lưu có subject `fix(user-web): retain draft save attempts after lost responses`.
[ADR0009](../adr/0009-listing-submission-moderation.md) và
[ADR0012](../adr/0012-listing-lifecycle.md) giữ nguyên. Không sửa API, contract,
quy trình upload hoặc tự chuyển sang Approved. Source chính
[EditListingPage](../../apps/user-web/src/pages/EditListingPage.tsx).

| Member → entry / ca | Trước | Sau / phục hồi |
| --- | --- | --- |
| Kệ sách → sửa Draft → Lưu bản nháp, bấm lặp |2 PUT với key khác nhau | Ref guard chung chặn lần hai trước await,1 PUT |
| Lưu nháp → server đã ghi nhưng ACK mất | Thử lưu lại tạo runner/key mới, version cũ bị409 | Giữ runner, action và các stage/key/body/version; khóa nội dung/gửi duyệt; retry ngoài form chỉ chạy lại Save, không chuyển thành Submit |
| Lưu/gửi bị408/429 hoặc lỗi bất định | Có nhánh nhả intent hoặc không ghim save | Giữ đúng intent. Refusal xác định409 vẫn cho sửa nháp, không tự đổi version |
| Đã mở error → Tải lại bài nhưng GET503 → thử lại GET | setForm(null) dù đọc lỗi, làm mất nháp khi phục hồi | Chỉ reseed form sau GET thành công; đọc lỗi giữ draft đang sửa |
| Draft → gửi duyệt → save ACK, submit ACK mất | Giao thức runner hiện có | Hồi quy PASS: không gọi lại stage save; submit retry đúng key/body và acknowledged version5, đi PendingReview sau ACK |
| Rời trang khi còn pending | Guard chỉ xét dirty | Cảnh báo cả khi pending; chọn Ở lại tiếp tục giữ thao tác đang chờ |

[Production fixture](../../apps/user-web/tests/listing-draft-recovery.mjs),
`pnpm --filter @used-books/user-web test:listing-draft-recovery:browser`.
Baseline8 profile duplicate/lost-ACK/conflict/reload-error ×390/1440 tái hiện lỗi.
After14 profile thêm submit-stage,408,429 ×390/1440. Metadata/ảnh/HTTP đều là QA
giả lập; không có DB/storage/Admin moderation thật. Key/body chỉ so sánh trong
memory. Evidence local `.tmp/member-web-listing-draft-recovery/` before/after,
CSS và capture saved draft390/1440 đã xem.

PASS build/typecheck,380 unit/52 file,scoped lint. Detector có3 advisory màu
inline đã có trong base (`rgba(232,223,208,0.25)`, `#b8860b`, `#9b1c1c`), không
sửa palette để chạy theo detector.46 CSS khớp byte; không đổi animation/asset.
Harness sửa selector rời trang sang alertdialog đúng role của ConfirmDialog.

Giới hạn: runner còn trong component; chọn rời trang sau cảnh báo chưa chứng
minh giữ intent qua remount. Visibility/archive vẫn cần rà key lifecycle riêng.
Gói này không kiểm upload mới với storage thật, native/permission backend hoặc
human acceptance; không đóng READINESS. Các vấn đề còn lại ghi rõ để cuốn chiếu
tiếp, không suy toàn bộ chỉnh sửa bài đã đạt readiness.

## Giữ intent lệnh đấu giá sau lỗi bất định

Nhánh `codex/member-web-auction-command-outcomes`, base `80cb8edf`; commit cùng
điểm lưu có subject `fix(user-web): retain auction intents after uncertain refusals`.
Rà AGENTS/protocol và skill API/Mongo cho invariant auth trước replay, key/body/
version; không sửa API, OpenAPI, session client, tiền, quyền hay gate giao nhận.

[useAuctionClock](../../apps/user-web/src/hooks/useAuctionClock.ts) trước dùng
cùng predicate cho lệnh và read. HTTP408/429 khiến lệnh bỏ intent dù có thể là
lần thử lại sau một ACK đã mất. Predicate command mới giữ401/403/408/429 cùng
network/schema/5xx. Refusal400/404/409/410/422 vẫn là kết quả xác định. Predicate
read giữ nguyên:401/403 không dùng nhánh giữ cache để hiện nội dung bị từ chối.

Đã thay đúng nhánh catch lệnh ở CreateAuction, AuctionDetail (bid/auto/buy/pay),
AuctionPointOrder, MyAuctions (rút/bằng chứng), ScheduleAuctionDialog. Các call
read ở AuctionDetail/participation, AuctionList và MyAuctions vẫn dùng predicate
cũ. Không đổi path, body, key, receipt, thời gian, component/animation hay class.
Giữ intent không tự cấp quyền: server vẫn quyết định quyền hiện tại khi retry.

| Member → entry / ca | Bằng chứng |
| --- | --- |
| Tạo intake →408/429 rồi thử lại | Production probe390/1440: trước dùng key mới; sau giữ cùng key/body và khóa lựa chọn khi chưa rõ kết quả |
| Tạo intake →409 rồi quyết định mới | Trước/sau đều nhả intent xác định; lần gửi mới dùng key mới |
| Lệnh auth/timeout/rate limit và read từ chối |19 unit bổ sung: command giữ401/403/408/429; read vẫn false cho401/403/404/408/429. Đây là kiểm predicate, không là nghiệm thu auth server |
| PointOrder → trả tại điểm/giao tận nơi → pay |12 production fixture profile PASS:390/1440 ×2 method ×success/rejected/lost-ACK; retry đúng request và wallet refresh sau ACK |
| Danh sách đấu giá → lọc/Back/error/ảnh lỗi | Auction-stage frontend fixture PASS390/1440, giữ compact route và điều hướng. runtime.json của harness có date lịch sử cố định; log thực chạy của gói04/11 là bằng chứng lần chạy mới |

Probe dùng [auction-intake-recovery](../../apps/user-web/tests/auction-intake-recovery.mjs)
với INTAKE_OUTCOME_PROBE=1; baseline thêm INTAKE_OUTCOME_BASELINE=1 và build trước.
Kết quả6 before/6 after ở `.tmp/member-web-auction-intake-recovery/outcome-*.json`.
Mọi request là HTTP giả lập; không gọi tiền/provider/DB thật. Key/body so sánh
trong memory. PASS build/typecheck,380 unit/52 file,scoped lint;46 CSS khớp byte.
Không chạy lại detector cho diff chỉ thay import/predicate, không JSX/style.

Native, backend auth/race/transactions và human acceptance NOT RUN. READINESS
và checkout demo giữ nguyên. Các lệnh chưa persist intent qua remount là phạm
vi cần rà tiếp; gói này chỉ sửa quyết định giữ/nhả intent trong workflow hiện có.
Tiếp theo lưu nháp/sửa bài đăng; không suy đã hoàn tất audit cả web.

## Tạo phiếu đấu giá: phân biệt ACK và lần đọc phiếu

Nhánh `codex/member-web-auction-intake-recovery`, base `354f0876`; commit cùng điểm
lưu có subject `fix(user-web): recover confirmed auction intakes without resubmitting`.
[ADR0049](../adr/0049-auction-intake-from-shelf.md) và contract giữ nguyên: giữ
chỗ tạo AuctionIntake, chưa mở phiên, chưa chứng minh intake/inspection/settlement.
Chỉ sửa [CreateAuctionPage](../../apps/user-web/src/pages/CreateAuctionPage.tsx).

| Member → entry | Ca trước sửa | Kết quả sau sửa / bước tiếp |
| --- | --- | --- |
| `/auctions/new?listing=…` → xác nhận Giữ chỗ |2 click trong cùng lượt gửi2 POST cùng key/body | Ref guard gửi1; Hủy dialog không gửi lệnh; giữ toàn bộ lựa chọn/giá/body |
| Lệnh đã có receipt nhưng GET phiếu503, kể cả list refresh cũng lỗi | Màn hình vẫn cho mở xác nhận tạo yêu cầu mới | Giữ entityId đã ACK, khóa nhánh tạo; hiện trạng thái đã giữ chỗ, retry chỉ GET đúng ID và deep link `view=selling&intakeId=…` |
| GET lỗi nhiều lần rồi phục hồi | Thiếu nút đọc lại đúng phiếu | Retry GET không gửi POST; khi đọc được thì hiện phiếu/hạn/điểm từ server. Focus và scroll đưa tới tiêu đề phục hồi sau form dài |
| POST503 hoặc response sai entityType | Kết quả lệnh chưa xác định | Giữ body/key cũ, khóa chọn sách; thử lại đúng request. Chỉ nhận receipt AuctionIntake; đọc phiếu kiểm đúng id |

[Production fixture](../../apps/user-web/tests/auction-intake-recovery.mjs):
`pnpm --filter @used-books/user-web test:auction-intake-recovery:browser`.
Baseline4 profile (duplicate/ACK-read ×390/1440) tái hiện lỗi. After7 profile:
hai nhóm đó,503 exact replay ×390/1440 và wrong-receipt390. Ca unknown baseline
không tính PASS vì bấm lặp có thể tự tạo request replay trước nút thử lại.
Mọi HTTP/WS được intercept/chặn, không API/DB/provider thật. Chỉ so sánh request
trong memory, không in body/key. Local evidence ở `.tmp/member-web-auction-intake-recovery/`.

PASS build/typecheck,361 unit/51 file,scoped lint và detector0 finding.46 CSS
production khớp byte, không đổi animation/asset. Đã xem capture mobile/desktop
phục hồi, sau đó thêm focus/scroll để thông báo xuất hiện đúng vùng đọc.
Các gate và CHECKOUT demo giữ nguyên; không push/PR/merge/deploy.
Chưa kiểm intake thật/native/human hoặc xác minh server demo bị rớt.
Tiếp theo rà phân loại lỗi command đấu giá và lưu nháp/sửa bài, giữ contract.

## Hồ sơ giữ bản nháp khi phục hồi và hiển thị đúng yêu cầu email

Nhánh `codex/member-web-profile-recovery`, base `3634a8ab`; commit cùng điểm lưu
có subject `fix(user-web): preserve profile drafts through read recovery`.
[ADR0058](../adr/0058-member-profile-and-email-change.md), FR-A05 và contract
`/me/profile`/email-changes giữ nguyên. Chỉ sửa
[MemberProfileEditor](../../apps/user-web/src/pages/profile/MemberProfileEditor.tsx);
không đổi API, shared session-client, quyền, password/OTP storage hoặc mail queue.
Tiếp tục dùng quy trình journey/UI/verify đã đọc cho các gói phía dưới.

| Member → entry | Trước / vấn đề tái hiện | Sau / kết quả và bước tiếp |
| --- | --- | --- |
| `/profile` → Lưu thay đổi | Hai click cùng lượt gửi2 POST cùng intent | Ref guard đặt trước await, gửi1. Mất ACK giữ request qua điều hướng/Back và replay đúng path/key/body/version |
| Sửa tên → refetch503 → Tải lại hồ sơ | Đọc thành công thay nháp bằng bản server | Giữ nháp và expectedVersion ban đầu, kể cả lần retry đầu cũng lỗi. Server đổi version thì Save vẫn nhận409; chỉ Tải bản mới mới thay nháp một cách chủ động |
| Lưu có ACK → GET503 → Tải lại hồ sơ | Phải đọc lại bản canonical trước lần sửa tiếp | Giữ khóa trong lúc cần đọc; recovery dùng dữ liệu server sau ACK, kể cả tên được normalize khác chuỗi người dùng nhập. Không giữ nháp cũ đè kết quả đã ghi nhận |
| Đổi email → mất ACK → sang Đánh giá rồi Back | Request còn ghim email nhưng input email trống | Hiện email từ pendingEmailChangeTarget sẵn có; input khóa. Password trống sau remount, phải nhập lại mới gửi đúng yêu cầu cũ |
| Confirm email → mất ACK → Back | Intent đã giữ code/key trong memory | Replay đúng yêu cầu cũ dù profile mới không còn pending change; input OTP không persist qua remount. Chỉ sau ACK/read mới thấy email mới |

### Bằng chứng

[Production fixture](../../apps/user-web/tests/profile-recovery.mjs):
`pnpm --filter @used-books/user-web test:profile-recovery:browser`,6 profile
(save/draft/email ×390/1440), Chromium reduced-motion, toàn bộ API/WS được
intercept/chặn. Baseline bật PROFILE_RECOVERY_BASELINE=1 và PROFILE_RECOVERY_BUILD
trỏ build trước sửa. Local before/after/CSS/capture tại
`.tmp/member-web-profile-recovery/`. Body/key/password chỉ so sánh trong memory,
không in/ghi ra evidence. Fixture email/OTP chỉ là dữ liệu QA tổng hợp; không gửi mail.

PASS build/typecheck,361 unit/51 file,scoped oxlint,detector0 finding.
Profile-reputation regression PASS riêng: public scores/summary cache,503 giữ
dữ liệu,404 concealment/retry, unsaved navigation guard, late response tài khoản
cũ và1440/1000/390/320/130% chữ.46 CSS production khớp byte với baseline; không
sửa CSS/animation/asset hoặc giảm motion. Đã xem capture mobile/desktop của form.
Đổi import shared helper làm bundler chia lại JS; không coi đây là số đo hiệu năng.

Harness đã sửa để chờ scene đăng nhập xong, chờ trang đích thật unmount editor
trước Back và chỉ mở mobile menu nếu còn đóng. Đợi staleTime trước visibility
refetch, kiểm thông báo409 qua mapping accountErrorMessage hiện có. Các lần
harness chưa đúng không tính PASS; không sửa source để né assertion.

Avatar upload/storage pipeline, gửi mail thật, session revoke thật/API/Mongo,
native và nghiệm thu người thật NOT RUN trong gói này. Không kết luận đã chữa
nguyên nhân server demo bị rớt. READINESS giữ nguyên; checkout demo bảo toàn.
Gói trước `3634a8ab` đã lưu riêng giỏ/hỗ trợ; `8e5ef8d1` lưu riêng đánh giá.
Bước tiếp có thể kiểm một nhóm chức năng khác bằng fixture hoặc đối chiếu
browser/log khi tái hiện được trên demo; không tự mở rộng nghiệp vụ/gate.

## Giỏ sách chống bấm lặp; kiểm phục hồi hỗ trợ

Nhánh `codex/member-web-resource-recovery`, base `8e5ef8d1`; commit cùng điểm lưu
có subject `fix(user-web): guard repeated cart actions and verify resource recovery`.
[ADR0060](../adr/0060-member-cart.md), [ADR0062](../adr/0062-web-support-cases.md)
và contract hiện có giữ nguyên; không thay API, session-client hoặc nghiệp vụ.

[CartPage](../../apps/user-web/src/pages/CartPage.tsx) trước dùng busy state làm
guard. Hai click trong cùng lượt JavaScript có thể vượt guard trước React commit,
gửi2 POST cùng intent. Baseline Chromium390/1440 xác nhận cả2 dùng cùng key/body:
đây là request trùng, không là bằng chứng ghi nghiệp vụ hai lần. Ref guard nay
được đặt ngay trước bước chuẩn bị request và nhả trong finally; sau sửa gửi1.
Không thay disabled/loading, expectedVersion, receipt, key/body hoặc animation.

| Vai trò → entry | Tình huống | Kết quả thực kiểm |
| --- | --- | --- |
| Member → `/cart` → Bỏ khỏi giỏ |503 ban đầu; click lặp; mất ACK; refresh đọc version mới; Tổng quan rồi Back | Lỗi đọc không hiện giỏ trống; chặn click thứ hai; pending giữ qua remount; replay đúng path/key/body/version gốc |
| Member → xóa dòng cuối trong giỏ | Có ACK nhưng GET sau lệnh503 | Giữ bản đã tải và thông báo cần cập nhật, khóa thao tác tiếp; chỉ hiện trống sau GET thành công |
| Member → `/support/new` |422; mất ACK; về danh sách và mở form mới | Giữ title/description;422 cho sửa rồi tạo intent mới; pending khóa form, khôi phục nội dung ghim và replay đúng request, mở đúng hồ sơ |
| Member → hồ sơ → Gửi bổ sung |409; GET phiên bản mới; mất ACK; Admin đóng hồ sơ trước khi quay lại | Giữ nội dung sau409, lệnh mới dùng version2; pending replay version2 sau remount dù canReply=false; receipt cũ Open/v3 không ghi đè read Closed/v4; tin hiện một lần |
| Member → quay lại hồ sơ đã tải | Refetch khi visibility thay đổi trả403 rồi200 |403 ẩn title/lịch sử cache;200 hiện lại; không lộ nội dung cũ khi bị từ chối đọc |

### Bằng chứng

[Production browser fixture](../../apps/user-web/tests/member-resource-recovery.mjs):
`pnpm --filter @used-books/user-web test:resource-recovery:browser` PASS4 profile,
cart/support ×390/1440, Chromium reduced-motion. Baseline click lặp bật
RESOURCE_RECOVERY_BASELINE=1 với RESOURCE_RECOVERY_BUILD trỏ build trước sửa.
Local evidence `.tmp/member-web-resource-recovery/before.json`, `result.json`,
`css.json` và capture mobile/desktop đã xem. Mọi origin API bị intercept, request
ngoài fixture bị chặn; không gọi API/provider thật. Payload/key chỉ so sánh trong
bộ nhớ, assertion dùng boolean để không in nội dung khi thất bại.

Harness ban đầu cấp cart ID khác owner; đối chiếu CartService GET xác nhận id là
actor ID và sửa fixture cho đúng. Điều hướng mobile mở menu thật và đợi URL
trước Back. Ca403 dùng visibility refetch vì query có thể bị từ chối/ẩn nút ngay
trước click refresh; không ép giữ nút hoặc sửa source để hợp thức hóa fixture.
Sau các sửa harness, toàn bộ ca cuối PASS. Support source không đổi.

PASS build/typecheck,361 unit/51 file,scoped lint và Cart detector0 finding.
Review-recovery cũng PASS lại4 profile trên build cuối, thêm assert link báo cáo
đúng từng ID.46 CSS production khớp byte với baseline; không sửa CSS/asset/motion.
Build vẫn cảnh báo login-flight lớn. Không thêm gate PASS vào READINESS.
Đã lưu kết quả cho3 nhóm: đánh giá, giỏ sách, hỗ trợ. Kiểm thực tế server restart,
Mongo/worker/provider và thiết bị thật vẫn NOT RUN; không suy đã chữa nguyên nhân
“rớt server” mà owner từng gặp. Bước tiếp phù hợp là chọn một nhóm chức năng
khác để kiểm cô lập, hoặc đối chiếu log/browser khi tái hiện được trên bản demo.

## Form đánh giá giữ bản nháp và theo trạng thái mới

Nhánh `codex/member-web-review-recovery`, base `11f5810a`; commit cùng điểm lưu
có subject `fix(user-web): preserve review drafts when eligibility changes`.
[SRS FR-R01–R05](../SRS_V1_1.md), [ADR0052](../adr/0052-transaction-reviews-and-reputation.md)
và [contract](../../packages/api-contract/openapi.yaml) giữ quyền và công bố tại
server. [Review service](../../apps/api/src/modules/reviews/reviews.service.ts)
trả canReview/canEdit/canDelete/canReply theo trạng thái hiện tại; partnerReview
trả null khi không còn công khai. Không sửa API/contract/session-client.

| Vai trò → entry | Điều kiện / lệnh | Kết quả / phục hồi / bước tiếp |
| --- | --- | --- |
| Member → `/reviews?type=…&transaction=…` | Tải quyền và review của đúng giao dịch Exchange/DirectOrder/PointOrder | Lỗi đọc ban đầu có Tải lại; lỗi503 sau khi đã đọc giữ nội dung và bản nháp |
| Tác giả → tạo/sửa/xóa | Can flag mới nhất và đối tượng còn tồn tại; expectedVersion giữ nguyên tới khi người dùng chọn phiên bản hiện tại | Form ổn định khi review thay đổi; mất quyền thì khóa gửi, giữ bản nháp và cho đóng/tải lại |
| Người nhận đánh giá → phản hồi | canReply và partnerReview còn tồn tại | Peer bị ẩn không dereference null hoặc gửi sai target; khi được phép lại vẫn còn bản nháp |
| Member → thử lại lệnh chưa rõ kết quả | Pending intent đã ghim path/body/key; không dùng quyền cho lệnh mới để chặn replay này | Poll thay đổi quyền rồi thử lại vẫn cùng request; ACK mới đóng editor và đọc lại kết quả |

[TransactionReviewPanel](../../apps/user-web/src/features/reviews/TransactionReviewPanel.tsx)
giữ editor theo mode trong cùng panel giao dịch, thay vì đổi key theo myReview.id.
Form không còn bị dựng lại/xóa nháp khi review được tạo ở nơi khác. Nút gửi và
submit handler cùng kiểm can flag/đối tượng/error; bỏ non-null assertion khi
chọn target. Trạng thái chặn có thông báo, vẫn cho sửa/copy hoặc đóng nháp.
Đồng thời bỏ một SupportLink lặp: mỗi review công khai còn một Báo cáo nội dung.

### Bằng chứng

Production [fixture](../../apps/user-web/tests/review-recovery.mjs), mọi HTTP/WS
được intercept/chặn, không route.fetch tới API thật. Chromium reduced-motion:
Exchange390/1440,DirectOrder390,PointOrder390. Mỗi profile tái hiện trước và kiểm
sau sửa:

| Ca | Trước | Sau |
| --- | --- | --- |
| Peer bị ẩn lúc đang viết phản hồi | Bấm gửi gây lỗi JavaScript khi đọc id từ null | Nút gửi bị khóa, submit trực tiếp cũng không gửi; nháp giữ và gửi được khi quyền trở lại |
| Review được tạo nơi khác lúc mở form tạo | Key đổi làm mất nháp | Nháp giữ, chặn tạo lần nữa theo canReview=false |
| Mất quyền sửa/xóa hoặc đọc lại503 | Form cũ vẫn cho gửi | Khóa lệnh mới và giữ nội dung |
| Link báo cáo trên hai review công khai |4 link |2 link, đúng review ID |

Các ca hồi quy PASS: đọc503/thử lại;409 giữ draft và chỉ đổi expectedVersion
sau nút người dùng; bấm lặp tạo một request; mất ACK giữ intent; poll60 giây
đổi quyền rồi replay đúng path/body/key; ACK hiển thị nội dung xác nhận. Key và
request body chỉ so sánh trong bộ nhớ, không in ra evidence. Baseline/after ở
`.tmp/member-web-review-recovery/before.json` và `after.json`. Harness đợi DOM
phản ánh quyền/dữ liệu mới sau GET để tránh assertion chạy trước React commit.

Node24.22.1/pnpm11.19.0. PASS build/typecheck,361 unit/51 file,scoped oxlint,
Impeccable detector0 finding. Đã xem capture editor390/1440;46 CSS production
khớp byte với build trước. Không sửa CSS/animation/asset hay chính sách motion.
Build vẫn có cảnh báo chunk login-flight lớn như checkpoint trước.

READINESS không đổi. API/Mongo/provider/native/CI remote/human review NOT RUN.
Checkout Documents giữ `5bd0b360`,40 tracked thay đổi và14 untracked file;
không copy/sync/push/PR/merge/deploy. Phục hồi giỏ sách và gửi/bổ sung hỗ trợ đã
được kiểm ở gói phía trên.
