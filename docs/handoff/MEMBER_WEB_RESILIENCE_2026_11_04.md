# Gia cố khả năng phục hồi Member web — 04/11/2026

Owner chưa tiện kiểm hệ thống thật và giao tiếp tục rà các tính năng khác bằng
source/kiểm thử cô lập. Phạm vi Member React/Vite, giữ animation và nghiệp vụ;
không thao tác DB/provider/GHN, bật dịch vụ ứng dụng hoặc sửa checkout demo.
Đây là vòng gia cố hành vi lỗi, tách với [vòng hiệu năng đã chốt](MEMBER_WEB_PERFORMANCE_2026_11_03.md).
Không suy browser fixture thành API/Mongo/native/người thật nghiệm thu.

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
không copy/sync/push/PR/merge/deploy. Bước tiếp: kiểm riêng phục hồi giỏ sách và
gửi/bổ sung yêu cầu hỗ trợ với dữ liệu giả lập.
