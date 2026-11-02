# Chi tiết bản sách Member web — 02/11/2026

Owner duyệt sửa sau khi thấy ảnh quá nặng, giá nhỏ trong nửa khung, người bán
tách xa và nút mua/giỏ/chat không thống nhất. Scope `apps/user-web`, không Admin,
RN/native, Flutter, API, migration, GHN hoặc gate giao dịch mới.

Source: `codex/admin-listing-review-workspace`, HEAD `cbc616f7` cộng diff chưa
commit, giữ gói review/motion/search. Checkout ứng dụng đang chạy HEAD `f3291409`
có việc teammate: chỉ áp các file detail/gallery/cart qua baseline checks;
khác biệt SupportLink thuộc nhánh mới không được đưa sang app local cũ.

## Bố cục và dữ liệu

- [BookDetailPage](../../apps/user-web/src/pages/BookDetailPage.tsx) cùng
  [CSS](../../apps/user-web/src/pages/BookDetailPage.module.css): desktop45/55,
  một document scroller. Bỏ hộp nội dung lồng khối giá; tên/tác giả → lời khai
  tình trạng → giá → người đăng → hành động. Giá đơn chiếm cả hàng; Both có hai
  mức giá. Người bán nằm trước thao tác, không có khoảng rỗng của sellerRow.
- Mua ngay là hành động chính, đề nghị đổi/giỏ/chat là nhánh phù hợp theo mode,
  ownership và availability. Giữ route/state thật, không đổi buy-now semantics.
  Condition được ghi rõ là do người bán khai báo, không biến kiểm duyệt thành
  chứng minh chất lượng vật lý. Giữ bundle manifest và báo cáo nội dung hiện có.
- [ListingGallery](../../apps/user-web/src/components/ListingGallery.tsx) dùng
  contain cả ảnh đầu, giữ nguyên ảnh gốc; thumbnail một dải nội bộ cuộn ngang,
  không tạo cột sticky hoặc nested vertical scroller. Frame con có kích thước
  xác định để ảnh không mất chiều cao ở lượt bố cục đầu. Giữ signed read/retry,
  viewer/ArrowLeft/Right/Escape/focus và scroll lock khi mở dialog.
- [AddToCart](../../apps/user-web/src/components/AddToCart.tsx) có
  [style riêng](../../apps/user-web/src/components/AddToCart.module.css), không
  mượn layout CartPage. Nút/feedback đồng bộ; chỉ sau ACK mới có Xem giỏ sách.
  Giữ pending receipt/key/body và ngăn viết mới khi detail chưa đáng tin; vẫn cho
  đối chiếu yêu cầu cũ nếu lượt refresh detail lỗi. Giỏ/chat không giữ chỗ.
- QA phát hiện guest cart link dùng returnTo trong khi Login đọc returnUrl:
  sửa đúng link của component để đăng nhập quay lại chính listing. Không thay
  Login hoặc mở rộng sửa toàn bộ return links ở các màn khác.
- Tiêu chí đổi bỏ inline cards/emoji, dùng typography chung; link tìm theo tác
  giả/thể loại dùng q thay cho search mà BookSearchPage không đọc. Không thêm
  thuật toán matching hoặc đổi tiền bù.

Taste split-stage seed1300799799 giữ palette/type hiện có; điều chỉnh bỏ sticky,
wordmark takeover và stock copy vì owner đã duyệt một luồng cuộn/nội dung thật.
Impeccable context1lần cho target; review cùng phiên, không nhận là độc lập.

## Hành trình kiểm tra

| Người xem/trạng thái | Điểm vào → hành động | Kết quả và bước tiếp |
| --- | --- | --- |
| Khách, sách khả dụng | Chi tiết → Thêm vào giỏ | Login đúng returnUrl → quay lại đúng sách; không tự báo đã thêm |
| Buyer, Sale/Both | Mua ngay | Route buy-now theo ID, tiếp tục quote/tạo đơn/thanh toán hiện có |
| Buyer thêm giỏ | Xác nhận → mất phản hồi → Xác minh thao tác giỏ trước | Replay cùng key/body → ACK → Xem giỏ; không reserve |
| Buyer, Exchange/Both | Đề nghị đổi | Chat/start đúng listing+intent, không gọi đó là giao dịch đã thành công |
| Sách đang giữ | Xem trạng thái | Không có Mua ngay/Thêm giỏ; chỉ rõ chờ thanh toán/giao dịch |
| Người đăng | Chi tiết bài của mình | Không mua/thêm giỏ/nhắn chính mình; giữ nhánh theo dõi trao đổi |

## Bằng chứng

- PASS Member typecheck,308unit/44file, build; lint0error/8warning có trước.
  Checkout app typecheck PASS. Không đổi dependencies/contract/generated types.
- [Runner mới](../../apps/user-web/tests/book-detail.mjs), lệnh
  `pnpm --filter @used-books/user-web test:book-detail:browser`: PASS8nhóm,
  real Nest/Mongo replica set/database riêng `*_test`, media QA fake. Có guest
  return/login, buyer/owner thật, cart lost ACK+same receipt, detail refresh503
  vẫn cho reconcile, một mục giỏ và server availability vẫn Available.
  Mode Sale/Exchange/Both và held ở runner là response contract variants giả
  để kiểm UI, không nhận là tích hợp transaction cho mọi mode/hold.
- PASS harness Mua ngay hiện có `tests/buy-now.mjs`: listed price, quote không
  reserve/chat, create/pay lost ACK same-key/body, OrderCreated chung hai bên,
  underfunded không hold, paid Preparing không chờ seller, notifications,
  shipment polling/transient503 giữ form/focus, upload media và simulated pickup.
  API/Mongo thật, storage/payment/carrier QA fake,390/1440px; không GHN thật.
- PASS app local đọc nghiệp vụ,8ảnh Supabase thật,1920/1440/1024/768/390/320:
  không tràn ngang, ảnh contain có chiều cao và nằm trong frame,8thumbnail cùng
  hàng/không tràn ô; seller trước hành động. Chọn8/viewer/ArrowLeft/Escape/focus
  PASS; chữ130% ở390px không tràn;0pageErrors. Đã xem ảnh desktop/mobile.
- Detector1lần exit0,0primary/9advisory (8color/1radius), không là human UX PASS.
  Kiểm kê độc lập fixture DB/user/role còn0 trước khi dừng Mongo QA do lượt này bật.
  API/Vite QA dừng; API3000/Member5174 có sẵn được giữ chạy.

User1 hiện đọc được công khai và DB báo Approved; lượt UI này chỉ đọc DB chính,
không tự duyệt hoặc thay trạng thái/dữ liệu demo. Các ảnh có provenance ở gói dữ
liệu cũ; sửa UI không nghiệm thu ảnh điện thoại/tình trạng cuốn sách thật.
Native/bundle giao dịch đầy đủ/human/remote CI NOT RUN; chưa push/merge/đóng gate.

Artifact ignored `.tmp/book-detail/`: snapshots baseline, `qa/result.json`,
`qa.private.log`, `buy-now.private.log`, `live-result.json`, `confirm-*.png`,
build/detector logs. Một lượt áp source có import SupportLink không tương thích
checkout cũ đã làm local typecheck fail; đã bỏ đúng import đó ở local và xác nhận
typecheck/live lại PASS, không đưa module mới vào checkout cũ.
