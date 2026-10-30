# Trợ lý đăng sách xuyên web và React Native — 29/10/2026

Nhánh `codex/listing-ai-journey`, base04a9361 (đã nhập origin/mainaed674f).
Commit subject `feat(listings): connect AI assistance across web and native`.
Owner yêu cầu hoàn thiện AI hiện có; [ADR0054](../adr/0054-cross-client-listing-ai.md)
ghi quyết định, không thay SRS/READINESS hoặc mở nghiệp vụ fulfillment. GHN/carrier/
Driver không đổi; không dùng Mongo chính. Flutter vẫn scaffold, không thuộc gói này.

## Hành trình đã nối

| App | Entry → hành động → kết quả → bước tiếp |
| --- | --- |
| Member RN | Tài khoản → Kệ sách của tôi → Đăng sách → thêm ảnh → đọc ảnh Ready → chọn đầu sách hoặc Dùng từng trường → ảnh cùng nháp ở bước sau → khai tình trạng → gợi ý giá → tự chọn giá/lưu nháp/gửi duyệt theo luồng có sẵn |
| Member web | Đăng sách → tự nhập/đọc ảnh → xác nhận trước thay trường → dùng ảnh đầu làm bìa qua crop bình thường → chọn catalog → tình trạng → gợi ý giá có nguồn → xác nhận thay giá → kiểm tra → gửi duyệt một bài đăng |
| Staff/Admin | Luồng duyệt danh mục/bài đăng hiện có; không có quyền xem khóa AI hoặc bỏ bước duyệt nhờ kết quả AI |

RN khi có catalog khớp ưu tiên nút chọn; thông tin đọc từng trường thu gọn để
tránh đẩy bước tiếp quá xa. Web giải thích trước việc tạo yêu cầu danh mục từ
metadata tự nhập khi bấm xác nhận đầu sách và xem giá. AI không tự điền, tự
đổi giá, tự tạo danh mục khi trả lời hoặc tự gửi duyệt. Người dùng luôn nhập tay được.

`packages/session-client/src/listing-assist.ts` dùng chung schema/state/intent.
Mất phản hồi giữ key/body; lỗi đã lưu terminal có mã AI_ASSIST_FAILED mới cho
phép một lần bấm lại tạo intent mới. Auth hiện tại trước replay, đổi tài khoản
bỏ kết quả cũ. Form và ảnh vẫn giữ khi lỗi. Sửa input/hết hạn bỏ khả năng áp dụng
gợi ý giá cũ. Quyết định giá chỉ lưu nếu đúng suggestion/input hiện tại.

Contract0.61.0/193operations/30controllers: mã lỗi nói trên và Server-Timing
cho hai endpoint; không thêm endpoint hoặc migration, registry54. Timing chỉ có
stage/duration, không nội dung sách/ảnh/secret; `complete` bao các stage con,
không cộng tất cả duration. Replay không gọi model.

## Bằng chứng thực chạy

| Kiểm | Kết quả/phạm vi |
| --- | --- |
| Shared unit | 52PASS: replay network/502/503/429, coalescing, terminal failure, actor đổi, giữ intent khi quay lại input cũ |
| Web/RN/Admin unit | 253/164/219PASS; typecheck cả ba PASS. RN là unit TypeScript, không chứng minh native |
| API unit | 243PASS gồm model/rule/timing/error-filter/eval và test carrier mock sẵn có; không gọi GHN thật |
| HTTP/Mongo AI | 20PASS, hai suite autofill/price; owner/role/state/photo/input, quota/race/replay, failed replay không gọi lại provider; AI/images fake |
| Build/lint/contract | API typecheck/build, web/Admin build, RN web export, lint liên quan và contract/routes PASS; lint còn warning cũ Exchange/Driver/search/unused ngoài diff |
| Browser listing-ai | [Kết quả](../ui/listing-ai-2026-10-29/journey.json): real API/Mongo/Sharp, fake AI/storage. Web mất ACK ảnh/giá giữ key/body, một call; xác nhận thay trường/giá, đổi tình trạng làm stale; một PendingReview listing và applied40000. RN web từ entry, ảnh thật qua upload/Sharp; mất503 phải replay trước khi tạo intent mới; mất ACK giá không đổi giá125000 đã gõ |
| Operations hồi quy | Browser Staff/Admin PASS sau đổi fixture/shared package: catalog/listing decisions, private media, lost ACK, version conflict, permission/session và responsive large text; storage fake |
| UI | Chromium desktop1440/tablet768/mobile390/320, không overflow trang; ảnh cuối dưới đây. Detector một lượt7target, một advisory mới: font22px ngoài ramp trong PriceAssistPanel CSS. Không có finding mức lỗi; chưa kiểm large-font/native/TalkBack riêng cho diff |
| Journey runner | Thêm suite thứ10 `listing-ai`, unit runner4PASS. Lượt cuối chỉ chọn listing-ai: PASS suite này, tổng PARTIAL/9NOT_RUN, không suy là toàn sản phẩm PASS |
| Native/human/live storage | NOT_RUN/BLOCKED; Metro startup bị automatic approval review từ chối với lý do “blocked by policy”. Emulator QA đã dừng, không cài APK từ gói này |

