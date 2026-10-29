# ADR 0056: ISBN và khoảng tham chiếu trước AI, nguồn giá độc lập

29/10/2026. Accepted trong gói owner duyệt tăng tốc/chất lượng hai trợ lý hiện có.
Kế thừa [ADR0028](0028-listing-price-assistant.md),
[ADR0048](0048-listing-photo-autofill.md), [ADR0054](0054-cross-client-listing-ai.md)
và [ADR0055](0055-listing-catalog-recovery.md). Không thêm AI duyệt bài, không đổi
SRS, luật giá POL-16, ledger hoặc gate giao nhận.

## ISBN trước AI

- `POST /listings/{listingId}/isbn-matches` đọc1–3 ảnh Ready của chủ nháp sách đơn
  còn sửa được. Member ACTIVE/session hiện tại được kiểm trước và sau storage/
  decoder. Không ghi metadata/receipt, không quota, không gọi model hoặc dịch vụ
  nhận ảnh ngoài hệ thống; không cần Idempotency-Key.
- ZXing EAN-13 và checksum ISBN chạy local trong worker có giới hạn1500ms/ảnh,
  heap64MB, ảnh tối đa1600px sau Sharp. Chỉ quét một số hàng với hai hướng ảnh,
  có thể bỏ sót ảnh nghiêng/mờ/mã nhỏ. Không tuyên bố đã đọc hết mọi barcode.
  Tối đa2 lượt storage/decode đồng thời mỗi process, không xếp hàng vô hạn.
  Cache/coalescing theo listing + key/hash ảnh trong2phút, tối đa256 mục; lỗi không
  được giữ thành kết quả âm. Worker không log pixels, URL, token hoặc metadata.
- Một ISBN và có catalog phù hợp → hiển thị thông tin **từ danh mục**, yêu cầu
  xác nhận; chưa gọi AI. Nhiều ISBN → Ambiguous, người bán chọn mã, không lấy mã
  đầu. Không tìm được catalog/mã hoặc decoder Unavailable → tiếp tục luồng AI
  mà người dùng đã yêu cầu; Unavailable không được giả thành NotFound.
- Nút đọc chữ bằng AI vẫn có khi đã khớp ISBN. Ý định này được giữ qua retry cùng
  bộ ảnh, dùng lại key/body của trợ lý hiện hành khi mất phản hồi. Không sửa receipt
  AI đã lưu hoặc gắn metadata catalog thành chữ đã đọc trên ảnh.

## Khoảng giá nhanh

- `POST /listings/{listingId}/price-reference` đọc rule/evidence hiện tại bằng cùng
  điều kiện owner/ACTIVE/editable/single-book/Ready photo với gợi ý giá. Không gọi
  model/online lookup, không quota/receipt hoặc ghi nháp. Trả khoảng theo luật,
  nguồn/ngày/loại nguồn/loại trừ, mức căn cứ, fingerprint và hạn dùng5phút.
- Web/RN lấy khoảng tham chiếu sau bước chuẩn bị catalog/ảnh, rồi gọi AI bằng
  intent cũ. UI ghi rõ cách tính và phân biệt phân tích AI. Nếu model chậm/lỗi,
  khoảng còn hạn vẫn chọn được. Chọn mức tham chiếu luôn xác nhận; không tự đổi
  giá khi response AI về. Đổi input, thiếu ảnh hoặc hết hạn khóa khả năng áp dụng.
- Khoảng tham chiếu không có suggestionId. Chọn nó là quyết định giá thủ công;
  xóa trạng thái đã áp dụng AI cả trong kết quả đang giữ để refresh, tránh replay
  cùng ID khôi phục nhầm `applied=true`. AI vẫn chỉ ghi quyết định qua save hiện có.
  Không đổi tỷ lệ tình trạng, điều kiện từ chối hoặc quyền tự đặt giá của seller.

## Nguồn độc lập

- Không suy độc lập từ nhãn hiển thị. Dùng registrable domain theo PSL (`tldts`,
  gồm private suffix) và ID tổ chức `sourceGroup` do người biên tập xác minh.
  Các quan sát chia sẻ domain **hoặc** ID tổ chức được nối cùng nhóm, kể cả quan hệ
  bắc cầu. Không đủ dữ kiện thì originGroup=null, mức căn cứ tối đa Limited.
- Mỗi nhóm chỉ đóng góp một quan sát mỗi nhóm giá mới/giá cũ trong tập đã đọc.
  Ưu tiên giá bìa biên tập hơn giá retail cùng nguồn theo ADR0028; còn lại dùng thứ
  tự ngày/ID ổn định. Quan sát trùng có `excluded=DuplicateSource`, vẫn hiển thị
  lý do. Giữ lọc ấn bản khác/nguồn cũ/outlier/giá rao và yêu cầu cả giá mới + giá cũ
  để Strong. Không coi nhiều nhãn hoặc URL tracking là nhiều nguồn.
- Migration0043 thêm sourceGroup optional nullable vào price_references. Không
  backfill bằng nhãn, không sửa dữ kiện/receipt cũ. Importer yêu cầu URL HTTPS có
  domain hoặc ID tổ chức ổn định; nguồn không URL phải có ID đã kiểm, không dùng
  tên cá nhân hay tự tạo một ID cho mỗi quan sát.
- Import mặc định dry-run. `--apply` thêm fact/mapping trong transaction hữu hạn;
  mapping vào record cũ chỉ khi group chưa có và facts liên quan khớp. Group đã
  xác định xung đột làm abort toàn batch. Không tự ghi đè group đã xác minh.
  Chạy lại không nhân bản; lịch ngày được kiểm đúng thay vì chấp nhận ngày rollover.

## Triển khai

Contract0.63:196operations/30controllers; registry56 migrations đến0043. Cần cập nhật
API, web/RN và Admin cùng gói vì client cũ kiểm enum có thể không nhận DuplicateSource.
Receipt AI cũ được replay nguyên vẹn; đánh giá mới/fingerprint mới dùng quy tắc nguồn
mới, không viết lại lịch sử. Dừng API/worker và migrate trước source mới; không reset
hoặc seed lại. Gói chỉ migrate/import dữ liệu tổng hợp trong QA, chưa áp dụng DB chính.

[Bằng chứng và giới hạn](../features/LISTING_ASSIST_FAST_PATHS_2026_10_29.md).
Các timing QA không là SLA, ảnh barcode dựng không là nghiệm thu ảnh điện thoại;
không đổi READINESS hoặc model/prompt/env/GHN/carrier/Driver.
