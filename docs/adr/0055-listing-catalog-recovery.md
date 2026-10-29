# ADR 0055: Đối chiếu danh mục sau khi đọc ảnh

29/10/2026. Accepted trong gói owner duyệt cải thiện trợ lý đăng sách, kế thừa
[ADR0048](0048-listing-photo-autofill.md) và
[ADR0054](0054-cross-client-listing-ai.md). Không đổi nghiệp vụ tạo/duyệt đầu sách.

## Vấn đề

Đối chiếu tên chính xác bỏ sót khi OCR đọc nhầm chữ, đảo tên với tác giả hoặc chỉ
đọc tên bộ truyện. Tên tác phẩm giống nhau không chứng minh cùng tập/ấn bản.
Kết quả đọc ảnh đã lưu và receipt phải giữ nguyên khi người bán sửa từ khóa.

## Quyết định

- Thêm read-only `POST /listings/{listingId}/catalog-matches`, contract0.62.
  Xác thực session/quyền hiện tại, Member ACTIVE và chủ nháp sách đơn còn sửa được.
  Chỉ đọc Confirmed và Pending của chính caller; không cho xem Pending của người khác.
  Không tạo receipt, trừ quota, gọi model hoặc cập nhật nháp/danh mục. Giao thức
  `commands.read` vẫn giữ khóa actor để kiểm quyền trong transaction.
- Giữ nguyên schema/kết quả/receipt Autofill cũ. UI web/RN đối chiếu lại danh mục
  qua endpoint mới khi có kết quả ảnh; người bán sửa tên/tác giả/ISBN/tập để tìm
  lại độc lập với AI. Lỗi ảnh vẫn cho tìm bằng chữ hoặc nhập tay.
- Migration mới0042 thêm projection `recoveryKeys` và multikey index theo status,
  key và ID. Backfill từ current revision, không tăng business version. Create,
  resubmit, seed và phép chuyển snapshot PostgreSQL tạo cùng projection. Field
  optional để tương thích fixture/import cũ; integrity kiểm khi field hiện diện.
  Không sửa migration cũ; derivationV1 được giữ ổn định.
- Tìm cửa sổ indexed: ISBN hoặc tên chuẩn hóa, toàn bộ token prefix, rồi một số
  token prefix từ tên/tác giả. Mỗi status/window tối đa120 records, maxTimeMS500;
  Pending chỉ của caller. Không regex/catalog scan. Rank bằng tên gần đúng,
  tác giả và trường đọc đảo, dùng bigram tuyến tính. Trả tối đa5 gợi ý có thứ tự
  ổn định. `truncated` báo vượt cửa sổ hoặc còn hơn5 kết quả, không hứa tìm hết.
- ISBN người dùng cung cấp là ràng buộc cứng, không fallback sang ISBN khác/null.
  Số tập đã biết xung đột bị loại; Roman I/II và số1/2 được chuẩn hóa. Từ khóa tự
  mâu thuẫn số tập trả422. Thiếu số tập phải cảnh báo, metadata khác có nhãn.
  Không gắn xác suất tin cậy hoặc tự chọn kết quả đầu.
- Hiển thị tác giả/NXB/năm/ấn bản/ngôn ngữ/ISBN có thật, lý do gợi ý và trạng thái
  Pending. Luôn xác nhận trước chọn đầu sách, nói rõ ảnh hưởng lên bài đăng.
  Đổi từ khóa/lỗi request khóa kết quả cũ; response cũ hoặc khác session không
  được áp dụng. Tìm kiếm không tự thay metadata, không tự tạo catalog/submit.
- Không thêm Qdrant hoặc đổi provider/prompt/timeout. Đây là phục hồi tìm danh mục,
  không sửa chữ OCR đã lưu và không nâng điểm nhận dạng ảnh bằng heuristic.

## Triển khai và giới hạn

Dừng API/worker rồi chạy migration0042 bằng migrator trước khi bật source mới.
Gói chỉ áp dụng trong QA, DB chính chưa migrate. Có thể lùi app về bản cũ với field/
index bổ sung, không tự xóa projection hoặc rollback bằng sửa checksum.

[Báo cáo gói](../features/LISTING_CATALOG_RECOVERY_2026_10_29.md) ghi kiểm thử và
phép đo riêng về đúng ấn bản. Bộ24 đã xem không là holdout; không đóng gate
ADR0048, native, real-camera, human review hoặc READINESS từ kết quả này.
