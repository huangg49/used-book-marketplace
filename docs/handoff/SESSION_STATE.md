# Điểm lưu hiện tại — 01/10/2026

## Nguồn và việc đang làm

- **UI-1 — BA HƯỚNG KỆ ĐỘC LẬP / CHỜ CHỌN BẰNG MẮT.** Chủ dự án đồng ý
  chẩn đoán kệ trước quá trầm, yêu cầu2–3hướng thật sự khác nhau với bìa nhiều màu.
  Nhánh mới `codex/shelf-visual-directions`, basefd2947d; checkpoint
  `design: explore three distinct shelf directions`. App/main/nhánh UI cũ giữ nguyên.
  [Ba mẫu HTML và bàn giao](../ui/shelf-directions/README.md), preview8090:
  A lưới cửa hàng sáng; B hàng bìa cuộn ngang/mặt tiền rừng; C quầy sách với phiếu.
  Cùng6tác phẩm có bìa Standard Ebooks và nguồn/license; giá/tình trạng/ghi chú mẫu,
  không vào API. Imagegen hết hạn mức, không có ảnh AI và không dùng API key thay thế.
  Đã xem browser390×844/100%–130%, tìm/lọc/rỗng, nút qua cuốn, mở/đóng phiếu tên dài.
  Lưu8ảnh; chữ lớn chỉ mô phỏng CSS, không native PASS. Syntax/format/docs/diff-check
  PASS; không chạy lại RN/API tests vì không đổi runtime. Không đổi DESIGN.md,
  không push/merge. DỪNG chờ chủ dự án chọn hướng rồi mới port vào app.
- **UI-1 — KỆ CÓ TÍN HIỆU CỬA HÀNG / BẢN TRƯỚC VÒNG KHẢO SÁT MỚI.** Chủ dự án duyệt ba dòng
  và bước1 của hướng cửa hàng, kèm banner biên tập sau hai cuốn đầu. Nhánh
  `codex/ui-direction`, base3a35355; checkpoint
  `feat(rn): clarify shelf offers and add editorial bookshop banner`.
  Tên Be Vietnam Pro16/23, giá18/25, nền sáng nhẹ; giữ căn hàng và một cột130%.
  Banner “Đọc xong. Chuyền tay.” chỉ ở kệ mặc định trang1/đủ2cuốn/không lỗi,
  cuộn cùng kệ, bỏ hình trang trí khi chữ lớn. DESIGN/UI_COMPONENTS đã đồng bộ.
  [So sánh mới](../ui/shelf-storefront-01.html),
  [kiểm chứng/giới hạn](../ui/SHELF_STOREFRONT_01.md).
  Android390dp100%/130%: đầu/cuối kệ, tên ngắn/dài, một/hai giá, banner;
  thêm320dp130%, mở chi tiết/Back, tìm/lọc, mất API/phục hồi tự động.
  RN91/91, lint/typecheck/Prettier/docs/diff-check PASS.
  TalkBack/ARM/iOS/web/native catalog/showcase chưa kiểm mới; không đóng gate.
  Windows chặn bind57017: QA compose riêng latlai-ui-storefront/37017,
  DB random *_test; API3046/media3047 thật, storage FAKE. Guard/config chính giữ nguyên.
  Harness ignored .tmp/ui-storefront; snapshot app/font/density/reverse phục hồi,
  dừng QA/emulator của agent, giữ Metro người dùng/Docker Desktop/preview8089.
  Không đổi API/session/nghiệp vụ/màn chi tiết. Chưa push/merge; chờ phản hồi
  trước bước tiếp, chưa đổi bộ lọc/điều hướng, chưa motion/C02/C04.
