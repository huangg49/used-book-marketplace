# Đồng bộ main vào local — 03/11/2026

## Source và bảo toàn

Owner giao kiểm tra main, đồng bộ và giải quyết conflict. Main đã fetch tới
`997d480873905d877721af455a28ef49fb8ee625`. Hai commit mới trong lúc kiểm tra
là90fc1491 và997d4808, đổi giao diện khiếu nại thành panel trượt.

Nhánh tích hợp `codex/sync-main-20261103` giữ các commit của nhánh
`codex/demo-background-catalog`, main và checkpoint local
`7f14d34deae5d91aff28638d3bfa50a80b216ae8` (131file tracked/untracked của checkout
ứng dụng). Có bundle Git, bản sao binary/untracked và cấu hình riêng ngoài Git;
đã đối chiếu SHA256. Không dùng reset/clean/stash/force checkout. Nhánh ứng dụng
`codex/local-checkpoint-20261103` vẫn giữ source đang chạy trước kích hoạt.

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

## Gate kích hoạt ứng dụng đang chạy

DB chính hiện có các migration chưa áp dụng, theo thứ tự registry:

1. 0050-support-cases
2. 0051-support-auto-review-union
3. 0056-auto-review-v2-upgrade-bridge
4. 0052-listing-auto-review-v2
5. 0053-exchange-agreement
6. 0054-exchange-evidence
7. 0052-free-shipping
8. 0054-exchange-negotiated-diff
9. 0055-exchange-negotiated-diff-payer

Đây là bước thay đổi schema/reference data của DB chính, ngoài thao tác Git.
Chưa thực hiện khi viết điểm lưu. API mới kiểm pending migration lúc startup;
không chuyển source rồi để watcher restart vào schema chưa sẵn sàng.

Sau owner duyệt: kiểm checkout không có edit mới; dừng đúng API/worker và frontend,
chụp backup private mới; chạy đúng registry đã thử trên QA, cập nhật privileges
của role app cho collection mới bằng admin local, không đổi password/user;
chuyển checkout app sang nhánh local cùng commit tích hợp; đối chiếu5file cấu
hình giữ nguyên, build/start lại3000/5173/5174; kiểm public401listing, search/filter,
User1/2/3 và ledger/held order cũ. Giữ backup và checkpoint; không tự push/merge.

Chính sách free shipping từ main chỉ tác động quote/order mới. Đơn Preparing
cũ có hold150000VND không được tính lại hoặc hoàn tiền khi đồng bộ source.
READINESS giữ nguyên; không nhận native/live storage/human acceptance từ QA fake.