Ảnh xác nhận cuối: [web desktop](../ui/listing-ai-2026-10-29/web-price-1440.png),
[web320](../ui/listing-ai-2026-10-29/web-price-320.png),
[RN web đọc ảnh320](../ui/listing-ai-2026-10-29/rn-photo-320.png),
[RN web giá320](../ui/listing-ai-2026-10-29/rn-price-320.png).
Mọi tên sách/giá trong ảnh đều là fixture tổng hợp, không là dữ liệu thị trường.
Text nguồn desktop ở lượt đầu chụp giữa animation; lượt cuối đợi motion chạy
xong đọc rõ, không sửa/tắt motion. Dừng sau hai vòng visual theo workflow UI.

## NVIDIA thật: đo giới hạn, chưa phải chất lượng sách thật

[JSON đã rà soát](../ui/listing-ai-2026-10-29/live-benchmark.json), chạy29/10
trên sourcebase04a9361 + working changes,5lượt mới mỗi tính năng,10call NVIDIA.
Ảnh in chữ QA Book và nguồn giá QA tổng hợp; storage fake, HTTP/Mongo/Sharp thật.

| Chỉ số HTTP tươi, không trộn cache | Đọc ảnh | Gợi ý giá |
| --- | ---: | ---: |
| HTTP200 | 5/5 | 5/5 |
| Trung vị | 1.126ms | 5.146ms |
| p95 trong mẫu nhỏ này | 10.971ms | 9.801ms |

Với n=5, p95 là mẫu chậm nhất; không đủ suy SLA. Stage model chiếm phần lớn thời
gian. Replay giá riêng9ms/cache, không gọi model lần hai; không đưa vào trung vị.
Chi phí **ước tính**0,011268USD theo counter/rate cấu hình, không là hóa đơn NVIDIA.
Chưa đạt bằng chứng “mọi lượt dưới8giây”; trạng thái xử lý/nhập tay là đường
phục hồi thực tế. Không tự thêm Qdrant/streaming/fallback trả giá thiếu nguồn.

Nhóm xác nhận chưa có bộ ảnh và đáp án thật. Quality gate ADR0048 **NOT_RUN**:
không thay bằng ảnh scan hay20ảnh của cùng một cuốn. [Hướng dẫn/template eval](../../apps/api/eval/autofill-assist/README.md)
đã chuẩn bị; cần20–30cuốn, người đọc đáp án, ISBN rõ có/không. Không tự đóng
READINESS hoặc đánh dấu “AI chính xác” từ test fake/benchmark này.

## Chạy lại và bàn giao

Theo START_HERE, đặt MONGO_TEST_URL của replica set QA localhost57017/rs-test,
database *_test trong terminal; không dùng URL DB chính. Sau đó:

```sh
pnpm infra:mongo:test:up
pnpm --filter @used-books/api build
# Terminal QA only; không sửa .env RN:
# EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3009/api/v1
# EXPO_PUBLIC_DESIGN_PREVIEW=1 nếu chạy cả catalog /ui
pnpm --filter @used-books/mobile-react-native export:web
pnpm test:journey-gate --only=listing-ai
pnpm benchmark:listing-ai --samples=1
# Chỉ khi được phép gọi provider, đọc key từ .env API ignored:
pnpm benchmark:listing-ai --live --samples=5
pnpm infra:mongo:test:stop
```

Benchmark tối đa10call mới/lượt; ngân sách QA dự toán0,10USD là kiểm token, không
là trần phí cứng. Hai model dùng cờ/hạn mức/ngân sách hiện có, key chỉ ở API.
Không commit/in env. Không reset/seed/migrate DB chính. Browser fixture tự dọn DB,
user/role riêng. API E2E dùng namespace QA theo START_HERE, cần dọn sau chạy.

Chỉ commit local; chưa push/PR/merge/deploy, remote CI không được thay bằng checks
local. Bước tiếp: người giữ web/RN/API review contract/error semantics, nghiệm thu
native khi Metro chạy được và bộ ảnh thật khi có. Không mở gate delivery/settlement.

Cuối phiên: dọn namespace/user/role E2E, còn0database QA; replica set QA đã dừng,
listener3009/3010/5184/8087/8081 không còn. Mongo chính vẫn Exited, không thao tác dữ liệu.
