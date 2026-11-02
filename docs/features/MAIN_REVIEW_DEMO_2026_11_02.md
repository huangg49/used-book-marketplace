# Demo đánh giá trên ứng dụng local chính — 02/11/2026

Owner yêu cầu dùng DB local chính thay bộ thử riêng. Phạm vi được duyệt là thêm
dữ liệu mẫu để thử review/uy tín với User1/User2 hiện có; không đổi đơn Preparing,
tiền ví, mật khẩu, quyền hoặc release policy của giao nhận/quyết toán.

## Cách thao tác

Dùng Member web [localhost:5174](http://localhost:5174/reviews?type=Exchange),
User1/User2 đã có. Chọn **Đánh giá của tôi → Đổi sách** từ menu bình thường.
Không dùng5197/5198 nữa. Nếu tab cũ còn danh sách trống trong cache, mở Tổng quan
rồi quay lại Đánh giá của tôi để trang đọc lại dữ liệu.

| Tình huống | Cách nhận ra | Việc thử |
| --- | --- | --- |
| Giao dịch mới | Đầu danh sách, mã17A422F1, hoàn tất02/11 | Xem và viết đánh giá → chọn điểm sách/đối tác → Lưu; thử sửa/xóa trong48h |
| Giao dịch cũ | MãA237E1F1, hoàn tất28/10 | Xem hai đánh giá đã công bố, gửi phản hồi; Admin duyệt phản hồi |

Hồ sơ có điểm mẫu để quan sát ngay: User1 điểm đối tác5/5, sách4/5; User2 điểm
đối tác2/5, sách3/5, mỗi loại từ1review. Điểm này do **dữ liệu mẫu** có comment
`[DỮ LIỆU DEMO]`, không phải kết luận người thật hoặc vi phạm đã xác minh.
Giao dịch mới chưa được agent gửi review; các lần gửi tiếp theo do owner tự thử
sẽ giữ chính sách168h gửi/48h sửa và chờ công bố bình thường.

Admin dùng [Đánh giá giao dịch](http://localhost:5173/transaction-reviews).
Tài khoản Admin độc lập hiện có thấy hai review mẫu và revision `DemoSeed`.
Điểm thấp không tự là căn cứ ẩn nội dung; có thể thử phản hồi và duyệt phản hồi
để trình bày cách xử lý ý kiến bất lợi hợp lệ.

## Dữ liệu đã thêm và giới hạn

- Hai Exchange Completed mẫu lịch sử,4bản sách tham chiếu lưu trữ
  (Hidden/deleted, Draft/Exchanged, có revision riêng và catalog có sẵn),
  2review đã công bố cho tình huống cũ và2revision ghi nguồn `DemoSeed`.
- Đây là lịch sử mẫu **không có dòng tiền**, agreement null theo dạng legacy
  hiện có. Không giả approval, callback giao hàng, nạp ví hay settlement journal;
  không dùng để nghiệm thu giao nhận, quyết toán hoặc đồng thuận snapshot.
  Các listing tham chiếu không xuất hiện trên kệ public hoặc chiếm slot đang bán.
- Giữ nguyên toàn bộ bản ghi đã có trong các collection được bảo vệ: users,
  listings/revisions, exchanges, direct_orders, reviews/revisions và các collection
  wallet/ledger/topup/VNPay. Đối chiếu hash bỏ riêng lockSeq vì đọc/API có khóa.
- Không chạy migration/reset/seed đè dữ liệu cũ; không sửa schema/index, API,
  giao diện, session policy, GHN hoặc READINESS. Đây là thao tác thêm mẫu được
  owner yêu cầu riêng, không cho phép test harness ghi/xóa DB chính về sau.
- Exact IDs, target binding, plan/hash, fingerprint trước và kết quả thực thi
  giữ private ignored trong `.tmp/main-review-data/`. Script có xác nhận target,
  insert nguyên tử và kiểm tra trùng; không được chạy lại để reset review owner.

## Kiểm chứng thực chạy

| Kiểm tra | Kết quả |
| --- | --- |
| Dữ liệu dự kiến trên QA riêng | PASS: dùng bản sao validator/index unique lấy trực tiếp từ DB runtime; transaction cùng checkListing4bản/checkExchange2giao dịch |
| Import local chính | PASS: một transaction, chỉ insert IDs mới; hash các bản ghi cũ được bảo vệ không đổi |
| API chính3000, User1/User2 | PASS: danh sách2Exchange, giao dịch mới canReview=true/myReview=null; cũ Published/canReply=true; hai profile có đúng điểm/số mẫu |
| Browser Member web5174 | PASS: đăng nhập hai tài khoản đang có; menu danh sách, form giao dịch mới, review cũ đã công bố và nút phản hồi được quan sát qua AX; không gửi review mới hộ owner |
| Admin chính | PASS API đọc: hai review Published, revision DemoSeed; không gửi quyết định moderation |
| Ví/ledger | PASS: available/held của User2 giữ850.000/150.000đ; fingerprint tiền không đổi; wallet:check balanced=true,4journals/4topups, nguồn98.000.000đ |
| Các cổng riêng | Đã dừng process3009/5197/5198 và Mongo QA57017; app chính3000/5173/5174 và Mongo27017 giữ chạy |
| Native, human acceptance, CI/push/merge | NOT RUN; không suy từ dữ liệu mẫu hoặc browser thành fulfillment/release PASS |

Không cần khởi động runner demo riêng cho bộ dữ liệu này. Dữ liệu nằm trong DB
local hiện có và giữ qua các lần bật app/Mongo bình thường; không qua tmpfs QA.
## Nút bỏ chờ48h — bổ sung02/11/2026

Trên app chính `localhost:5174`, mở **Đánh giá của tôi → Đổi sách → giao dịch mới
nhất**, sau khi User1/User2 đều gửi, bấm **Bỏ chờ48giờ (demo)** rồi **Mô phỏng và
công bố**. Hộp thoại nêu rõ hai bản sẽ công khai, cập nhật điểm uy tín và khóa sửa/
xóa. Hủy không đổi dữ liệu. Sau thành công, xem nhận xét đối tác hoặc bấm **Xem hồ
sơ uy tín đối tác**. Tab còn lại bấm **Tải lại** để xem kết quả cùng giao dịch.

Chỉ mốc thời gian mẫu được lùi; nội dung/điểm đã tự nhập được giữ và lưu revision
mô phỏng. Không tự gửi review, không trả tiền hay sửa đơn mua đang Preparing.
Không dùng lại nút để đặt lại mẫu. Quy tắc và config theo
[ADR0067](../adr/0067-local-review-demo-time-advance.md). Cấu hình local riêng đã
allowlist đúng một giao dịch mẫu mới; mặc định repo tắt.

Nhánh `codex/demo-review-time-advance`, base821dbdb8. Evidence local:

- PASS13API HTTP/Mongo tests: lifecycle cũ, config/prod/owner/role/session,
  stale pair, replay/key khác body, one-sided/hold/deleted/funded từ chối,
  cạnh tranh thực trên lock, một cặp revision, public totals/moderation, khóa sửa.
- PASS150session-client tests; contract generate/check/routes, API typecheck/
  build/lint và User web typecheck/build/lint (còn warning cũ ngoài phạm vi).
- PASS browser QA riêng:1440/390/320, xác nhận/hủy, HTTP thật mất ACK/retry cùng
  key/body, hai bên Published, điểm tính một lần, khóa sửa, link hồ sơ, mẫu không
  allowlist giữ48h. Storage local fake; không provider/native/human acceptance.
- App chính áp patch theo hunk, giữ layout Antigravity; contract regenerated
  theo bản0.71 local, không chép đè API0.73 hoặc chạy migration. API/worker restart;
  kiểm current route/contract/typecheck, UI nút hiện trên giao dịch đúng, ví
  reconciliation balanced và fingerprint dữ liệu cũ nguyên vẹn.
- Chưa tự bấm công bố trên mẫu chính; để owner thao tác. Không push/CI/merge hoặc
  đóng READINESS. Sau mô phỏng, số mẫu điểm public của mỗi bên từ1thành2; dữ liệu
  chuẩn bị lịch sử trước đó phía trên không đại diện cho trạng thái sau owner bấm.
