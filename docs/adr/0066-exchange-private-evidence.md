# ADR0066 — Bằng chứng riêng cho sự cố Exchange

Ngày:02/11/2026. Trạng thái: chấp nhận trong gói owner duyệt; gate storage100MB và native/người thật còn mở.

## Vấn đề và phạm vi

Form RN/web cũ chọn ảnh/video rồi ghép tên hoặc đường dẫn mẫu vào reason. Không có
bản gốc bền vững để Staff kiểm tra. Tên tệp không chứng minh nội dung đã được gửi.
Đáp ứng phần bằng chứng FR-D03/04, FR-X10, EF-26 và NFR-13 trong [SRS1.1](../SRS_V1_1.md).
Không thay gate [ADR0057](0057-exchange-resolution-safety.md), custody, ledger,
claim eligibility/deadline, quyết định phân xử/kháng nghị hoặc GHN.

## Quyết định

- Tiếp nhận báo sự cố bằng mô tả trước qua command hiện có, đúng revision/key.
  Upload là bước bổ sung sau `ResolutionPending`; upload lỗi không hủy báo cáo.
  Mỗi participant có tối đa10 intent giữ lại trên Exchange (hai claimant riêng),
  kể cả Pending. Không bắt buộc video và không dùng ảnh mẫu làm bằng chứng thật.
- Collection `exchange_evidence` lưu intent/hash/MIME/size/người gửi và trạng thái
  Pending→Ready một lần. Intent không đổi bytes, tên, owner hoặc đối tượng. Object key không được dùng lại cho nội dung khác; chỉ lưu một original
  create-only theo UUID, không chuyển tệp vào bucket ảnh listing.
- JPEG/PNG/WebP10MB, PDF20MB, MP4 100MB theo SRS. Sharp kiểm ảnh; PDF.js kiểm PDF
  tĩnh (từ chối JS, attachment/action được parser phát hiện); MP4Box kiểm container,
  video track/codec, kích thước box, sample metadata và thời lượng xử lý. Parser
  PDF/MP4 ở worker riêng có timeout20s/memory256MB; hai upload/process dùng slot
  chung với listing/packaging. Đây không là antivirus, xác nhận tính thật của ảnh
  hoặc giải mã/kiểm mọi frame video. PDF tối đa500trang, video tối đa2giờ và tập
  codec/container được hỗ trợ; không chạy macro/script hay render original trong app.
- Quota20intent/giờ/uploader và ngân sách800MB chia sẻ với media/packaging. Reservation
  được tính cả Pending/orphan sau storage thành công nhưng DB lỗi; không bỏ charge
  vì mất ACK. Không tự xóa evidence khi đổi tài khoản/xóa listing hoặc đang điều tra.
  Cleanup sau đóng/POL-25 chưa triển khai trong gói này; quota giữ fail closed.
- Dùng executor/transaction/auth hiện tại trước replay; discovery khóa participant
  và assignee, khóa Exchange serialize create/upload/assignment. Storage I/O ngoài
  transaction; kiểm lại phiên, uploader, status sau I/O rồi mới Ready. Không đổi
  revision Exchange/ledger chỉ vì upload hoặc nhận phụ trách bằng chứng.
- `exchange_evidence_assignments`: Staff độc lập nhận phụ trách nếu chưa có ai;
  Admin độc lập có thể nhận lại với lý do/version mới. Đây chỉ là phân công xem tệp,
  không cấp quyền ra phán quyết. Participant có role Staff/Admin không được xem
  hồ sơ của mình qua route operations. List/read operations yêu cầu đúng assignee.
- Participant đọc Ready trên giao dịch của mình; Pending chỉ người gửi thấy.
  Mỗi lượt cấp link đọc original được audit (operations bắt buộc lý do), kiểm quyền
  cả trước và sau ký. Link attachment tối đa120giây, không nhúng PDF/HTML/video trong
  app và không trả storage key trong list. Link đã cấp còn hiệu lực đến hết hạn.
- Client chung giữ create key/body/hash/bytes và upload key qua Back trong RAM,
  khóa ý định đang bất định; không tự đổi key/version khi503/401/403/429. Đổi identity
  xóa intent và chặn late ACK. Sau reload có thể chọn lại đúng original của Pending;
  server kiểm hash. Không persist token hoặc evidence trong IndexedDB/localStorage.
- Contract0.73 + migration mới0054, không sửa migration đã áp dụng. Sau khi được
  duyệt áp dụng ở môi trường đích, chạy migrate rồi bootstrap quyền collection mới.

## Giới hạn triển khai

`SUPABASE_EVIDENCE_BUCKET` phải private, khác `SUPABASE_MEDIA_BUCKET`, không client
key. Project/bucket cần hỗ trợ100MB. Project hiện tại từ chối tạo bucket100MB;
owner02/11 yêu cầu giữ100MB và gate cấu hình mở, không tự giảm SRS/nâng gói trả phí.
Ảnh nhỏ round-trip Supabase QA riêng là evidence khác với hỗ trợ100MB hay release.
Chi tiết [kết quả gói](../features/EXCHANGE_EVIDENCE_2026_11_02.md).
