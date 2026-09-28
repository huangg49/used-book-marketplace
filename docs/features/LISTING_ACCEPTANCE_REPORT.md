# Đối chiếu nghiệm thu listing

27/09/2026 · OpenAPI 0.8.0 · working tree trên `codex/listing-acceptance`.
Đây là bằng chứng của bản làm việc chưa commit, không phải chứng nhận phát hành.

## Kết luận

Luồng listing đã có kiểm thử tích hợp từ tạo nháp tới công khai và quản lý sau duyệt.
**Chưa đóng gate LS-AC01–32**: native picker, khôi phục phiên, bàn phím, Back,
font scale và screen reader chưa được kiểm tra toàn luồng trên thiết bị.
Không suy ra hoàn thành mua/đổi/giao nhận/đấu giá từ kết quả listing.

## Thay đổi trong đợt này

- Sửa giới hạn văn bản RN: kiểm tra số Unicode code point sau trim cho cả lưu nháp
  và gửi duyệt. Bỏ `maxLength` đếm UTF-16 gây cắt emoji; lỗi quá dài xuất hiện tại
  trường và không gửi dữ liệu bị cắt lên API. Kiểm tra cả ảnh trùng và quá 8 ảnh.
- Ảnh riêng của chủ sách tắt cache, bỏ nguồn ảnh khi ở nền, gặp lỗi cấp URL hoặc
  hết hạn; lỗi tải bitmap có nút tải lại, kể cả khi URL mới bằng URL cũ.
- Sửa mở trực tiếp `/book?id=...` trên web: HTML tĩnh và lần hydrate đầu cùng dùng
  trạng thái tải, rồi mới đọc query string. Không thay hợp đồng API hay cơ chế phiên.
- Bổ sung Sharp thật: JPEG có EXIF orientation/vị trí, MIME không khớp bytes,
  PNG hỏng, WebP hai frame và ảnh 40.005.000 pixel. Không chỉ giả lập decoder.
- Bảy ca tranh chấp có barrier PostgreSQL: approve/archive, approve/remove,
  revise/remove theo cả hai thứ tự thắng và hai phiên cùng save. Trigger chỉ tồn
  tại trong schema kiểm thử; xác nhận chuỗi chờ khóa trước khi mở barrier và kiểm
  tra version/revision/decision/audit/receipt/outbox sau commit.

## Bằng chứng chạy

Windows, Node 24.19.0, pnpm 11.19.0; PostgreSQL cục bộ cổng 55432, database có hậu
tố `_test`, schema riêng từng suite; Edge Chromium qua Playwright. Không reset DB
chung, thay credential hay dùng bucket Supabase thật trong các suite này.

| Kiểm tra | Kết quả |
|---|---|
| `pnpm test` | 96 pass: API 18, session 14, RN 51, operations 13 |
| `pnpm test:api:e2e` | 114 pass / 6 files, HTTP/Nest/PostgreSQL thật; storage giả |
| RN browser | Tạo nháp/chọn catalog/chọn file/upload/Sharp/lưu/mở lại/submit; reviewer reject qua API; sửa/resubmit; approve qua API; guest mở trực tiếp detail |
| RN biên/lỗi | 5.001 emoji bị chặn, 5.000 giữ nguyên trong DB; HTML hiện dạng text; lỗi bitmap rồi tải lại; hồi quy shelf/lifecycle và mất phản hồi sau commit |
| Operations browser | Hồi quy catalog/review/quyền/session, gỡ bài, lý do và retry sau mất phản hồi |
| Kiểm tra tĩnh/build | Contract check, lint, typecheck, API/operations build; RN export web/Android/iOS |

Ba ca unit mới về validation đã thất bại trước sửa. Ca browser mở trực tiếp detail
đã bắt React hydration error trước sửa; giữ assertion không có page error trong suite.
Các lỗi 500/503 ở API log là failpoint được chủ động tạo và được assert. Cảnh báo
`pg` về gọi query khi client bận vẫn xuất hiện; chưa đổi dependency trong đợt này.

