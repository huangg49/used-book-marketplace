# ADR 0046: Bộ sách là một lô bán nguyên bộ

Được owner duyệt25/10/2026 sau khi xem minh họa Seller đăng → Buyer xem → phiếu
mua. Gói này gồm API chung và Member web; không sửa client mobile của teammate.
Đây là ngoại lệ có phạm vi với định nghĩa một listing/một cuốn trong SRS1.1.

## Quyết định

- Một listing Marketplace có thể là một cuốn hoặc một bộ2–50cuốn, chỉ Sale và
  DirectDelivery. Một bộ có tên, danh sách từng cuốn/tập, tình trạng và ghi chú
  từng cuốn; không suy số cuốn hoặc “trọn bộ” từ tên series. Catalog vẫn mô tả
  đầu sách/ấn bản được chọn; manifest trên revision mới xác định các hiện vật bán.
- Giá10.000–1.000.000₫ hiện có áp dụng cho toàn bộ bộ. Một bộ chiếm một slot trong
  quota5bài; không đổi phí, ví, shipping simulator hoặc gate READINESS.
- Các cuốn trong bộ không có endpoint mua/tách riêng. Seller xác nhận sở hữu và
  không đăng bán đồng thời các cuốn đó ở tin khác. Gói này chỉ tạo bộ mới, không
  ghép/chuyển listing hiện có vào bộ. Không tuyên bố phát hiện tự động cùng hiện
  vật bị khai báo hai lần bằng các tin độc lập; đó cũng là giới hạn nhận diện vật
  lý hiện tại. Khi hỗ trợ chuyển/tách tồn kho phải có thiết kế identity riêng.
- Giữ đúng một listing/commitment/Order item cho cả lô; snapshot Order chứa toàn
  bộ manifest bất biến. Giá thỏa thuận, giữ tiền, gửi/nhận và trả sách áp dụng cho
  cả lô. Không có chọn từng tập, hoàn một phần, Exchange hoặc Auction cho bộ.
- Nội dung/ảnh và tình trạng tổng hợp phải mô tả cả bộ, tổng hợp theo cuốn yếu
  nhất. Reviewer phải xác nhận manifest/ảnh trước khi Approve; checklist cũ không
  tự cấp quyền duyệt bộ. Không có rating hoặc thông tin kiểm định tự tạo.

## Tương thích và API

`bundle` tùy chọn/null trên DraftContent/SubmittedContent/PublicListing và
OrderItemSnapshot giữ tương thích sách lẻ và snapshot cũ. Revision đã submit
giữ bất biến như hiện tại; sửa một bộ phải gửi rõ manifest hoặc null, không bỏ
trường rồi âm thầm mất nội dung. API bộ chỉ xuất hiện ở public shelf/detail khi
client opt-in; Member web opt-in và hiển thị manifest. Buyer quote phải xác nhận
mua nguyên bộ, ràng buộc expected listing/revision hiện có. Client cũ không thể
vô tình mua một bộ mà chưa hiểu nội dung. Native không được nhận là hỗ trợ bộ.

## Nghiệm thu

Kiểm schema/migration mới, validation manifest/duplicate/condition, owner/stale
version/replay và giữ bộ cạnh tranh giữa hai Buyer. Kiểm snapshot không đổi sau
khi tạo Order; không mua một phần hoặc lách sang Exchange/Auction. Browser kiểm
đăng/sửa lỗi giữ dữ liệu, review, tag trên kệ, chi tiết và xác nhận mua cả bộ ở
desktop/màn hẹp. QA dùng replica set/database `_test`, không seed/xóa DB chính.
Live storage, native, human review và release là bằng chứng riêng.

## Điểm kiểm trước khi tích hợp — 26/10/2026

Xác nhận Buyer trên web gắn với listing/revision. Bản hiển thị trong lần chờ,
retry và xác nhận quote là bản sao nội dung đã đọc; refetch không thay nó bằng
manifest mới. Lỗi chưa biết kết quả giữ nguyên command key/body; chỉ tải lại
nội dung và bỏ xác nhận cũ sau kết quả thất bại rõ ràng hoặc chủ động lấy quote
mới khi không có command chưa xác nhận. API vẫn kiểm version/revision dưới lock.

| Ca nghiệm thu | Kết quả cần giữ | Evidence kỹ thuật |
| --- | --- | --- |
| Seller thay tập2 bằng tập3 sau khi Buyer xem | Quote cũ không tạo được Order; Buyer xem/xác nhận lại manifest mới | Order HTTP test và CUA sửa→409→tải lại→bỏ tick |
| Máy chủ commit nhưng client mất phản hồi | Retry cùng key/body/revision, không tạo lần gửi mới để ép thành công | Web tests7bước đăng bộ; CUA3nhóm quote replay có hash giống nhau |
| Hủy/hết hạn đơn chưa trả tiền | Giải phóng cả bộ, không tách tập, không ghi journal thanh toán; snapshot giữ nguyên | Order HTTP tests cancel/expiry và CUA cancel |
| Quote hết hạn | Không tạo Order/commitment; cả bộ giữ nguyên | Order HTTP test tại đúng deadline |
| Mở Order→Chat khi route tải lạnh | Đúng hội thoại và manifest, không lặp điều hướng | CUA trước sửa2cảnh báo React, sau sửa0; regression script bắt console error |

Owner đã duyệt phạm vi sản phẩm ở đầu ADR; các mục sau vẫn cần **người trong
nhóm** review implementation trước tích hợp, không được AI tự ký đạt:

- [ ] API/DB owner kiểm diff, snapshot/commitment, tương thích client cũ và migration.
- [ ] Staff thử đối chiếu ảnh thật với danh sách, bộ thiếu tập giữa dãy và lỗi riêng
  của từng cuốn; không duyệt chỉ vì tiêu đề ghi “trọn bộ”.
- [ ] Người phụ trách nghiệp vụ kiểm giới hạn2–50cuốn, giá tối đa1triệu cho cả bộ,
  quota một tin và giới hạn cam kết không đăng trùng hiện vật.
- [ ] Người phụ trách tiền/tranh chấp kiểm kịch bản nhận thiếu/sai tập so với
  manifest, giữ quyền xử lý ở toàn bộ đơn và chính sách trả nguyên bộ. Đây là
  review tình huống theo SRS/gate hiện có, không là bằng chứng đã có luồng xử lý
  sau giao hoặc quyền mở refund/settlement.
- [ ] Owner client mobile xác nhận kế hoạch hỗ trợ riêng; web không thay native PASS.

Full Playwright suite, CI remote và chữ ký human review chưa có trong gói này.
Không áp dụng migration lên DB chính hoặc tự merge vì các ca local đã đạt.
