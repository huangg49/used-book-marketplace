# Đồng bộ main vào local — 03/11/2026

## Tích hợp PR94 vào worktree

Lượt đồng bộ tiếp theo theo yêu cầu owner: main
`93289df5993b5d856d6529e03b24343d32d10335`,
[PR94](https://github.com/huangg49/used-book-marketplace/pull/94), vào nhánh
`codex/sync-main-20261103-auctions` từ local3558422f. Giữ 5 commit local về
review sau nhận sách, tiêu chí đổi, scroll chat, điểm vào review và dữ liệu demo.
Chỉ một conflict import trong AuctionDetailPage; giữ cả ReviewEntry và
formatDuration, không chọn đè toàn bộ file. YAML/generated contract tự merge
và được kiểm khớp; version0.74 giữ các bổ sung review local.

Kiểm tra trên bản tích hợp (Node24.22.1, pnpm11.19.0):

- PASS build API/Member/Admin; typecheck API/RN; unit API419, Member319,
  Admin229, RN224; lint API/Member/Admin exit0 nhưng còn warning.
- PASS contract246operations/38controllers và generated schema.
- Mongo QA:61 PASS/6 SKIP; không có PostgreSQL import/failover evidence mới.
- E2E đấu giá/ví/review:138 PASS/1 FAIL trong bước tạo fixture do
  CommitOutcomeUnknownError. Mongo transaction probe bật failCommand trên cùng
  mongod trong lượt chạy đồng thời; chạy riêng ca leader Buy Now sau khi probe
  kết thúc PASS1/78 SKIP. Không sửa source/test để vượt lỗi. Các suite có server
  failpoint phải chạy tuần tự, DB riêng không cô lập được failpoint.
- PASS browser HTTP fixture điểm vào review Exchange sau receipt cho cả hai vai,
  server refusal/retry/deep link; scroll chat1440→320px, chữ130%, màn thấp,
  composer/draft/Back. Không ghi review thật, không là native/human nghiệm thu.
- PASS nâng bản sao nhất quán của DB hiện tại trên rs-test, tên `_test`:6migration
  mới, rerun idempotent, checksum migration đang có trong registry không đổi,
  dòng lịch sử0052-exchange-agreement giữ nguyên. Giữ5.818bản ghi cũ; chỉ counter
  sequence tăng1 và thêm journal CapitalIncrease cùng2entry cân bằng. Tất cả
  ledger entry cũ giữ nguyên, không có bản ghi vi phạm validator sau nâng.
  Primary chỉ đọc; bản sao QA đã xóa, container QA đã dừng.

CI remote trên đúng SHA main chưa xanh: [API Mongo](https://github.com/huangg49/used-book-marketplace/actions/runs/41532185328/job/125574931927),
[User Web order-chat browser](https://github.com/huangg49/used-book-marketplace/actions/runs/41532185352/job/125574932250)
và [Operations Admin browser](https://github.com/huangg49/used-book-marketplace/actions/runs/41532185275/job/125574931733)
FAIL. Năm workflow còn lại success; điều này không chứng minh native hoặc Flutter
đủ tính năng. Chưa chẩn đoán/sửa ba lỗi CI trong phạm vi lấy code.

**Trạng thái lúc tích hợp ban đầu: chưa kích hoạt trên ứng dụng demo.** Checkout ứng dụng giữ3558422f để không
hot-reload API/web mới lên DB cũ. Sáu migration pending gồm uncapped amounts,
simulator capital, step options, custom step, rival window, free shipping
reconcile. Đặc biệt CapitalIncrease thêm tiền vào nguồn mô phỏng hệ thống;
không phải nạp thêm vào ví Member. Cần chốt gói kích hoạt DB riêng, backup mới,
dừng API/worker, migrate rồi cập nhật đồng bộ client/API/worker và kiểm ứng dụng.
Không thay env, reset dữ liệu, push/PR/merge remote hoặc đóng READINESS.

### Kích hoạt localhost theo yêu cầu tiếp theo của owner

Owner phản ánh chưa thấy giao diện mới và yêu cầu tiếp tục. Đã dừng đúng cây
tiến trình API/worker của checkout ứng dụng, tạo backup DB nhất quán private
kèm schema/index, rồi áp6migration đã thử QA. PASS giữ5.838bản ghi cũ, ngoại lệ
counter ledger sequence tăng1; thêm journal tăng vốn cùng2entry cân bằng.
Ledger entry cũ và5env giữ nguyên,0migration pending,0bản ghi vi phạm validator.
Không reset/seed, không sửa giá trị ví người dùng hoặc giao dịch để demo.

Checkout ứng dụng fast-forward tới1d59ee10; API/worker khởi động từ source mới,
Member/Admin Vite dùng cùng checkout. PASS browser thật localhost trang đấu giá
1440/390px: toolbar mới/empty art hiện đúng, không tràn ngang hoặc pageerror,
API đấu giá200. Hiện0phiên công khai nên chưa kiểm giao diện phiên đang chạy.
PASS5Member demo login/profile/wallet/review reads và đối soát ledger cân bằng;
phiên đăng nhập kiểm chứng đã logout. Không gửi lệnh đấu giá hay gọi provider.
CI lỗi trên main ghi phía trên chưa được xử lý; không push/PR/merge remote,
không đóng gate. Log/backup/ảnh kiểm chứng ở vùng private của máy thao tác.

## Source và bảo toàn

Owner giao kiểm tra main, đồng bộ và giải quyết conflict. Main đã fetch tới
`00a1d16d8f65e766c339b9cf8d69736704592fb8` (gồmPR92). Thiết kế cuối của main dùng vùng
bằng chứng mở gọn ngay trong trang; thay thiết kế panel trượt trước đó.

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
- Giữ thiết kế khiếu nại mở gọn trong trang của main bằng native details/summary,
  keyboard và một document scroll; đóng vùng bằng chứng sẽ dừng video. [Bằng chứng riêng](../../apps/admin-web/src/features/operations/exchange-evidence-review.tsx)
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

Bằng chứng áp dụng cho nhánh tích hợp và merge00a1d16d; không là remote CI của
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

Đã áp dụng9migration ban đầu và1migration mới củaPR92 trên DB local chính:

1. 0050-support-cases
2. 0051-support-auto-review-union
3. 0056-auto-review-v2-upgrade-bridge
4. 0052-listing-auto-review-v2
5. 0053-exchange-agreement
6. 0054-exchange-evidence
7. 0052-free-shipping
8. 0054-exchange-negotiated-diff
9. 0055-exchange-negotiated-diff-payer
10. 0054-local-demo-completion

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

## PR92 nhận trong lúc đồng bộ

Main tiếp tục nhậnPR92 tại00a1d16d, thêm job/command hoàn tất đơn demo riêng.
Đã ghép contract0.73.1 (246operations/38controllers), giữ cả bằng chứng Exchange
và bridge AI. Fixture upgrade main59migration giữ nguyên59checksum gốc, thêm đủ
các migration mới theo thứ tự; không bỏ assertion hoặc đổi baseline đã áp dụng.

Clone DB thực trênQA nâng thêm0054-local-demo-completion PASS:5225bản ghi cũ
nguyên vẹn,không validator mới nào làm dữ liệu hiện có không hợp lệ. Sau đó dừng
API/worker,có backup private mới,áp dụng đúng migration,cập nhật role,build tại
checkout app và khởi động lại.5env không đổi; LOCAL_DEMO_COMPLETION_ENABLED đang
**tắt**,không tạo job hoặc tự hoàn tất đơn. User2 vẫn850k/150k,đơn cũ Preparing,
ledger cân bằng. Migration này chỉ thêm collection/validator,không giải ngân.

Kiểm thêm PASS toàn Mongo61/6SKIP (không chạy cluster failover riêng),8release
case/40ngoài filter SKIP,10policy unit và315web unit/build/types. Demo transit
trước sửa tái hiện625k!=535k: test vẫn cộng30k ship cho3đơn. Đã cập nhật theo
chính sách miễn phí đã có trên main,thêm kiểm tra3bookPrice125k/shipping0/
held125k từng đơn,aggregate375kheld/625kavailable. PASS65stable intents/receipts,
mấtACK/race/restart,không đổi ledger/commitment; storage fake,QA riêng.

Seller-order browser tái hiện hai lệch sau free shipping: selector vẫn tìm
“Xem phí giao nhận”/“Thử lại bước tính phí”,và90kbook+30kshipping. Đã cập nhật
selector sang nhãn hiện có,kiểm độc lập bookPrice90000/shippingFee0,held90000,
available110000 từ funding200000. Giữ ca thiếu tiền,không giữ trước thanh toán,
lost ACK exact-key/body,1Order/1payment journal và public availability.
Browser2phiên,390/1440,API/Mongo QA thật,funding/storage fake PASS.

## CI remote và giới hạn

CI trên6919981c trướcPR92:Docs/Admin/Operations đều PASS.
CI trên đúng SHA00a1d16d hiện có [API FAIL ở Mongo](https://github.com/huangg49/used-book-marketplace/actions/runs/41506791165),
[Demo FAIL ở transit](https://github.com/huangg49/used-book-marketplace/actions/runs/41506791136),
[User Web FAIL ở seller-order browser](https://github.com/huangg49/used-book-marketplace/actions/runs/41506791109).
Các kết quả local nêu trên không thay trạng thái CI này. Không tự rerun/push lên
remote; bản tích hợp chưa có CI riêng. Native Android,live evidence video storage
và human acceptance NOT RUN.

Chính sách free shipping từ main chỉ tác động quote/order mới. Đơn Preparing
cũ có hold150000VND không được tính lại hoặc hoàn tiền khi đồng bộ source.
READINESS giữ nguyên; không nhận native/live storage/human acceptance từ QA fake.