Mã chạy: [RN browser](../../scripts/test-public-shelf.mjs),
[hành trình đăng sách](../../scripts/test-listing-journey.mjs),
[operations browser](../../apps/admin-web/tests/browser.mjs).
Fixture tạo dữ liệu có nhãn kiểm thử, chạy worker thật, rồi dọn schema/object giả.
Quyết định duyệt trong hành trình RN dùng API; thao tác reviewer UI được kiểm tra
riêng bằng suite operations, không mô tả thành một phiên native–web duy nhất.

## Đối chiếu 32 ca

“Có bằng chứng” chỉ áp dụng đúng lớp ghi trong bảng. Một hàng có nhiều yêu cầu
không được đánh đạt toàn bộ chỉ vì một assertion hoặc một lớp đã qua.

Nguồn: [C = catalog/draft HTTP](../../apps/api/test/catalog-drafts.e2e-spec.ts),
[L = listing/review/lifecycle/public HTTP](../../apps/api/test/listing-review.e2e-spec.ts),
[M = media HTTP](../../apps/api/test/media.e2e-spec.ts),
[S = schema contract](../../apps/api/test/listing-contract.spec.ts),
[I = Sharp](../../apps/api/test/image-processor.spec.ts),
[F = form RN](../../apps/mobile-react-native/src/features/drafts/listing-form.test.ts),
[J = browser journey](../../scripts/test-listing-journey.mjs).

