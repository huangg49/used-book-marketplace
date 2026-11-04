# Gia cố khả năng phục hồi Member web — 04/11/2026

Owner chưa tiện kiểm hệ thống thật và giao tiếp tục rà các tính năng khác bằng
source/kiểm thử cô lập. Phạm vi Member React/Vite, giữ animation và nghiệp vụ;
không thao tác DB/provider/GHN, bật API/Mongo/worker hoặc sửa checkout demo.
Harness chỉ mở preview frontend tạm và tự đóng khi kết thúc.
Đây là vòng gia cố hành vi lỗi, tách với [vòng hiệu năng đã chốt](MEMBER_WEB_PERFORMANCE_2026_11_03.md).
Không suy browser fixture thành API/Mongo/native/người thật nghiệm thu.

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
