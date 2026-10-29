# Đường nhanh cho trợ lý đăng sách — 29/10/2026

Owner duyệt ba phần: ISBN trước AI, khoảng giá tham chiếu trước phân tích AI và
chuẩn hóa nguồn độc lập. Nhánh `codex/listing-assist-fast-paths`, base9f93bae;
commit subject `feat(listings): add ISBN and price reference fast paths`.
[ADR0056](../adr/0056-listing-assist-fast-paths.md) ghi quyết định và giới hạn.

## Hành trình và tác dụng

| Vai trò/entry | Điều kiện và tác động | Kết quả/bước tiếp |
| --- | --- | --- |
| Member web: Đăng sách → ảnh → Đọc thông tin | Cùng DraftAttempt, ảnh được xử lý Ready; quét local trước model | Có ISBN/catalog: xác nhận chọn đúng tập/ấn bản, không gọi AI; không khớp thì đọc chữ bằng AI |
| Member RN: Kệ sách → Đăng sách → ảnh để đọc | Cùng listing/ảnh Ready; giữ session, lựa chọn ảnh và input | ISBN/candidate ở ngay phần thông tin; nhiều mã phải chọn, vẫn có nút đọc AI |
| Member: bước giá | Chuẩn bị ảnh/catalog như cũ, lấy rule reference rồi AI | Có khoảng tham chiếu trong lúc AI chờ/lỗi; xác nhận mới thay giá; nguồn/ngày/lý do loại có thể xem |
| Seller chọn mức tham chiếu | Giữ giá thủ công, không tạo suggestionId | AI về sau không thay giá; save không gắn nhầm applied=true, kể cả replay khi refresh |
| Staff/Admin: chi tiết duyệt | Luồng quyết định duyệt hiện hành | Đọc nguồn giá/loại trừ mới; không có quyền hay AI duyệt bài mới |
| Biên tập dữ liệu giá | File curated + dry-run; --apply chỉ theo quyền người vận hành | Mapping tổ chức ổn định; xung đột abort batch, không sửa nguồn gốc đã xác minh |

Màn barcode thu gọn phần sửa từ khóa để đầu sách hiện sớm. Không bịa tên sách,
rating hoặc độ tin cậy. Dữ liệu ISBN/catalog và chữ AI đọc có nhãn riêng; không
ghi đè metadata khi nhận response. Back/lỗi vẫn giữ nháp/ảnh/giá, retry AI giữ key/body.

## Source và API

- [Barcode worker](../../apps/api/src/modules/autofill-assist/isbn-barcode-reader.ts),
  [owner/media/cache/recheck](../../apps/api/src/modules/autofill-assist/isbn-matches.service.ts).
- [Reference read](../../apps/api/src/modules/price-assist/price-assist.service.ts),
  [evidence/dedup](../../apps/api/src/modules/price-assist/evidence.ts),
  [origin union/PSL](../../apps/api/src/modules/price-assist/source-origin.ts).
- [Shared schema/guard/attribution](../../packages/session-client/src/assist-fast-paths.ts),
  [web reference](../../apps/user-web/src/components/PriceReferencePanel.tsx),
  [RN reference](../../apps/mobile-react-native/src/features/drafts/price-reference-panel.tsx).
- [Migration0043](../../apps/api/src/database/mongo/migrations/0043-price-source-origin.ts),
  [importer](../../apps/api/src/price-refs-import.ts). Registry56; không sửa migration cũ.
- Contract0.63/196operations/30controllers. Hai endpoint mới read-only POST,
  no-store; Server-Timing chỉ có stage cố định/duration, không nội dung/ID.
  Reference không được dùng thay PriceSuggestion ID. Legacy source thiếu group
  vẫn đọc được, nhưng không đủ bằng chứng để tăng mức độc lập.

## Kiểm chứng và tái lập

- API286unit, shared59, web253, RN164, Admin219 PASS. Typecheck toàn workspace
  có script; API/web build, RN web export, lint liên quan, contract/check/routes.
  Lint còn cảnh báo cũ ngoài diff; Expo export có cảnh báo process không tự thoát.
- HTTP/Mongo11ca mới: mã thật được decode từ ảnh dựng, không AI/quota/nháp mutation;
  read-only reference/fingerprint/refusal; owner/role/status/photo eligibility;
  nhiều ISBN, decoder lỗi không cache miss; recheck quyền sau storage; giới hạn2
  scan cạnh tranh bằng barrier; Mongo validator origin; CLI dry-run/apply/replay/
  mapping giữ facts và atomic rollback khi xung đột. Storage giả, decoder thật.