| Ca | Bằng chứng hiện có | Phần chưa thể kết luận |
|---|---|---|
| 01 | C: nháp tồn tại qua restart API, quyền riêng; J: lưu/mở lại | Restart app/SecureStore native |
| 02 | J + L: submit/reject/resubmit/approve, guest detail; browser shelf | Native và provider thật trong cùng hành trình |
| 03 | S/F: biên VND, kiểu, chế độ; J: Both 10.000/1.000.000 | Không chạy mọi tổ hợp giá qua UI native |
| 04 | S/F: Unicode/trim/biên; J: 5.000/5.001 emoji, tiếng Việt, HTML literal trong detail | Biên nhập bằng bàn phím native |
| 05 | S/F/L: thiếu dữ liệu, unreadable, missing essential; J: khai báo trang trắng rời | Native UI |
| 06 | C: normalize/checksum và tranh chấp ISBN; schema DB | Không bổ sung bằng chứng native |
| 07 | L + operations browser: catalog pending chặn approve, confirm rồi review | Native không tham gia thao tác reviewer |
| 08 | C/L: lý do, lịch sử, gửi lại, cấm tự duyệt | Có bằng chứng ở API |
| 09 | S/F/L/M: số lượng, trùng, readiness và owner/listing | Chưa upload đủ 8 ảnh thật từ native |
| 10 | I/M: bytes/MIME/hỏng/animated/pixel/size, Failed và retry hữu hạn | Không phải thử tải nặng production |
| 11 | I: xoay EXIF, bỏ EXIF; browser public hết hạn/lỗi refresh và private bitmap retry | HEIC thiết bị thật; TTL bị provider từ chối cần provider evidence riêng |
| 12 | C/L/M: 401/403/404 và quyền sở hữu; test không đổi dữ liệu | Có bằng chứng ở API |
| 13 | C/L: role độc lập, tự duyệt/tự gỡ bị chặn | Có bằng chứng ở API |
| 14 | C/L: Restricted bị chặn ghi/mở, vẫn đọc/ẩn/archive đúng quyền | Chưa thao tác toàn bộ ma trận trên native |
| 15 | L + operations browser + J: lý do, sửa/resubmit, revision cũ còn | Native UI |
| 16 | L: replacement nguyên tử, ảnh/giá/lịch sử; browser revise giá | Chưa tách từng trường thành một ca replacement riêng |
| 17 | L: dữ liệu sai/stale version/pending không bị sửa | Có bằng chứng ở API |
| 18 | L + RN browser: hide/reopen và điều kiện bị chặn | Native UI |
| 19 | L + hai browser: archive/remove, 404 public, giữ lịch sử, không khôi phục Removed | Native UI |
| 20 | L/S: projection đóng; từng trạng thái không đủ điều kiện bị loại | Không duyệt toàn bộ tích Descartes của các state |
| 21 | L + RN browser: mất eligibility, không cấp URL mới, UI unavailable | Không thu hồi nội dung đã tải; storage giả không chứng minh expiry provider |
| 22 | L + RN browser: tiếng Việt/tác giả/ISBN/filter/sort/cursor/giá null | Có bằng chứng API và web |
| 23 | L: hai reviewer chờ barrier thật, chỉ một decision/audit/outbox | Có bằng chứng DB concurrency |
| 24 | L: bảy barrier mới, cả thứ tự thắng có ý nghĩa; version và hiệu ứng duy nhất | Có bằng chứng DB concurrency |
| 25 | C/L: restrict/thu hồi role/session và stale guard chờ khóa; approval giữ khóa chủ | Có bằng chứng DB concurrency |
| 26 | C/L/M + RN/operations browser: key replay, payload khác, lost acknowledgement | Mất mạng thực trên điện thoại |
| 27 | C/L: failpoint audit/outbox rollback; browser cắt response sau commit | Chưa kill process/DB thực; dispatcher outbox nghiệp vụ chưa triển khai |
| 28 | L: Reserved/Sold/Exchanged/ClosedUnavailable bị chặn ở lệnh lifecycle | State qua test factory, chưa có transaction workflow tạo các state này |
| 29 | M: finalize lặp, orphan/retry/fencing/lease, ảnh đã gắn không bị purge | Suite dùng storage giả; đối chiếu live Supabase riêng |
| 30 | Unit session/command + browser: retry/conflict/validation/leave guard theo phần | Chưa toàn bộ mã lỗi trên native, background và kill app |
| 31 | Catalog UI native có bằng chứng lịch sử trong Android quality report | **Chưa nghiệm thu listing native**: picker, Back, keyboard, TalkBack, font scale |
| 32 | L/J/operations browser: refresh/mở lại lấy trạng thái server | Đóng/mở native app và background |

## Chạy lại và thứ tự tiếp theo

Dùng các lệnh trong [lifecycle report](LISTING_LIFECYCLE_REPORT.md#chạy-lại).
Export RN với `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3009/api/v1` cho fixture.
Hai browser suite chạy tuần tự vì dùng chung cổng 3009/3010; CI đã bao gồm journey
qua `test:public:browser` và lọc đường dẫn script mới. Chưa xác nhận một CI run từ xa.

Preflight chỉ đọc `adb devices -l`: không có thiết bị kết nối. Metro từng bị automatic
approval review chặn ở lượt trước; đợt này không khởi động lại hoặc đi vòng hạn chế.
Không có build/runtime Android mới trong đợt này. APK debug và QA catalog trước đó
ghi riêng tại [Android quality](../ANDROID_QUALITY.md), không thay thế gate listing.

1. Khi môi trường runtime dùng được, chạy listing native theo LS-AC01/11/30/31/32,
   ghi thiết bị/build và kết quả từng thao tác. iOS cần bằng chứng riêng.
2. Trước mua/đổi: thiết kế shared commitment/reservation và kiểm tra invariant
   “một cuốn sách chỉ thuộc một cam kết đang hoạt động” theo ADR 0007 và thiết kế
   local transaction; contract/migration/acceptance trước implementation.
3. Shipping, điểm nhận, ledger và auction vẫn là các lát cắt sau; không đóng gate
   giao dịch bằng báo cáo kiểm thử listing này.
