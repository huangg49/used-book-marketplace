# ADR 0089: Thu hồi sách khi chỉ một bên đã gửi

13/11/2026. Chủ dự án duyệt triển khai ca một bên đã gửi, đối tác đã xác nhận nhận sách và quá hạn gửi cuốn của họ. Dùng SRS FR-X07–X10, FR-D01–D09, UC-10–12, mục 9.5–9.6 và AC-24/30–37. [ADR0057](0057-exchange-resolution-safety.md) vẫn chi phối các lệnh phân xử cũ và các ca ngoài phạm vi.

## Quy trình

- Khi gửi qua hãng, lưu mã vận đơn chỉ đăng ký kiện. Chỉ mở lấy kiện khi đủ hai mã riêng và còn trong hạn 72 giờ. Nếu hết hạn trước khi lấy bất kỳ kiện nào, hủy phiếu và hoàn các khoản đã nộp. Nếu đã lấy một kiện, áp dụng nhánh tranh chấp bên dưới. Hai bên dùng cùng phương thức giao nhận trên phiếu mới. Trình mô phỏng local thực thi điều phối; tích hợp lấy kiện thực tế cần cơ chế xác thực và điều phối của hãng. Các mốc gửi cũ giữ nguyên để tránh hoàn tiền nhầm.
- Chỉ xử lý hai bài sách lẻ đã nộp đủ cọc và tiền bù. Một chiều được ghi nhận gửi trong hạn và đã có mốc nhận. Chiều kia chưa ghi nhận gửi khi mở tranh chấp sau hạn. Member báo sự cố trên phiếu, hoặc worker mở khi quá hạn. Chặng đến có thể được bên nhận xác nhận riêng trước khi cả hai cùng gửi.
- Khi người nhận im lặng và phiếu thiếu mốc nhận, Admin được phân công có thể xác minh giao ban đầu trong hồ sơ quá hạn. Chọn tệp đã tải xong của đúng hồ sơ, từ thời điểm gửi trở đi, và ghi căn cứ đối chiếu đúng kiện, người nhận và bàn giao. Lưu người xác minh, thời điểm, tệp và lý do riêng với mốc tự xác nhận của Member. Phiếu tiếp tục giữ tiền và sách. Quy trình trả chỉ bắt đầu ở bước yêu cầu bổ sung bằng chứng; các hạn và quyền quyết định áp dụng như trước. Ảnh đóng gói hoặc mã vận đơn riêng lẻ không chứng minh đã giao.
- Dùng phân công bằng chứng đang có. Người phụ trách độc lập gửi yêu cầu cho cả hai, mở 48 giờ bổ sung. Member gửi giải trình và bằng chứng qua phiếu. Hệ thống tiếp tục giữ toàn bộ khoản giữ của Exchange.
- Quyết định trả sách mở 48 giờ kháng nghị, mỗi bên một lần cho quyết định hiện tại. Admin độc lập và khác người ra quyết định xử lý kháng nghị sau khi hết cửa sổ của cả hai. Staff chỉ xử lý quyết định trong tổng khoản giữ đến 300.000đ. Admin xử lý vượt ngưỡng, xác minh thay cho người nhận hoàn và quyết định bồi thường.
- Sau khi quyết định có hiệu lực, người giữ có 72 giờ để bàn giao sách hoàn và ghi mã vận đơn. Mã vận đơn là thông tin khai báo. Chủ xác nhận đã nhận đúng sách hoặc Admin xác minh giao hoàn dựa trên bằng chứng trong hồ sơ. Có 48 giờ để báo sai sót trước khi chi. Nếu mã được xác minh chưa có bàn giao, Admin đưa hồ sơ về hạn trả cũ. Sách đã gửi hoàn nhưng mất, trả sai hoặc hư hỏng vẫn giữ hồ sơ để đối chiếu.
- Hết hạn trả và có bằng chứng xác minh sách không thu hồi được từ bên đang giữ, Admin có thể ra quyết định bồi thường. Quyết định này có cửa sổ kháng nghị 48 giờ riêng. Khi quyết định có hiệu lực, người phụ trách đúng quyền thực hiện. Thao tác ghi nhận vi phạm không trả sách một lần và không tự gắn nhãn gian lận.
- Trả thành công hoàn các khoản đã nộp, đưa sách trả về nháp để chủ kiểm tra và gửi duyệt lại. Bồi thường hoàn cọc chủ sách và tiền bù cho người đã nộp, chuyển cọc của bên không trả sang chủ sách và đóng bài của sách chưa thu hồi. Bài sách bên chưa gửi được giải phóng. Sổ cái ghi riêng hoàn khoản và bồi thường. Mỗi bút toán liên kết receipt của quyết định thực thi.
- Phần đầu dùng ví và vận chuyển mô phỏng, mã chặng hoàn do Member ghi và bằng chứng do Admin đối chiếu. UI dùng địa chỉ snapshot có sẵn hoặc hướng Member tới hỗ trợ khi cần xác nhận địa chỉ. Chưa phân bổ phí hoàn thực tế, chưa xử lý tổn thất do hãng hoặc kết luận trả sai sách. Các ca đó cần quy trình tiếp theo. Hạn và bằng chứng trong hồ sơ điều khiển thao tác quyết toán thủ công của người được phân công. Không có worker tự chi trong gói này.

## Tích hợp

- Chế độ demo local 0.79 thêm nút tua hạn trên phiếu và hồ sơ Admin theo [ENV_HANDOFF](../handoff/ENV_HANDOFF.md). Nút đóng thời hạn hiện tại và áp dụng quy tắc hết hạn tương ứng. Các bước cần chứng cứ, phân công, quyết định độc lập hoặc tất toán vẫn dùng lệnh sẵn có.

- Contract 0.75.0, migration mới 0077. Triển khai API và các consumer ví cùng phiên bản để nhận hai loại bút toán mới. React Native đã có schema và nhãn ví tương thích. Màn thao tác trả sách RN thuộc lane của teammate.
- Contract 0.76.0 và migration 0078 thêm xác minh giao ban đầu cho Admin và kết quả chỉ đọc trên Member web. Dùng lại phân công, bằng chứng riêng và lệnh phục hồi của hồ sơ.
- Member web và Admin/Staff web dùng API thật. Bàn vận hành xem tệp riêng qua service có kiểm phân công; các lệnh cũ giữ replay dưới quyền hiện tại. Các thay đổi state, tiền, bài đăng, audit, receipt và vi phạm khi chi nằm trong một transaction.
- Gói có phạm vi local/QA. Trước phát hành cần review người thật về tiền/quyền, thử xuyên vai trò và nghiệm thu RN. Xem [READINESS](../handoff/READINESS.md).