- **UI-1 — KỆ SÁCH VÒNG02, THAY BẢN VÒNG01 ĐÃ BỊ TỪ CHỐI.** Chủ dự án
  không chấp nhận vòng01 ead610b (bìa nhỏ/cột chữ dài), sau đó giao quyền quyết
  định thiết kế, yêu cầu kết quả đẹp và dễ dùng. Không dùng tests xanh làm duyệt UX.
  Bản mới: hai cột chữ thường; ở130%/màn hẹp, bìa cạnh tên và giá có hàng riêng
  đủ chiều rộng. BookOffer Bán/Đổi ngắn rõ, nhãn tình trạng một nét đất nung;
  bỏ người bán khỏi phần nhìn thấy của kệ, vẫn giữ ở chi tiết/accessibility label.
  Bìa contain180dp/nền giấy; gom đầu màn và dùng compactFooter có sẵn. Không đổi
  query/API/session/navigation/nghiệp vụ hoặc màn chi tiết đã duyệt.
  [Ảnh mới/so sánh](../ui/shelf-direction-02.html),
  [evidence/giới hạn](../ui/SHELF_DIRECTION_02.md):390dp/100%–130%,320dp/130%,
  ảnh tư liệu showcase, tìm/rỗng/bỏ lọc/Bán/Back/lỗi-retry/cuối kệ đã xem Android.
  RN91/91, lint/typecheck/Prettier/docs/diff-check PASS; không chạy lại API gates.
  QA ui-refine giữ data cũ, Mongo/API thật/storage fixture FAKE; chưa nghiệm thu
  TalkBack/ARM/FPS/iOS/Expo web hoặc native `/ui`. Không đóng review/native/release.
  Checkpoint `feat(rn): restore browsable shelf with adaptive book offers`;
  chưa push/merge. QA phục hồi/dừng theo SHELF_DIRECTION_02, notes `.tmp/ui-shelf-v2`.
  Vòng01 là lịch sử bị loại; không áp nó sang màn khác. Chưa thêm chuyển động.
- **UI-1 — MÀN CHUẨN CHI TIẾT ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT tại a70e5a3.**
  Ghi nhận ba điểm xem lại khi có bìa sách thật: bìa còn nhỏ, dấu tình trạng
  khiêm tốn, hàng số ảnh1/1 + kính lúp chiếm chỗ. Chưa sửa thêm từ các ghi nhận
  này. Duyệt thẩm mỹ màn chuẩn không đóng gate native/review độc lập/release.
  Chủ dự án đã chọn kệ trước, chuyển động mở ảnh lớn sau; lượt kệ ở trên.
  Chủ dự án chỉ ra hai giá quá sát và yêu cầu sửa. Từ192b0cf: BookTradeBar dùng
  cột giá co giãn/gap32px, cách trạng thái8px, BookPrice mặc định giữ nguyên.
  [So sánh mới nhất](../ui/detail-price-spacing.html), phần cập nhật trong
  [evidence](../ui/DETAIL_STANDARD_03.md):8 ảnh mới cùng4 listing QA,390dp/100%–130%;
  đã xem hai mức giá dài/ngắn, một mức giá130%, cuối màn không bị che.
  RN91/91, lint/typecheck/Prettier/docs:check/diff-check PASS mới. Không đổi
  contract/query/navigation/nghiệp vụ; không chạy lại gate không liên quan.
  App snapshot/font/density/reverse phục hồi; API/media/emulator dừng, giữ
  Metro/Docker/preview người dùng. Local notes .tmp/ui-price; QA vẫn run ui-refine.
  Checkpoint `fix(rn): separate book trade price groups`; chưa push/merge.
  **C01 đã merge (PR11/PR12); C02 TẠM HOÃN để làm đợt định hướng giao diện
  (UI-1); gate review người thật/native/release vẫn mở.** Nhánh `codex/ui-direction`,
  nền main4273f10, nối tiếp màn chuẩn02 tại25c8319. Bìa rộng40%/khung2:3 nền giấy,
  contain không crop; bỏ nhãn Tình trạng nhìn thấy, giữ accessibility label;
  Bán/Đổi/Bán hoặc đổi viết rõ dưới dấu. Footer rút thành “Tiệm chưa nhận đơn ở
  bản này.”, một dòng ở390dp/font130%. DESIGN/UI_COMPONENTS/ví dụ dùng chung cập nhật.
  Không đổi API/contract/session/query/navigation/logic nghiệp vụ; chưa mở C04.
  [So sánh trước lần sửa khoảng cách](../ui/detail-standard-03.html),
  [kiểm chứng](../ui/DETAIL_STANDARD_03.md):8 ảnh native mới của4 bản DEMO,
  LikeNew/Good/Fair/Worn, tên ngắn/dài, Sale/Exchange/Both ở100%/130%.
  Ảnh trước tái sử dụng bộ Sau25c8319. QA tmpfs cũ mất dữ liệu khi Docker dừng;
  tạo4 bản mới qua API, cùng nội dung nhưng khác ID. Run .tmp/demo/ui-refine,
  random *_test/57017, API3046/media3047; Nest/Mongo/Sharp thật, storage fixture FAKE.
  Đã xem đủ8 ảnh, ảnh vuông showcase; mở ảnh lớn/Back; cuối màn130% không bị
  footer che; ảnh không khả dụng khi refetch lỗi và retry phục hồi. Nhãn tình
  trạng có trong hierarchy, không đồng nghĩa nghiệm thu TalkBack.
  PASS: RN91/91 (12 files), lint/typecheck, contract:check, Prettier, docs:check,
  diff-check; Node24.19.0/pnpm11.19.0. Không chạy lại API E2E/export/native build.
  Chưa kiểm mới /ui native (DESIGN_PREVIEW=0),320px/Expo web/TalkBack/ARM/iOS;
  không đóng human review/release. Chủ dự án đã duyệt thẩm mỹ màn chuẩn sau sửa giá.
  Người dùng đã mở lại Metro/Docker. Đã phục hồi app snapshot/font/density/reverse,
  dừng API/media QA/emulator do agent mở; giữ Metro/Docker người dùng và preview8089.
  PID/notes ở .tmp/ui-refine; QA giữ lại, không reset DB/bucket/config chính.
  Checkpoint subject `feat(rn): refine book cover and trade labels`.
  Chưa push/PR/merge. Màn chi tiết giữ nguyên trong lượt áp hướng sang kệ.
  Lịch sử: [màn chuẩn02](../ui/DETAIL_STANDARD_02.md),
  [màn chuẩn01](../ui/DETAIL_STANDARD_01.md), [phê bình](../ui/CRITIQUE_01.md).
