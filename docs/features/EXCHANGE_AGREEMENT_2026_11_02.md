# Thỏa thuận Exchange: snapshot, điều kiện accept và thay sách — 02/11/2026

## Kết quả và nguồn

Owner duyệt gói 1 sau [khảo sát](CORE_EXCHANGE_AUDIT_2026_11_02.md). Triển khai
theo SRS hiện hành: tiền bù tự tính, counter thay sách đủ điều kiện. Đã sửa
X01/X02/X03 và cách tách cọc/bù X07 trên web; không coi toàn core Exchange hoàn
thiện. [ADR0063](../adr/0063-exchange-agreement-snapshots.md) giữ quyết định và
cách nâng cấp; báo cáo này ghi hành trình/evidence/giới hạn của gói.

- Branch `codex/exchange-agreement-snapshot`, base `c7085d78`, subject
  `fix(exchange): freeze agreement terms and revalidate acceptance`.
- API/contract, Mongo validator, shared parser, Member web và RN cùng thay đổi.
  Contract0.71.0/214operations; generated types sinh từ YAML, không sửa tay.
  Flutter hiện chỉ có scaffold `main.dart`/`app_test.dart`, không có counter
  consumer; không tuyên bố Flutter/native/Admin đã có UI snapshot parity.
- Fetch thấy main mới `48ab01fa` ([PR86](https://github.com/huangg49/used-book-marketplace/pull/86)),
  thêm support và migration0051. Chưa ghép commit đó vào chuỗi local của gói này.
  Migration mới chọn0052 để tránh trùng số; trước publish cần tích hợp main,
  giữ union support/AI, giải quyết ADR0062 trùng tên giữa local và main. Không
  suy CI main hoặc PR cũ thành CI của source này; CI mới NOT RUN.

## Hành trình đã nối

| Vai trò/entry | Điều kiện → command/side effect | Kết quả → bước tiếp/Back |
| --- | --- | --- |
| Member từ sách/kệ/hội thoại → đề xuất | Khóa user/session, conversation nếu có, listings; sách đủ điều kiện → tạo snapshot và Proposed | Hai bên xem cùng sách/giá/tình trạng; chưa giữ sách, chờ bên nhận phản hồi |
| Bên đang phản hồi → chọn sách thay thế | Chọn sách của mình; server kiểm proposal cũ và sách thay thế → counter revision mới, tính lại cọc/bù | Đối tác phải phản hồi revision mới; người vừa counter chỉ chờ hoặc hủy |
| Bên đang phản hồi → chấp nhận | Đúng revision/hạn và cả hai chủ/sách còn đủ điều kiện → reserve nguyên tử | AcceptedAwaitingFunding, nộp nghĩa vụ đúng số; replay trả kết quả gốc |
| Bên phản hồi khi nội dung/điều kiện đổi | Không khớp snapshot hoặc thiếu snapshot → persisted Cancelled/ListingUnavailable | UI báo đóng, chưa giữ sách/thu tiền từ proposal; tạo đề xuất mới từ sách đủ điều kiện |
| Hai Member → xem lại detail/lịch sử | Đọc snapshot và ảnh participant, không đọc current public listing | Bài hiện tại bị ẩn vẫn không đổi sách/giá lịch sử; ảnh lỗi không thay facts |
| Member có hồ sơ legacy | Thiếu agreement, UI không dựng lại metadata hiện tại | Hiển thị giới hạn và nghĩa vụ cũ; accepted/funded không mất hold hoặc bị reset |

RN dùng TanStack Query/session sẵn có; detail và private-photo query key theo
identity. Picker thay sách có tải thêm, loading/error/retry, chọn số lượng theo
vai trò, giữ lựa chọn/lời nhắn khi gửi lỗi. Web dùng ConfirmDialog sẵn có cho
focus/Escape; giữ entrance motion của counter trong phạm vi component theo
AGENTS kể cả reduced-motion. Không đổi brand hoặc component navigation chung.

## Source chính và invariant

- [Contract](../../packages/api-contract/openapi.yaml): ExchangeAgreement,
  ExchangeBookSnapshot, CounterExchangeProposal `listingIds`, ảnh participant.
- [Agreement helper](../../apps/api/src/modules/exchanges/exchange-agreement.ts):
  snapshot đã duyệt, eligibility, so revision/version và tính tiền.
- [Service](../../apps/api/src/modules/exchanges/exchanges.service.ts): transaction
  create/accept/counter, đóng unavailable có receipt, ảnh chỉ participant/current
  agreement. Không dùng exception để đóng rồi rollback mất trạng thái đóng.
- [Migration0052](../../apps/api/src/database/mongo/migrations/0052-exchange-agreement.ts):
  optional/null cho lịch sử, schema và điều kiện IDs/owners/deposit/delta. Không
  ghi tiền, sửa bút toán hoặc chạy backfill nội dung đã thất lạc.
- [Shared parser](../../packages/session-client/src/exchange-agreement.ts),
  [web mapping](../../apps/user-web/src/services/exchange.ts),
  [web detail](../../apps/user-web/src/services/exchangeDetail.ts),
  [RN proposal](../../apps/mobile-react-native/src/features/exchanges/exchange-proposal-card.tsx),
  [RN counter](../../apps/mobile-react-native/src/features/exchanges/exchange-counter-form.tsx).
  Snapshot có edition/ISBN, condition notes và media IDs; signed URL không lưu DB.
  Các client hiện đọc ảnh bìa đầu tiên, không phải một gallery nghiệm thu toàn
  bộ ảnh tình trạng. Web cọc dùng deposit riêng; tổng nộp gồm cọc và bù được ghi
  rõ trong dialog, không hứa hoàn toàn bộ tiền bù như tiền cọc.

Đề xuất mới không dùng lại revision chỉ vì giá tình cờ bằng nhau. Một chu kỳ
hide/show hoặc release/reserve làm version khác cũng cần đề xuất mới. Counter
chỉ thay bên đang phản hồi; không lấy giá sách bên kia mới sửa để tự đổi thỏa
thuận. Không lấy idempotency replay làm quyền bỏ current auth/session.

## Kiểm chứng

Source là working diff trên base ở trên; ảnh, người dùng, địa chỉ và sách đều
tổng hợp trong QA. HTTP Nest/Mongo thật trên replica set `rs-test` port57017,
DB `latlai_exchange_agreement_test` và fixture ngẫu nhiên `ops_browser_*_test`.
Storage fake/ảnh tổng hợp qua worker; mail local; ví simulator. Không dùng DB
chính, provider GHN/Brevo/Supabase/AI thật, không đổi giờ máy hoặc seed tiền ngầm.

| Check | Kết quả | Phạm vi/giới hạn |
| --- | --- | --- |
| Exchange + conversation E2E | **62/62 PASS**, hai file | Full53Exchange +9conversation tại lượt đầy đủ cuối |
| Counter initiator nhiều sách, đảo payer và funding | **1 PASS / 53 SKIP** ở lượt bổ sung | Ca mới thêm sau lượt62: tổng63ca riêng biệt có evidence; không gọi lượt bổ sung là full63 |
| Mongo nâng validator legacy + từ chối tiền/ID sai | **1 PASS** | DB upgrade riêng; giữ nguyên document legacy, không suy dữ liệu lịch sử |
| Web unit | **275 PASS** | Sau thêm parser/mapping; regression13ca chạy lại sau chốt snapshot/name/mapping |
| RN unit / shared session unit | **223 / 106 PASS** | Không thay native/human evidence; shared schema được kiểm thêm qua browser |
| API/RN/web/Admin typecheck, API/web build | PASS | API types chạy lại toàn bộ sau chốt; không hạ tsconfig sản phẩm |
| RN Expo web export | PASS,32route/exit0 | CLI báo force-exit sau export; artifact đã chạy browser PASS; không phải Android/iOS/native PASS |
| Contract/generate/routes | PASS | 214operations/33controllers, không thiếu/thừa route |
| Browser regression của gói | PASS | Member web thực 1440/768/390; RN Expo web390; API/Mongo thật, ảnh/storage fake |
| Lint phạm vi | PASS với giới hạn | RN/API không lỗi; web còn2warning set-state-in-effect tại effect địa chỉ có sẵn |
| Impeccable mechanical detector | **82 finding có sẵn**, exit2 |4side-tab,74color,4radius trong CSS cũ; không phải detector sạch hay design critique PASS |
| Native/TalkBack/ARM/iOS/human/live storage/CI mới | NOT RUN | Giữ gate READINESS và giới hạn cũ |

Detector chỉ ra ba stylesheet AcceptExchangeDialog/ActionCard/BookInfoCard.
Hai stylesheet đầu không sửa; BookInfoCard chỉ thêm rules cho disclosure tình
trạng, các finding thuộc rules cũ. Counter mới không có finding. Không đổi palette
hoặc mở một gói redesign để làm detector xanh; browser đã xem visual thực tế.

E2E mới kiểm PendingReview và đã duyệt lại giá mới, Hidden/LOCKED/RESTRICTED phía
còn lại, không reserve một bên, revision cũ, free-money counter422, sai owner,
counter hai vai trò/multi-listing, replay đúng key/body và conflict khác body.
Race dùng lock barrier thật, owner state/version commit trước command chờ; accept
đọc lại rồi đóng. Private photo từ chối outsider/anonymous/sai sách/phiên revoked.
Funding sau multi-counter: A giao250k/B giao200k → A nộp200k, B nộp300k gồm250k
cọc+50k bù; số dư còn550k/450k từ mỗi ví QA750k, reconcile cân.

Browser kiểm cụ thể:

1. Member web đọc proposal giá cũ sau khi listing đã sửa/duyệt600k; không hiển
   thị600k như giá đã thỏa thuận. Bấm accept thật → đóng có lý do, không reserve.
2. Web chọn sách thay thế150k đối ứng200k → bù50k đúng phía, revision mới cần
   đối tác accept. RN chọn sách600k đối ứng100k → cọc/bù600k/500k đúng record.
3. Sau accept rồi hủy đúng API, sách trở lại Available và chủ ẩn bài qua API.
   Đăng nhập lại trên Expo web vẫn đọc snapshot600k và ảnh private đúng quyền.
   Không dùng thao tác ép Hidden trên sách Reserved để giả làm luồng Member.

Runner có thể chạy lại bằng `pnpm test:exchange-agreement:browser` sau API build,
RN export và cấu hình `MONGO_TEST_URL` **QA riêng**. Đọc
[script](../../scripts/test-exchange-agreement.mjs) trước khi chạy: tạo dữ liệu
tổng hợp và dọn trong finally. Browser memory-only tokens được giữ bằng SPA
navigation; reload cần đăng nhập lại. Log/JSON/screenshot local trong
`.tmp/exchange-agreement/`; không là artifact CI hoặc nghiệm thu người thật.

Trong kiểm chứng đã sửa các lỗi dựng fixture: document Mongo phải có đầy đủ
nullable legacy columns và dùng UUID typed collection; test replay0039 tạm dựng
đúng shape lịch sử bằng cách bỏ agreement mới, rồi khôi phục dưới validator hiện
hành. Giữ assertion revision/ledger/checksum/idempotent của migration. Trước mỗi
ca dùng750k thay1M để bộ test mở rộng không vượt100M capital hữu hạn; không tăng
capital, sửa balance, thay migration cũ hoặc bỏ assertion tiền/quyền.
Có lúc xuất hiện file untracked ngoài gói `apps/api/src/check-checksum.ts` làm
typecheck lỗi; không chỉnh/xóa/stage file đó. File không còn ở lượt kiểm cuối,
full API typecheck đã chạy lại PASS. Không dùng cấu hình exclude tạm để gọi full
typecheck PASS.

## Nâng cấp, trạng thái bàn giao và việc còn lại

- Migration0052 chưa áp dụng DB chính. Khi được phép tích hợp/phát hành: ghép
  main mới trước, dừng API/worker cũ, migrate, nâng API và clients cùng phiên bản.
  Chỉ0052 không thêm collection/quyền và không cần seed/reset/đổi secret.
- Pending proposal legacy không đủ snapshot phải tạo lại; API giải thích bằng
  kết quả Cancelled/ListingUnavailable. Accepted/funded legacy giữ nguyên nghĩa
  vụ, không tự hủy/hoàn hoặc làm mất money history để nâng chuẩn dữ liệu.
- Chưa push/PR/merge/deploy, không thay READINESS/GHN/ADR0057. Kiểm chứng không
  phải chữ ký review tiền/quyền và UX người thật.
- Tại mốc gói1, X04/X05 (giao nhận từng chiều/hết hạn ship) và X06 (pending
  intent/retry) vẫn mở. Cập nhật sau đó: [gói2 phục hồi thao tác Member](EXCHANGE_RECOVERY_2026_11_02.md)
  xử lý X06 trong runtime web/RN; X04/X05 và gate giao nhận giữ nguyên. Không tự
  mở return/settlement để làm kín flow.
- Cuối phiên đã dọn0owned database/user/role, không còn DB QA khác; fixture
  ngẫu nhiên tự dọn trong finally. Docker mongo-test đã dừng; port3009/3010/5194/
  8087/57017 đã đóng. Mongo chính27017 vẫn chạy và không bị migrate/reset/seed/
  dừng. 28file UI/ảnh ngoài gói giữ nguyên checksum, không stage cùng commit này.
