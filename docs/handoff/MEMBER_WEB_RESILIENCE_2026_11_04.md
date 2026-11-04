# Gia cố khả năng phục hồi Member web — 04/11/2026

Owner chưa tiện kiểm hệ thống thật và giao tiếp tục rà các tính năng khác bằng
source/kiểm thử cô lập. Phạm vi Member React/Vite, giữ animation và nghiệp vụ;
không thao tác DB/provider/GHN, bật API/Mongo/worker hoặc sửa checkout demo.
Harness chỉ mở preview frontend tạm và tự đóng khi kết thúc.
Đây là vòng gia cố hành vi lỗi, tách với [vòng hiệu năng đã chốt](MEMBER_WEB_PERFORMANCE_2026_11_03.md).
Không suy browser fixture thành API/Mongo/native/người thật nghiệm thu.

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
