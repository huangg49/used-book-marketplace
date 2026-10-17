# Ba khu vực luân chuyển sách — 17/10/2026

Nhánh `codex/book-circulation-regions`, base `a68f016`. Yêu cầu chủ dự án đổi
selector thành TP.HCM, Bình Dương, Vũng Tàu như các khu luân chuyển sách.
[ADR0039](../../../docs/adr/0039-book-circulation-regions.md) ghi phạm vi và tương thích.

- API directory lấy ba nhãn từ Mongo: DEMO-A/TP.HCM, DEMO-B/Bình Dương,
  DEMO-C/Vũng Tàu. Migration0030 mới, cập nhật reference data trong transaction;
  giữ mã area/locality cũ và các địa chỉ/listing/đơn đang tham chiếu.
- Member web dùng nhãn “Khu vực luân chuyển sách”, chọn địa chỉ gửi/nhận theo
  directory. Bỏ mô tả giới hạn TP.HCM ở các form mua/bán nhận dữ liệu này.
- Không thêm điểm ViaPoint, geocoding, phí theo khoảng cách hoặc carrier thật.
  Envelope HCM-DEMO-v1/name TP.HCM còn để client cũ đọc được; ba tên trong dropdown
  là khu vận hành do dự án quy ước. READINESS giữ nguyên.

## Verification

Node24.21.0, pnpm11.19.0. Local:

- PASS contract generate/check,165operations/26controllers; OpenAPI0.43.1,
  generated types cùng YAML. API lint/typecheck/build/150unit; web lint/build/
  typecheck/135unit. Warning cũ API11/web4 và web bundle lớn còn.
- PASS17 address HTTP/Mongo tests: directory đúng ba nhãn, save/replay từng khu,
  quyền/owner/version/quota/default/race và rollback hiện có.
- Mongo48PASS/4SKIP (import PostgreSQL và failover thiếu cấu hình, không tính PASS).
  Upgrade từ schema cũ giữ nguyên một address DEMO-B, ID/checksum lịch sử, đúng
  ba reference rows, chạy lại không trùng; app role không được ghi reference data.
- PASS3 browser suites: đăng bán hiển thị đúng ba option và lưu nơi gửi Vũng Tàu;
  Mua ngay có nơi gửi Bình Dương/nhận Vũng Tàu, quote30000đ và tổng155000đ như policy
  hiện hành; thương lượng vẫn save/quote/create/pay đúng key/body sau lost ACK.
  Popup lỗi/keyboard/draft/upload/polling cũ tiếp tục đạt.

[Desktop](origin-popup-desktop.png) và [mobile](origin-popup-mobile.png): Chromium
1440×900/390×844, font130%, form chọn Vũng Tàu. Ảnh/tên/địa chỉ/số điện thoại là
QA fixture; API/Mongo thật ở replica QA riêng, storage/ví/carrier mô phỏng.
Nội dung dài cuộn trong popup. Không tạo raster sản phẩm hoặc copy ảnh người dùng.

## Local rollout

Đã kiểm tra DB local chỉ pending0030, áp dụng đúng migration này qua migrator hiện
có. Không reset/reseed hoặc sửa address/order/ledger. Directory local đúng ba dòng,
pending migrations rỗng; API watcher được reload và readiness HTTP200.

Native copy/acceptance, live Supabase/carrier, human review và remote CI NOT RUN.
Không push/PR/merge/deploy. QA khác dữ liệu app local; cleanup chỉ nhắm database
test và process Mongo QA do phiên này bật.
