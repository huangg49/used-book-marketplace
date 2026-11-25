# ADR 0057: Giữ tiền và sách khi chưa có quyết định Exchange đủ điều kiện

01/11/2026. Owner duyệt gói gia cố sau khảo sát toàn dự án. Đây là sửa an toàn
theo SRS FR-D05–D08, BR-08/34–36 và AC-27/33–37, không cấp quyền mở rộng
settlement hoặc đóng READINESS.

## Vấn đề

Lệnh phân xử cũ nhận `expectedVersion`, `RefundBoth`/`CompleteExchange` và lý do.
Nó có thể hoàn tiền/mở sách sau gửi, hoặc tất toán ngay trong hạn kháng nghị;
chưa có custody, allocations, effective decision, assignment và appeal protocol
đủ để thực hiện SRS. Role Staff/Admin không thay các điều kiện đó.

## Quyết định

- Contract0.64 giữ route/schema để client cũ không tự đổi intent. Mọi quyết
  định **mới** ở route này trả409 InvalidState, không ghi receipt thành công,
  audit, notification, message, thay trạng thái hoặc bút toán. Tiền/sách tiếp
  tục giữ trong ResolutionPending. Admin cũng không được bypass.
- Current session/role/ACTIVE và tính độc lập được kiểm trước receipt replay.
  Cả hai participant đều bị403 SelfReviewForbidden kể cả có STAFF/ADMIN hoặc
  receipt lịch sử. Hàng đợi loại giao dịch của chính caller.
- Receipt lịch sử hợp lệ vẫn replay bằng đúng actor/key/body; trả snapshot đã
  lưu, không chạy lại ledger. Sai body, mất role hoặc phiên bị thu hồi vẫn bị
  từ chối. Không đảo hoặc viết lại các quyết định/bút toán cũ.
- Admin/Staff giữ hàng đợi **chỉ đọc**, tình trạng gửi/nhận và cảnh báo phần
  đang chờ. Không đưa nút phán quyết trực tiếp hoặc hứa empty nghĩa mọi giao
  dịch đều thuận lợi. Quyền xem hàng đợi không là quyền giải ngân.
- Mutual cancellation trước gửi, inspection bình thường không claim và các
  worker hiện hành giữ protocol riêng; không mở lại hồ sơ đang giữ dispute.

## Mở lại thực thi

[ADR0089](0089-one-sided-exchange-return.md) bổ sung luồng riêng cho một chiều đã giao có xác nhận và chiều còn lại quá hạn gửi. Lệnh cũ vẫn chỉ phục vụ replay.

Cần gói riêng có quyết định hiệu lực, custody/return và điều kiện duyệt lại,
phân bổ từng nguồn tiền, thẩm quyền300.000đ/escalation, assignment/independence,
kháng nghị48h và review người thật theo TEAMWORK. Không bật lại bằng env flag,
một lý do văn bản hoặc diễn giải test xanh thành nghiệm thu.

Không migration mới, không sửa migration đã áp dụng, không GHN/carrier/Driver,
không tác động DB chính. Kết quả kiểm được ghi trong SESSION_STATE của gói.


## Phân xử khiếu nại trong bước kiểm tra — 15/11/2026

Chủ dự án xác nhận Staff phụ trách có quyền ra phán quyết khi cả hai đã nhận
sách. Contract 0.80 giới hạn thao tác trong PR #111 cho Staff/Admin đang hoạt
động, độc lập và đang được phân công. Phiếu phải còn ResolutionPending, đủ
funding, có khiếu nại và có mốc gửi/nhận ở cả hai chiều.

Staff hoặc Admin có thể hoàn tất theo thỏa thuận hoặc, với phiếu một cuốn mỗi
bên, quyết định bồi thường có hiệu lực ngay. Phương án bồi thường đang dùng của
PR #111 hoàn tiền bù về người đã nộp, hoàn cọc người được bồi thường và chuyển
cọc còn lại cho người đó. Bài của sách được xác định hư hại bị đóng. Bài còn lại
về nháp. Đây là phương án có sẵn của gói demo/QA. SRS mục 9.5–9.6 còn có các
mẫu giữ sách với mức bồi thường điều chỉnh, hoàn hai chiều và xét kháng nghị.
Các trường hợp đó cần quy trình phân bổ và custody tương ứng trước phát hành.

Phán quyết cũ RefundBoth giữ chế độ replay. Ca một bên đã nhận và bên kia quá
hạn gửi đi qua ADR 0089, với quy tắc tiền, thời hạn và thẩm quyền riêng.
Migration 0080 lưu loại phán quyết bồi thường trên phiếu. Dữ liệu từng xử lý chỉ
điền từ biên nhận khớp phiếu và revision, giữ nguyên bút toán và thời điểm.

## Chờ trả sách sau phán quyết toàn phần — 24/11/2026

- Với phiếu đã gửi và xác nhận nhận đủ hai chiều, phán quyết toàn phần mở
  quyết định trả sách theo cửa sổ kháng nghị 48 giờ và hạn bàn giao 72 giờ
  của [ADR0089](0089-one-sided-exchange-return.md). Sách và tiền vẫn giữ.
- Bên đang giữ sách của bên bị hại báo mã vận đơn chặng hoàn. Chủ sách xác nhận
  khi nhận, hoặc Admin phụ trách xác minh bằng chứng, rồi có 48 giờ kiểm tra.
  Trả thành công hoàn các khoản đang giữ và đưa sách đã xác minh trả về nháp.
  Bài của sách vi phạm đóng sau khi quyết toán.
- Quá hạn chưa bàn giao hoặc có sự cố chặng hoàn cần Admin đối chiếu bằng chứng
  và ra quyết định bồi thường. Khi quyết định có hiệu lực và được quyết toán,
  tiền chi theo phân bổ hiện hành. Sách chưa thu hồi không trở lại kệ.
- `Tua hạn trả sách · Demo` dùng đúng lệnh tua hạn hiện có khi chế độ demo đã
  bật và phiếu đủ điều kiện. Staff độc lập được phân công có thể tua hạn trả.
  Tua hạn chỉ chỉnh mốc chờ, sau đó hồ sơ vẫn cần quy trình xác minh và chi tiền.
- Luồng khấu trừ một phần, bác khiếu nại và biên nhận đã đóng giữ cơ chế hiện có.
