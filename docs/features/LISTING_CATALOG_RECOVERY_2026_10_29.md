# Phục hồi tìm đầu sách sau OCR — 29/10/2026

Gói sản phẩm owner duyệt sau chẩn đoán AI; nhánh `codex/listing-catalog-recovery`,
base48a3150, commit subject `feat(listings): recover catalog matches after imperfect OCR`.
[Quyết định ADR0055](../adr/0055-listing-catalog-recovery.md). Đây là code API,
shared client, Member web và RN, không chỉ báo cáo điểm yếu model.

## Hành trình đã nối

| Bước | Hành vi |
| --- | --- |
| Đọc ảnh | Giữ luồng upload/Sharp/AI/receipt cũ; không sửa output đã lưu |
| Đối chiếu | Tự đọc danh mục hiện tại từ chữ OCR, không gọi AI thêm |
| Sửa chữ | Sửa tên/tác giả/ISBN/tập trong phần tìm riêng; biểu mẫu vẫn giữ nguyên |
| Tìm lại | Lỗi mạng giữ chữ đã gõ; kết quả cũ bị khóa; có nhãn khi tìm chưa đầy đủ |
| Chọn | Hiển thị metadata/lý do/cảnh báo; xác nhận đúng tập và ấn bản trước áp dụng |
| Đi tiếp | Dùng cùng nháp/ảnh, kiểm tình trạng và giá rồi gửi duyệt theo luồng hiện có |

API mới chỉ dành cho chủ nháp sách đơn còn sửa được, Member ACTIVE/session hiện
tại; Confirmed hoặc Pending của chính người bán. Không sửa ledger/giá/quota hoặc
luật xét duyệt. ISBN xung đột bị loại, số tập xung đột bị loại, thiếu thông tin vẫn
cần người bán đối chiếu. Tìm gần đúng có thể sai; không tự chọn hoặc gắn trust badge.

## Đo khả năng tìm danh mục

Phát lại chữ OCR đã lưu từ24 cover scans, với24 đầu sách active trong corpus local
được mô hình hóa Confirmed. Dùng cùng candidate filters/caps như service, chấm theo
bookKey của **ấn bản**, không chỉ trùng tên tác phẩm.

| Chỉ số | Kết quả |
| --- | --- |
| Baseline: đúng ấn bản có trong tập kết quả matcher cũ | 15/24 |
| Mới: đúng ấn bản đứng đầu | 18/24 |
| Mới: đúng ấn bản trong3 gợi ý đầu | 22/24 |
| Mới: đúng ấn bản trong5 gợi ý đầu | 22/24 |
| Có nhiều ứng viên | 9/24 |

[Evidence từng ca và hash input](evidence/listing-catalog-recovery-2026-10-29.json).
Baseline là set-hit tối đa5, không so thứ hạng cũ vì Mongo chưa định nghĩa sort.
Hai ca chưa phục hồi và các ca nhiều ấn bản vẫn cần sửa từ khóa/ISBN hoặc nhập tay.
Không sửa threshold theo12holdout; bộ đó không được đọc hoặc gọi model trong gói.
Không phát sinh paid AI call. Không tuyên bố OCR tốt hơn, SLA hoặc chất lượng thật
đã nghiệm thu: corpus đã xem, humanReviewed=false, cover-scan khác ảnh điện thoại.

Chạy lại khi có gói incoming đúng hash, từ root:

```sh
pnpm --filter @used-books/api exec tsx eval/autofill-assist/catalog-recovery.ts
```

## Source và contract

- [Service/candidate windows](../../apps/api/src/modules/autofill-assist/catalog-recovery.service.ts),
  [ranking/volume guard](../../apps/api/src/modules/autofill-assist/catalog-ranking.ts).
- [Migration0042](../../apps/api/src/database/mongo/migrations/0042-catalog-recovery-index.ts),
  [derivationV1](../../apps/api/src/common/catalog-recovery-keys.ts),
  [catalog writers/integrity](../../apps/api/src/modules/catalog/catalog.service.ts).
- [Shared transport/copy](../../packages/session-client/src/catalog-recovery.ts),
  [web panel](../../apps/user-web/src/components/PhotoAutofill/CatalogRecovery.tsx),
  [RN panel](../../apps/mobile-react-native/src/features/drafts/catalog-recovery-panel.tsx).
- Contract0.62.0:194operations/30controllers; registry55 migrations, đến0042.
  Endpoint read-only POST dùng AutofillFields; không cần Idempotency-Key.
  ISBN/null metadata không tự biến thành bằng chứng định danh hay human review.

## Kiểm chứng

- API unit277 và1ca chuyển snapshot legacy mới; shared55; web253; RN164 PASS.
  Contract generation/check/routes PASS.
- HTTP/Mongo mới8ca PASS: owner/role/status/revoked session, Pending privacy,
  state đã đổi, validation/ISBN, volume/swapped, không thêm quota/receipt hoặc
  sửa nháp, migration lặp/backfill/version, indexed plan và cửa sổ quá120.
  Hai suite Autofill/catalog-drafts cũ28ca PASS trong lượt hồi quy trước đó.
- Mongo schema27ca PASS: migrate/validators/indexes/checksum/least privilege.
- Typecheck toàn workspace có script (API/Admin/web/RN) PASS; API build, web
  production build và RN web export PASS. Export có cảnh báo process Expo không
  tự thoát; web build cảnh báo bundle size, lint API còn warning cũ ngoài diff.
- Browser Chromium real API/Mongo/Sharp, fake AI/storage: web và RN web chạy
  từ đăng nhập/ảnh đến chọn/giá; web gửi được một PendingReview trên cùng nháp.
  Lỗi mạng tìm danh mục giữ input/khóa kết quả cũ; Enter không submit cha;
  hủy/xác nhận; không thêm model call; giữ lost-ACK key/body cho AI và giá.
  Web320/390/768/1440, RN web320/390 không overflow. Ảnh/log local ở
  `.tmp/listing-ai-journey/`, không commit account/ảnh/raw corpus.
- UI theo Pro Max + Taste + Impeccable, component/token Lật lại; detector5target
  không finding. Không sửa motion theo preference OS.

Các lệnh có ghi/xóa dùng replica set QA57017/rs-test và namespace *_test riêng.
Browser fixture tự dọn namespace. Không seed/import/reset/migrate DB chính.
Live PostgreSQL import, native device/keyboard/Back/large-text, human review,
ảnh điện thoại và Supabase thật NOT_RUN. Không đổi READINESS.

## Trước khi chạy trên DB dùng chung

Dừng API/worker, backup theo runbook của nhóm và chạy `pnpm db:migrate` bằng
migrator để áp dụng0042; không seed đè dữ liệu. Migration thêm projection/index
trên collection đã có, không thêm collection/quyền mới. API từ chối source mới khi
còn migration pending. Gói này chưa áp dụng0042 vào DB chính.

Chỉ commit local; chưa push/PR/remote CI/merge/deploy. Phần GHN/carrier/Driver
không sửa. Bước tiếp theo là review tích hợp và kiểm native/human theo quyền gói;
chỉ mở thử model/holdout khi endpoint ứng viên đã khả dụng, với kế hoạch riêng.
