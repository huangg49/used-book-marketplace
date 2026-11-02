# Bằng chứng sự cố Exchange — 02/11/2026

Owner duyệt gói nối Member RN/web → API/Mongo → Staff/Admin sau PR89. Base main
`dd7304de5c7cf96e2d7faf51e42fbe73dcac0628`, branch `codex/exchange-dispute-evidence`.
Thiết kế [ADR0066](../adr/0066-exchange-private-evidence.md); contract0.73/242operations.

## Hành vi và nguồn

| Vai trò | Entry/điều kiện | Thao tác/kết quả | Bước tiếp/phục hồi |
| --- | --- | --- | --- |
| Member web | Chat → phiếu Exchange → Báo sự cố; giữ rule trạng thái/hạn hiện có | Gửi mô tả đúng key/revision, không yêu cầu mẫu hoặc video; hồ sơ ResolutionPending | Mục Bằng chứng sự cố: chọn tệp → Pending → kiểm bytes/storage/commit → Ready. Upload lỗi vẫn giữ claim |
| Member RN | Trao đổi của tôi → phiếu → Báo sự cố | Cùng API; DocumentPicker lấy ảnh/PDF/MP4 thật, không dùng URI/tên thay bytes | Busy/error/retry; Back giữ exact intent ở RAM, đổi tài khoản xóa. Pending sau reload chọn lại đúng tệp gốc |
| Staff/Admin độc lập | Khiếu nại trao đổi → đúng hồ sơ | Nhập lý do → nhận phụ trách/version → xem Ready → cấp link original có audit | Link attachment120s; retry quyền/danh sách riêng. Admin nhận lại có lý do; người cũ mất quyền lần đọc tiếp |

Source: [service](../../apps/api/src/modules/exchanges/exchange-evidence.service.ts),
[validator](../../apps/api/src/modules/exchanges/evidence-validation.ts),
[migration0054](../../apps/api/src/database/mongo/migrations/0054-exchange-evidence.ts),
[shared intent](../../packages/session-client/src/exchange-evidence.ts),
[web](../../apps/user-web/src/components/exchange/ExchangeEvidencePanel.tsx),
[RN](../../apps/mobile-react-native/src/features/exchanges/exchange-evidence-card.tsx),
[operations](../../apps/admin-web/src/features/operations/exchange-evidence-review.tsx).

Form cũ đã bỏ nút nạp mẫu, IndexedDB cất preview, tự điền tên mẫu và yêu cầu clip3–4s.
Bản mô tả cũ giữ nguyên lịch sử; không coi tên ảnh/video trong đó là upload được xác
minh. Chưa có engine phân xử/return/settlement mới; upload không chứng minh custody.

## Môi trường và evidence

Windows, Node24.22.1/pnpm11.19.0. QA rs-test127.0.0.1:57017, chỉ *_test;
không migration/seed/reset DB chính27017. Provider AI/mail/GHN không được gọi.
Báo cáo cuối ghi kết quả kiểm thực chạy; không suy export là native PASS.

- API E2E mới kiểm current auth/owner/replay, hash/bytes/MIME, Pending/Ready,
  quota/stale/closed, thu hồi phiên trong I/O và race phân công. Ledger/Exchange
  revision không đổi khi thêm bằng chứng; đây không thay nghiệm thu hold có tiền.
- Shared intent kiểm lost create/upload ACK, immutable bytes/key/body, identity đổi,
  lỗi validation sửa được và Pending durable resume sau restart.
- Validator chạy PDF tĩnh thật, PDF chứa JS và MP4 thật/truncated/disguised. Tệp demo
  cũ `sample-unboxing.mp4` thực là WebM; không dùng làm ca MP4 hợp lệ.
- [Browser runner](../../scripts/test-exchange-evidence.mjs): HTTP/Mongo thật,
  storage fake/synthetic images; create proposal thực rồi đặt trạng thái InTransit
  bằng fixture riêng để thử báo sự cố. Không là bằng chứng pickup/funding/delivery
  thực. Web lostACK+Back+exact retry, một original, member download, staff assignment/
  audit; RN Expo web DocumentPicker gửi bytes thành công. Desktop1440/mobile320px
  với chữ130%; ảnh ở `.tmp/exchange-evidence/`.
