# Đồng bộ main vào local — 03/11/2026

## Source và bảo toàn

Owner giao kiểm tra main, đồng bộ và giải quyết conflict. Main đã fetch tới
`997d480873905d877721af455a28ef49fb8ee625`. Hai commit mới trong lúc kiểm tra
là90fc1491 và997d4808, đổi giao diện khiếu nại thành panel trượt.

Nhánh tích hợp `codex/sync-main-20261103` giữ các commit của nhánh
`codex/demo-background-catalog`, main và checkpoint local
`7f14d34deae5d91aff28638d3bfa50a80b216ae8` (131file tracked/untracked của checkout
ứng dụng). Có bundle Git, bản sao binary/untracked và cấu hình riêng ngoài Git;
đã đối chiếu SHA256. Không dùng reset/clean/stash/force checkout. Nhánh `codex/local-checkpoint-20261103` giữ checkpoint trước kích hoạt.
Checkout ứng dụng đã chuyển sang `codex/local-main-synced-20261103`.

## Cách xử lý khác biệt

- Giữ UI local, draft edit/submit, avatar, review demo skip và cấu trúc menu local;
  bổ sung lại Hỗ trợ/Hậu kiểm AI/SupportLink từ main. Cache thông báo theo user.
- Giữ AutoReviewView/history/filter và API support/evidence mới của main.
- Panel khiếu nại giữ thiết kế mới, dùng native dialog cho focus/Escape/restore,
  một body scroll, không cuộn nền. [Bằng chứng riêng](../../apps/admin-web/src/features/operations/exchange-evidence-review.tsx)
  chỉ hiển thị tệp Ready từ API sau nhận phân công và signed read có audit.
  Có preview image/video, tải tệp và fallback; URL hết hạn bị gỡ. Không lấy URL
  từ lý do, localStorage, iframe/cross-origin message hoặc thay bằng ảnh mẫu.
- Giữ UI hồ sơ uy tín local nhưng không công bố nhãn tín nhiệm/xác thực không có
  dữ liệu chứng minh;0vi phạm xác minh không đồng nghĩa0khiếu nại.

## Hai lỗi xác nhận trong kiểm tra nâng cấp

1. [0052 AI v2](../../apps/api/src/database/mongo/migrations/0052-listing-auto-review-v2.ts)
   backfill trường mới trước mở rộng validator v1 (additionalProperties:false).
   Bản sao DB chính tái hiện Mongo121. Thêm
   [0056 bridge](../../apps/api/src/database/mongo/migrations/0056-auto-review-v2-upgrade-bridge.ts)
   trước0052: validator chuyển tiếp → backfill metadata trống → validator v2 strict.
   Giữ verdict/model/reasons và checksum cũ; migration cũ không bị chỉnh sửa.
2. currentCollections trước sửa chồng agreement/negotiated/payer, giữ cả luật
   payer cũ. Khác schema thực do migration0055 áp dụng;3ca upgrade đã phát hiện.
   Registry nay dùng đúng exchangeFlexibleDiffSpecs cuối. Không đổi luật nghiệp vụ
   của0055, không chạy migration chỉnh tiền hoặc viết lại agreement.

## Kiểm chứng local

Bằng chứng áp dụng cho nhánh tích hợp và merge997d4808; không là remote CI của
commit local. Artifacts private ignored ở`.tmp/main-sync-20261103/`.

| Kiểm tra | Kết quả/phạm vi |
| --- | --- |
| API/Member web/Admin/RN typecheck | PASS |
| API/Member web/Admin build | PASS; cảnh báo bundle/Tailwind hiện hữu |
| Member/Admin/session unit | PASS315/229/150 |
| API E2E | PASS133: wallet, reviews, exchanges, support, evidence; rs-test riêng, local/fake providers |
| Mongo upgrade | PASS7: free-shipping, support/AI union, agreement, populated AI v1 regression |
| Contract/routes/motion | PASS; OpenAPI0.73,245operations/38controllers;3web surfaces |
| Profile reputation browser | PASS HTTP fixtures, desktop/mobile/text130%, cache/identity/dirty guard |
| Evidence browser | API/Mongo QA thật; storage fake; Member upload/retry và assigned Staff signed image/audit; native NOT RUN |
| Main DB clone upgrade | PASS9pending migrations,5209bản ghi giữ nguyên; ledger/giao dịch giữ nguyên; không bản ghi mới sai validator |