- Hồi quy HTTP Autofill/Price/catalog28ca PASS. Mongo schema27ca PASS gồm
  migrate/checksum/validators/index/least privilege. Không mở lại gate độc lập.
  Sau sửa fingerprint nguồn, chạy lại HTTP mới11 + Price12ca PASS; unit kiểm
  URL đổi làm gộp tổ chức phải đổi fingerprint, không dùng căn cứ cache cũ.
- Browser Chromium: real API/Mongo/Sharp/ZXing worker; AI/storage fake, barcode và
  giá tổng hợp. Web/RNweb đọc ISBN không thêm model/quota; chọn/hủy/đọc AI tùy chọn;
  mất ACK giữ key/body. Khi giữ response AI chờ, người bán vẫn xác nhận giá tham
  chiếu; AI về không ghi đè. Web gửi đúng một PendingReview và lưu giá tham chiếu
  như thủ công (`outcome.applied=false`). Có các ca input đổi, nguồn mất và AI lỗi.
- UI theo Pro Max/Taste/Impeccable, token/component Lật lại; detector8target không
  finding. Xem browser ở web320/390/768/1440 và RNweb320/390, không overflow.
  Không đổi motion theo preference OS. Ảnh/log local: `.tmp/listing-ai-journey/`.
  Runner xóa result cũ trước chạy để lượt ngắt/lỗi không để lại PASS cũ.

[Evidence đã lọc](evidence/listing-assist-fast-paths-2026-10-29.json) lưu checkpoint
và Server-Timing: ISBN76,8–80,4ms (2mẫu), reference11,9–16,4ms (6mẫu) trong lượt
Chromium local cuối. Đây chỉ là stage server trên ảnh/giá tổng hợp, storage giả;
không gồm upload/network/render, không là tốc độ provider thật hoặc SLA. Giá trị
chính được kiểm là nhánh ISBN khớp không gọi model và reference có trước phản hồi AI.

Chạy từ root với MONGO_TEST_URL trỏ replica QA57017/rs-test, database *_test:

```sh
pnpm --filter @used-books/api build
pnpm --filter @used-books/api exec vitest run --config vitest.config.e2e.ts test/assist-fast-paths.e2e-spec.ts
```

Browser cần RN web export hiện tại trỏ API QA3009/api/v1. Đặt
`LISTING_AI_FAST_PATHS=1`, chạy `node scripts/test-listing-ai-journey.mjs`.
Không đặt đồng thời với LISTING_AI_CORPUS_RESULT. Mỗi runner tạo/dọn DB riêng;
không dùng DB/bucket chính. Bộ EAN synthetic không chạm24scan/12holdout đã chốt.

## Giới hạn và bước tích hợp

Không gọi provider thật hoặc dùng API key trong gói. Không khẳng định tăng độ đúng
OCR/định giá thị trường; không thay model/prompt/timeout. Đây là giảm nhu cầu gọi
model và thời gian đợi để có một thông tin hữu ích, trong trường hợp đủ dữ liệu.
Barcode có thể bỏ sót ảnh khó; hệ thống vẫn cho đọc AI/nhập tay. Domain và group
chứng minh liên hệ nguồn, không chứng minh bản thân giá đó đúng hoặc đầy đủ thị trường.

Native thiết bị, ảnh điện thoại thật, Supabase thật và human acceptance NOT_RUN trong
gói; không suy browser thành native PASS. Chủ dự án cho biết tính năng gốc đã được
người làm thử ổn; các ca trên kiểm thay đổi và hồi quy, không thay biên bản nghiệm thu.
READINESS giữ nguyên.

Trước bật source mới: dừng API/worker, migrate0043 bằng migrator và cập nhật các
client/enum cùng gói; không seed/reset. Import mới cần sourceUrl HTTPS có domain,
hoặc sourceGroup tổ chức đã xác minh nếu nguồn không có website. File cũ không
được tự gán mỗi nhãn một tổ chức; xem [ADR0056](../adr/0056-listing-assist-fast-paths.md).
DB chính chưa migrate/import; GHN/carrier/Driver/env giữ nguyên. Chỉ commit local,
chưa push/PR/CI remote/merge/deploy; review người thật theo TEAMWORK khi tích hợp.