- **C01 đã squash merge** qua [PR11](https://github.com/huangg49/used-book-marketplace/pull/11)
  vào main **6361e57**, base10a461c, head đã kiểm4e4851e; tree sau squash giống
  head đã kiểm. Code gốc d45b7c7 `feat(rn): add opt-in read-only wallet`.
  Chủ dự án duyệt30/09 mở C01/C02 **chỉ đọc, dùng nội bộ** trước full M1;
  đã cập nhật ngoại lệ trong CONTINUATION_PLAN/DEMO_PLAN. Release/human review,
  Delivered/inspection/settlement vẫn giữ gate. C02 chưa bắt đầu.
  C01 dùng GET wallet/history hiện có, component/session chung; cờ
  `EXPO_PUBLIC_INTERNAL_MEMBER_VIEWS=1` mới hiện lối vào/route ví, mặc định ẩn.
  Không đổi API/contract/persistence hoặc thêm thao tác tiền.
  RN91/91 (12 ca ví), lint không warning/typecheck/Prettier/contract và export
  Android/iOS/web PASS. Docs:check PASS158 files/1148links/3adapters, diff-check PASS.
  Android Pixel_7/API35/x86_64 và IAB320/390px: số dư/held700K/310K, history10+3,
  lỗi/refresh/pagination retry/403/Back/font130% và đổi buyer→LOCKED0/rỗng đã kiểm.
  Đã sửa nhãn xuống dòng, lỗi tải thêm xa nút và Account cắt chữ sau đổi font ở
  màn sau; chỉ remount presentation read-only, giữ session/query/logout state.
  [Evidence và giới hạn](C01_WALLET_2026_09_30.md): QA3046/DB random *_test57017,
  storage fixture; khoản tiền tạo qua API, không seed balance/state.503/403 dùng
  proxy lỗi có kiểm soát; LOCKED đọc API thật. Không là full native/release PASS.
  App snapshot mới/font100%/reverse đã restore, emulator/API/proxy QA đã dừng;
  preview web trước đó khôi phục. Metro người dùng8081 còn chạy, có thể đóng khi
  xong; API3046 hiện dừng. Config/DB chính và nhánh teammate giữ nguyên.
  CI PR11 trên đúng head4e4851e: **docs/react-native/operations PASS**, không skip.
  API/demo/Flutter không trigger cho diff này; không gọi đó là CI mới cho ba lane.
  Chủ dự án trực tiếp yêu cầu merge C01 ngày30/09; ngoại lệ tích hợp riêng gói
  này, human review NOT RUN, không có hai reviewer theo TEAMWORK. READINESS giữ
  nguyên; không đóng review/native/release hoặc cấp quyền merge/deploy C02.
  Điểm lưu sau merge trên `codex/c01-merge-checkpoint` từ6361e57; subject
  `docs(handoff): record merged C01 source and checks`. Chỉ đổi SESSION_STATE và
  báo cáo C01; docs:check PASS158/1148links/3adapters, diff-check PASS. Docs CI
  xem trên PR checkpoint; không chạy lại API/native đã đạt.
- Gói RN condition đã push/squash merge qua [PR9](https://github.com/huangg49/used-book-marketplace/pull/9)
  vào main **fe7b577**, base b0e30fd, head kiểm e4e08e0.
  Chủ dự án trực tiếp yêu cầu merge nhánh này30/09; human review NOT RUN, không
  đóng gate review/native/release hoặc cấp quyền tích hợp gói khác.
  RN schema thiếu `Worn` khiến một bản nháp hợp lệ làm lỗi
  cả trang Sách của tôi. Đã đồng bộ schema, lựa chọn và màn kiểm tra đủ bốn mức
  theo OpenAPI; `Worn` hiển thị **Cũ nhiều**. Dùng component chung, không đổi API,
  migration, session hay command protocol.
- CI PR9 trên đúng head e4e08e0: **docs/react-native/operations PASS**, không skip;
  gồm contract/lint/typecheck/session/RN tests, export ba nền tảng và browser suites
  theo workflow. Tree code sau squash giống head đã kiểm. API/demo/Flutter không
  được trigger cho diff này; giữ evidence H01, không gọi đó là CI mới cho ba lane.
- Điểm lưu sau merge: nhánh `codex/rn-condition-merge-checkpoint` từ SHA squash
  PR9; subject `docs(handoff): record merged RN condition fix`. Chỉ đổi SESSION_STATE;
  docs:check/diff-check và docs CI, không chạy lại API/native hoặc đóng thêm gate.
- Checks local source condition: RN test **79/79** (11 file, gồm 11 ca condition mới), lint,
  typecheck, contract:check, Prettier và export:web PASS. Focused condition/form/
  command 33/33. Regression gồm đọc/lưu bốn mức, trang trộn Good/Worn, null và
  từ chối giá trị ngoài contract; không chạy lại toàn bộ API E2E/native gates.
- HTTP QA dùng shared SessionClient/schema/command RN với Nest/Mongo thật tại
  API3046, DB random *_test trên QA57017/rs-test. Đọc bốn bản nháp qua hai trang,
  lưu Worn version2 và đọc lại acknowledged intent giữ version2; không phải
  kiểm lost-ack mới. Storage fixture, không thử pipeline/live Supabase.
- UI thực: Expo web Chromium390/320px nhận trang đủ bốn mức, chọn Good → Worn,
  xem nhãn, sửa ghi chú/lưu/mở lại, không tràn ngang. Android Pixel_7/API35/x86_64
  với APK debug hiện có và Metro source mới: đăng nhập QA, mở Worn, lưu Good rồi
  Worn, quay về danh sách/mở lại; chữ OS130%, bàn phím/Back giữ lựa chọn và màn
  kiểm tra hiển thị đúng. Đọc lại API sau UI: Worn version5, ba bản nháp còn lại
  giữ condition, giá/ruột sách/ghi chú giữ nguyên. Ảnh đã xem, chỉ dữ liệu DEMO:
  [Android](../verification/condition-worn-android.png),
  [mở lại/chữ130%](../verification/condition-worn-font130.png),
  [web320px](../verification/condition-worn-web320.png).
- Vướng môi trường đã xử lý: terminal Metro từng bị người dùng đóng; lần mở lại
  chỉ listen ::1, chạy ưu tiên IPv4 rồi restart app thì nạp được. Browser QA ban
  đầu mở export cũ, rồi origin mới không khớp CORS; dùng source mới/origin cho
  phép thì PASS. Harness từng sai cwd/TSX load Nest metadata và login payload;
  sửa harness local, không sửa backend/test để che lỗi. Log/config/snapshot riêng
  giữ ignored trong .tmp/rn-book-condition/, không commit credential.
- Sau QA đã khôi phục snapshot app mới chụp đầu gói, font100% và reverse ban đầu;
  dừng emulator/API QA, phục hồi preview web trước đó. Metro do người dùng mở còn
  chạy, có thể đóng terminal khi xong QA. DB/config/bucket local chính giữ nguyên.
  TalkBack/ARM/iOS/human review và M1 vẫn OPEN/PARTIAL, không mở C01/C02 từ ca này.
- Nhánh cũ `codex/rn-upload-recovery` giữ nguyên: 1546368 (Notice upload gián đoạn,
  unit28/lint/typecheck PASS, native NOT RUN) và 2c89f9a (khảo sát khoảng trống).
  Hai commit này chưa push/merge và không nằm trong gói condition. Theo yêu cầu
  hiện tại chưa giao thêm task cho teammate.
- main đã tích hợp MongoDB qua [PR5](https://github.com/huangg49/used-book-marketplace/pull/5)/[PR6](https://github.com/huangg49/used-book-marketplace/pull/6), baseline1be5144.
- Docs/AI/plan và toàn bộ H01 đã push/squash merge qua
  [PR7](https://github.com/huangg49/used-book-marketplace/pull/7) vào mainf875df9.
  Head được kiểm9c430ac; cả6 job demo/docs/API/RN/operations/Flutter PASS, không
  skip. Tree f875df9 giống đúng head9c430ac. Main local đã fast-forward; local
  work/config/DB giữ nguyên, không reset/clean/pull đè hoặc đổi branch protection.
- Điểm lưu sau merge được giữ trong [PR8](https://github.com/huangg49/used-book-marketplace/pull/8):
  nhánh codex/h01-merge-checkpoint từf875df9; subject
  `docs(handoff): record merged H01 source and CI evidence`.
  Không đổi API/contract/migration/UI; checks docs-only, không chạy lại API/native.
- Chủ dự án đã cho phép push/tạo PR/merge H01 ngay sau checks cần thiết, miễn
  human review cho riêng gói này (yêu cầu trực tiếp30/09). Không có human sign-off;
  không đóng gate review/native/release hoặc mở nghiệp vụ sau F2h từ ngoại lệ này.
- Đã hoàn thiện [AI_WORKFLOW](../AI_WORKFLOW.md): AGENTS gọn, domain rules đọc theo
  nhiệm vụ, ba skill nguồn chung + adapter Claude, mẫu issue/PR và docs:check/CI.
  Commit0182e40: docs(ai): add shared team skills and verified onboarding workflow.
  [Bằng chứng/phạm vi](AI_TEAM_HANDOFF_2026_09_30.md): checker 5/5, skills 6/6,
  docs links/contract/diff-check PASS; AI mới sửa form mẫu và nhận đúng gate.
  Không đổi app/DB. Chưa test tự nạp Claude/máy teammate; remote CI đã đạt ở PR7.
- H01 tooling đã lên main để nhóm nhận; API/contract/migration/UI product
  không đổi. Accounts fixture tách role, DB random *_test trên QA57017/rs-test,
  private bucket riêng; mọi command nghiệp vụ qua API, không seed tiền/state.
  Durable key/body/version/receipt, run lock, binding và chặn SANDBOX_LOST.
  Cách chạy/phạm vi/test/lỗi harness cụ thể ở [DEMO_SCENARIOS](DEMO_SCENARIOS.md).

  | Increment | Source / đầu ra                                                                                 |
  | --------- | ----------------------------------------------------------------------------------------------- |
  | H01a      | ae0f1d9: demo:books init/run/serve; catalog/media/listing/review/public shelf                   |
  | Funding   | 428cafd: demo:funding; Buyer1M qua operator độc lập, nguồn99M                                   |
  | Order     | 274d100: demo:orders; unpaid/paid/Preparing,40 receipts                                         |
  | InTransit | d4f8220: init thêm --in-transit; giữ3 mẫu cũ + Order thứ tư, packaging/label/pickup;57 receipts |

- Gói InTransit đã commit d4f8220 trên codex/h01-intransit-scenarios.
  Ảnh packaging do tool tạo, có nhãn DEMO; không chứng minh kiện sách thật/custody.
  Seller reserve/PUT/label không đổi Order3, deadline hay tiền; operator độc lập
  gửi PickedUp với key=eventId, thời gian từ API server; Applied → InTransit4.
  Snapshot checkOrder/checkShipment/checkPackaging và ledger chỉ đọc khớp:
  available535K/held465K/source99M/seller0, commitment vẫn Active/version1.
- Checks thực chạy trên source d4f8220: unit14/14; test:demo:transit HTTP/Nest/Mongo/
  Sharp FAKE PASS: upload/label/pickup lost-ack sau commit3 lần, API restart bằng
  session memory; actual concurrent identical pickup chỉ1 Applied; rerun57 intents/
  receipts,4 Orders/commitments,2 preparations,1 evidence/label/pickup,5 journals/
  10 entries. Wrong actor/key/payload/bytes bị từ chối; secret/contact không có
  trong manifest/journal. Ca API riêng duplicate/conflict giữ canonical pickup,
  hold/commitment; conflict → ResolutionPending5, tool dừng, không refund/restock.
  H01a/funding/Order regression, oxlint/format/docs/diff PASS. Node24.19.0/pnpm11.19.0.
- Supabase live `transit-live` trên dedicated private random bucket/QA DB: init/run
  và acknowledged rerun bằng CLI process mới sau cửa sổ login thật PASS; keys/IDs/
  counts/deadline/ledger không đổi. Preview packaging WebP800×600 qua participant
  API đã tải/xem, chỉ lưu ảnh, không URL/token. IAB Member web riêng với API3030:
  seller →4 Reserved, không thêm UI Order/shipping; ảnh trong .tmp/demo/transit-live/.
  Đây không là native PASS. Evidence H01a/Order live trước giữ ở DEMO_SCENARIOS.
- Full CLI crash/lost-ack live và human review NOT RUN. Remote CI của PR7 PASS;
  không coi CI/export là native acceptance. Login4 actor có
  thể429 khi restart trong cùng cửa sổ5 login/IP/15 phút; không persist token/nới
  guard/xóa login attempts. Deadline thật; run quá hạn dừng, không đổi clock/DB.
  Các manifest là evidence tại thời gian/source ghi, không thay outcome mới nhất.
- Gói docs trước: README/index/SESSION/READINESS rút gọn, sửa DB/contract/prompt;
  [phạm vi](DOCS_AUDIT_2026_09_30.md). Evidence lịch sử giữ nguyên.

## Trạng thái đã chốt

- API/worker: MongoDB, OpenAPI0.21.0,3 migrations; nghiệp vụ giao dịch đóng tại F2h.
  Admin có list user, chưa lock/unlock. Flutter chỉ scaffold; Member web là Expo web.
- CI PR9 head e4e08e0: docs/RN/operations PASS. CI head9c430ac trong PR7:
  demo/docs/API/RN/operations/Flutter PASS cho source H01.
  CI lịch sử head7587983 trong PR5 giữ evidence riêng. Các gate độc
  lập/full native còn mở ở [READINESS](READINESS.md), không suy từ merge thành release.
- Yêu cầu mới30/09: tiếp tục code buổi sáng, dự kiến bàn giao/merge main vào trưa
  cùng ngày để nhóm pull và phát triển. Mốc còn6 ngày là thời gian dự án đã nêu,
  không còn là thời điểm bắt đầu bàn giao. Mọi thành viên Windows có Docker/
  Android Studio, dùng DB riêng; chưa phân công web/admin/Flutter, chưa có reviewer.
  Không mở thêm ca native chỉ để tăng coverage khi không có thay đổi liên quan.
- Nhóm5 người: bạn và Bảo nhận phần khó; ba bạn còn lại chưa chọn tên/phân công.
  Ưu tiên web/admin/RN tới demo thứ Ba06/10, Flutter hoãn. Kế hoạch hiện hành:
  [DEMO_PLAN](DEMO_PLAN_2026_10_06.md); giờ demo chưa được cung cấp.

## Môi trường máy này

- Mongo57117/database latlai_acceptance_20260929 nay là DB local chính, không phải QA.
  Root/API .env trỏ project latlai-mongo-acceptance/volume hiện có; PostgreSQL5433 giữ nguồn.
- [Cutover và backup](LOCAL_MONGO_CUTOVER_2026_09_30.md): PG/Mongo/config/14media objects
  backup ngoài repo tại C:/Users/ASUS/Documents/LaiLai/backups/cutover-2026-09-30/.
  Restore dữ liệu cả hai DB trên QA đạt; chưa restore credential Mongo trên host mới.
  Không in/commit secret/backup hoặc restore đè dữ liệu đã nhận ghi mới.
- PID lúc cutover: API31696, media30464, order5068, Metro8081. Đây là metadata lịch sử;
  kiểm port/process trước khi dừng/chạy lại. Android Pixel_7/API35; reverse3000/8081.
- .tmp/ có log/harness/backup phiên; generated Prisma cũ ignored, không tham gia build.
  Giữ local, không reset/clean/xóa hàng loạt. QA57017 dùng DB *_test riêng.
- H01 QA đang chạy trên container used-book-marketplace-mongo-quality-mongo-test-1.
  Đây là tmpfs: restart mất dữ liệu, phải init run tên mới. Run live kiểm cuối:
  .tmp/demo/transit-live (API3030); private.json không được chia sẻ. Run cũ
  h01-live/order-live giữ evidence riêng; kiểm port/process thực tế trước serve.
  API3030 và preview web8081 đã dừng sau QA để trả port Metro; chỉ giữ artifact.

## Bước tiếp

C01 đã tích hợp vào main6361e57 với CI/evidence trên head4e4851e. Chủ dự án trực
tiếp yêu cầu merge riêng C01; human review NOT RUN, full M1/release vẫn còn gate.
C02 **TẠM HOÃN** theo yêu cầu UI-1 mới, không bắt đầu danh sách/chi tiết Order.
Trên `codex/ui-direction`, màn chuẩn chi tiết đã sửa tới `a70e5a3` (khoảng cách giá).
Xem [so sánh mới nhất](../ui/detail-price-spacing.html) và
[evidence màn chuẩn03](../ui/DETAIL_STANDARD_03.md); **chủ dự án đã duyệt màn chuẩn**.
Chủ dự án đã chọn kệ trước, chuyển động mở ảnh sau; đã từ chối vòng01 và giao
quyền tự quyết thiết kế. Đã chốt ba dòng và duyệt bước1 hướng cửa hàng kèm banner.
Sau fd2947d/SHELF_STOREFRONT_01, chủ dự án vẫn thấy quá trầm và yêu cầu khảo sát
lại bằng ba hướng khác nhau. Hiện xem [bảng A/B/C](../ui/shelf-directions/index.html)
trên `codex/shelf-visual-directions`; chỉ là HTML nghiên cứu. Chờ chọn hướng,
rồi mới sửa DESIGN.md và port vào RN. Chưa đổi bộ lọc/điều hướng, motion hay màn khác.
Các bước và ranh giới còn lại:

1. Màn chuẩn đã duyệt; ảnh Android trước/sau390dp,100%/130% vẫn là evidence hiện
   hành. Khi có bìa thật, xem lại kích thước bìa, độ nổi dấu tình trạng và diện
   tích hàng1/1 + kính lúp. Không tự sửa lại màn đã duyệt trong lượt này.
2. Bước kế theo thứ tự đã chọn: hướng1 chuyển động nhẹ khi mở ảnh lớn, sau đợt
   chỉnh kệ; nếu có phản hồi mới về kệ thì xử lý trước. Kèm bổ sung DESIGN.md
   về chuyển động và video trước/sau. Chưa triển khai chuyển động trong vòng02.
3. Hướng2 (vuốt ảnh): khảo sát số ảnh/listing trong QA/API rồi báo để chủ dự án
   quyết định. Phân biệt mẫu QA được tạo chủ đích với phân bố dữ liệu sử dụng;
   chưa khảo sát, chưa cấp quyền triển khai gesture.
4. Hướng3 (bìa nối từ kệ sang chi tiết) hoãn. Không áp màn chuẩn sang màn khác
   khi chưa được chọn triển khai; C02 tiếp tục hoãn.

Mỗi bước có ảnh/video hoặc báo cáo tương ứng. Chủ dự án giao agent tự quyết thiết
kế; lượt khảo sát hiện tại dừng chờ chọn A/B/C.
Checkpoint nghiên cứu: `design: explore three distinct shelf directions`;
checks/evidence ở docs/ui/shelf-directions/README.md. Runtime vẫn tại fd2947d.
Không chạy lại gate API khi source không đổi.
Main local/remote4273f10; condition/H01/C01 đã tích hợp, nhánh upload-recovery
vẫn giữ riêng. Chưa có quyền merge/deploy UI-1 hoặc C02.
Không kiểm lại gate đã đạt khi source không đổi; chưa phân công thêm teammate.

H01a/H01b và docs/AI đã tích hợp; nhóm có thể nhận main. Đường đọc/test/giới hạn
H02 ở DEMO_SCENARIOS; nội dung/checks/integration ở PR7. Preflight source riêng
không node_modules14/14, checker5/5, YAML/order/format/diff PASS; unit CI gọi Node
trước explicit frozen install. Scan diff60 file đúng scope/không credential-shaped
literals có giới hạn; không bảo đảm mọi secret hoặc bug đều được phát hiện.
Checkpoint sau merge chỉ đổi docs: docs:check PASS157/1132links/3adapters,
diff-check PASS. PR8 đã squash merge vào b0e30fd; không kiểm lại
source nghiệp vụ/UI đã đạt. Lấy SHA bàn giao mới nhất từ main, không từ nhánh H01
trước squash hoặc SHA/PID lịch sử.
Bảo tiếp H02 review/debug nền/source và giới hạn recovery đã ghi; ba lane UI
làm tính năng hiện có. C01/C02 giữ dependency, không tự mở Delivered/settlement.
Chủ dự án đã cho phép miễn review riêng gói tích hợp H01; human review NOT RUN,
baseline release gate không đổi. Không suy quyền merge/deploy gói mới từ PR7.
Nhóm bắt đầu theo [AI_WORKFLOW](../AI_WORKFLOW.md)/[TEAM_WINDOWS](TEAM_WINDOWS.md),
phân công phần việc và reviewer; kiểm cửa vào Codex/Claude trên máy mình.
Chi tiết phiên trước ở [SESSION_HISTORY](SESSION_HISTORY_2026_09_30.md); không đọc
trạng thái “chưa merge/cutover” trong lịch sử thành việc hiện tại chưa hoàn tất.