DB clone có validator/index và migration ledger của DB thực. Collection
sale_quote_policy_selection đổi policy cho quote mới; các dòng AI v1 chỉ thêm
metadata mặc định null/0/[] (không bịa kết quả hoặc human review). Mọi trường cũ
được đối chiếu hash; migration rows/checksum giữ nguyên. Legacy ID
0052-exchange-agreement được kiểm checksum với registry đang chạy và giữ lại.
Không đổi/xóa ID cũ để ép trùng0053.

## Kích hoạt đã được owner duyệt và hoàn tất

Đã áp dụng9migration trên DB local chính theo thứ tự registry:

1. 0050-support-cases
2. 0051-support-auto-review-union
3. 0056-auto-review-v2-upgrade-bridge
4. 0052-listing-auto-review-v2
5. 0053-exchange-agreement
6. 0054-exchange-evidence
7. 0052-free-shipping
8. 0054-exchange-negotiated-diff
9. 0055-exchange-negotiated-diff-payer

Owner đã xác nhận “Cho phép nâng DB và kích hoạt bản mới”. Đã dừng đúng cây
process API/worker/Member/Admin, chụp backup private nhất quán mới và kiểm đọc lại;
áp dụng migration bằng migrator, cập nhật privileges của role app bằng admin local.
Không gọi bootstrap đổi mật khẩu/user. Đối chiếu5209bản ghi cũ nguyên vẹn,2review
AI cũ chỉ thêm metadata null/0/[]; không có pending/checksum mismatch. Legacy0052
agreement giữ nguyên. Ledger cân bằng; đơn cũ vẫn Preparing, User2 còn850000khả
dụng/150000held, User1/User3 có1000000khả dụng.5file env giữ nguyên hash.

Checkout ứng dụng đã chuyển an toàn sang nhánh local cùng source tích hợp; build
API tại chính checkout này PASS và khởi động lại launcher API/worker3000,
Member5174/Admin5173. Health ready200; kiểm đăng nhập,profile,wallet,reviews của
User1/2/3 PASS, các phiên kiểm thử được logout riêng. Không đổi mật khẩu tài khoản.
Public API401bài,400nền đầy đủ và bài thật đầu;9trang không trùng;100Manga,
100LightNovel,Naruto10,kết quả rỗng0 và các filter mode/price/condition/facet đúng.
12ảnh signed đọc thật thành công. Không ghi listing hoặc ví qua lượt kiểm này.
QA57017 đã dừng; Mongo chính27017 và3app giữ chạy. Backup/config/private evidence
nằm ngoài Git hoặc ignored, không có secret/dump/token trong commit.

## CI remote và giới hạn

CI trên đúng SHA997d4808: [Docs PASS](https://github.com/huangg49/used-book-marketplace/actions/runs/41504071247),
[Admin PASS](https://github.com/huangg49/used-book-marketplace/actions/runs/41504069180),
[Operations FAIL](https://github.com/huangg49/used-book-marketplace/actions/runs/41504068896).
Job Operations qua API build,Admin lint/typecheck/tests/build,browser/exchange-safety/
auto-review,Expo web export và public shelf; thất bại ở`pnpm test:rn-buy-now:browser`.
Các bước member-profile/account-controls/cart/support sau đó bị skip. Annotations
chỉ có exit1, chưa có log/assertion cụ thể; không kết luận nguyên nhân hoặc quy cho
merge local. Không sửa test để bỏ qua. Bản tích hợp local chưa push và chưa có CI
remote riêng; native Android,live evidence video storage và human acceptance NOT RUN.

Chính sách free shipping từ main chỉ tác động quote/order mới. Đơn Preparing
cũ có hold150000VND không được tính lại hoặc hoàn tiền khi đồng bộ source.
READINESS giữ nguyên; không nhận native/live storage/human acceptance từ QA fake.