- Live Supabase: bucket QA private riêng giới hạn20MB, ảnh nhỏ đi qua API tới Ready,
  tải lại đúng SHA256 original, Content-Disposition attachment, public URL bị từ
  chối. Đã xóa đúng object/bucket do lượt này tạo; không đổi bucket chính. Không
  biến kết quả ảnh nhỏ thành PASS PDF20MB/video100MB hoặc retention/khả năng tải lớn.

| Kiểm tra local trên gói này | Kết quả và giới hạn |
| --- | --- |
| Contract generate/check/routes | PASS0.73.0, 242operations/38controllers |
| Types API/shared/web/RN/Admin; build API/web/Admin | PASS; web còn cảnh báo bundle lớn có sẵn |
| Unit shared/web/RN/Admin | PASS150/308/223/228 |
| API unit | Lượt full384PASS/1FAIL do Windows shutdown child timeout khi build native đồng thời; chạy lại riêng ca đó PASS1. Không ghi full385PASS một lượt |
| Mongo schema/account-upgrade/support-union | PASS32; checksum migration lịch sử giữ nguyên |
| E2E Exchange/packaging/evidence | PASS88 trong lượt hồi quy; sau bổ sung storage503/parallel upload, riêng evidence PASS6. HTTP/Mongo thật, storage fake |
| Validator PDF/MP4 | PASS2: PDF tĩnh/JS; MP4 thật/truncated/disguised |
| Browser web → Staff và RN Expo web | PASS toàn runner, kể cả lượt dùng URL QA `/admin` đúng CI (fixture tạo DB ngẫu nhiên `*_test`); storage fake và trạng thái vận chuyển fixture như mô tả trên |
| Lint | Không lỗi; RN0warning, component mới không warning. API/web/Admin còn warning cũ |
| Expo web export | PASS32routes; không là native PASS |
| Android debug x86_64 | FAIL build tại Worklets CMake/Prefab: không khởi chạy được prefab_command.bat (CreateProcess error2). Đã thử JDK21 và đường dẫn ngắn; native functional BLOCKED, chưa có APK/device PASS |
| Supabase thật | PASS ảnh nhỏ/private/attachment/hash/public-denied và cleanup; video100MB BLOCKED cấu hình |

Log/ảnh local giữ ở `.tmp/integration/evidence-*` và `.tmp/exchange-evidence/`,
không đưa raw request, secret hoặc tệp người dùng vào Git. Chưa có remote CI của
gói mới. Main nền `dd7304de` sau PR89 có10jobPASS/OperationsFAIL: bài
`test:rn-buy-now:browser` timeout chờ nút “Xác nhận đặt mua” ở helper openBook,
gọi từ dòng687. [Log đúng SHA](https://github.com/huangg49/used-book-marketplace/actions/runs/41406972829/job/125151105877).
Chưa tái hiện/xác định nguyên nhân trong gói evidence; không coi main xanh hay
khẳng định đó là lỗi sản phẩm hoặc chỉ là flaky test.

## Gate còn mở

- **BLOCKED cấu hình video100MB:** project Supabase từ chối bucket100MB với lỗi
  giới hạn kích thước. Owner giữ SRS100MB, để gate cấu hình mở; không nâng gói hay
  đổi giới hạn tự động. [Giới hạn nhà cung cấp](https://supabase.com/docs/guides/storage/uploads/file-limits).
- Native: có dependency DocumentPicker mới, cần native build/device QA; Expo web
  không thay cho Android/iOS/ARM/TalkBack hoặc nghiệm thu người thật.
- Không deploy, không bật backend trên DB chính chưa migrate, không mở phán quyết,
  hoàn tiền hoặc GHN. Không có quyền push/PR/merge cho gói mới chỉ từ PR89 trước đó.
- Retention giữ nguyên original/pending và quota; cleanup có chính sách sau đóng
  chưa triển khai. Mỗi participant tối đa10intent bao gồm Pending; lỗi định dạng vẫn
  giữ intent durable để không xóa dấu vết/đánh giá sai trạng thái upload bất định.
