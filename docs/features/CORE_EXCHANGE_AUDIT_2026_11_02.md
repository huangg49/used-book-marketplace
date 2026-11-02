# Khảo sát core đổi sách — 02/11/2026

Gói 1 được triển khai sau khảo sát ở [bàn giao thỏa thuận Exchange](EXCHANGE_AGREEMENT_2026_11_02.md).
Báo cáo bên dưới giữ bằng chứng tại source khảo sát, không thay trạng thái gói mới.

## Kết luận và phạm vi

Core được chọn sau hành trình mua bán là **Exchange: hai Member đổi sách**.
Đã đối chiếu SRS, contract, backend, Member web và React Native, chạy API/Mongo
QA và browser thực tế. Có lỗi xác nhận ở chấp nhận đề xuất, dữ liệu thỏa thuận,
giao nhận từng chiều và phục hồi khi mất phản hồi. Chưa sửa source hoặc test.
Không coi luồng này đã hoàn thiện hay đã được người thật nghiệm thu.

- Source khảo sát: `90b89ac13429ab380c5eaa2cd645c308bc035dee` (Seller RN F2h).
  Branch khảo sát `codex/audit-exchange-core`; commit chứa báo cáo chỉ đổi docs.
- Đã fetch; `origin/main` vẫn là `d44b813b7631b92d0ddfd301c2de98288ce1eb14`
  ([PR85](https://github.com/huangg49/used-book-marketplace/pull/85)). Chuỗi local
  có các gói chưa push; CI main không đại diện cho source kết hợp này.
- Working tree có 28 file UI/ảnh ngoài gói, được đối chiếu checksum và giữ nguyên.
  Browser web dùng working tree hiện tại, có các sửa đổi ngoài gói này; các nguyên
  nhân được dẫn bên dưới nằm trong source Exchange không đổi của commit khảo sát.
- Không mở PR/push/merge/deploy, không đổi migration/contract/READINESS, không
  chạm DB chính, không gọi provider GHN hoặc dịch vụ email/storage thật.

Nguồn nghiệp vụ: [SRS FR-X01–X11, BR-22, state machine 7.4](../SRS_V1_1.md),
[phụ lục giao nhận](LOCAL_HANDOVER_AUCTION.md). Quyết định liên quan:
[ADR0041 workspace hội thoại](../adr/0041-unified-conversation-workspace.md),
[ADR0050 inspection và nghĩa vụ cũ](../adr/0050-exchange-inspection-and-existing-obligations.md),
[ADR0057 giới hạn xử lý tranh chấp](../adr/0057-exchange-resolution-safety.md).
ADR không thay bằng chứng nghiệm thu; code hiện hành không tự sửa nghĩa SRS.

## Hành trình và phần đã nối

| Chặng | Backend/contract | Member web/RN và bằng chứng |
| --- | --- | --- |
| Chọn sách → đề xuất | Tạo Proposed kiểm listing Approved/Visible/Available, mode và chủ; tính cọc/bù; chưa reserve | Có entry/composer và detail ở hai client; đề xuất QA qua API thật |
| Phản hồi/counter/accept | Có revision/idempotency, reserve nguyên tử, đóng đề xuất cạnh tranh; accept thiếu điều kiện hiện hành | Có nút phản hồi ở hai client; counter hiện nhập tiền tùy ý, khác SRS |
| Nộp nghĩa vụ | Một lần nộp gồm cọc riêng và bù của người nộp; cả hai đủ mới Preparing | Có CTA ở hai client; mất ACK/retry có lỗi đã tái hiện, chưa thấy double debit |
| Gửi/nhận hai chiều | Lưu shipment snapshot do Member khai; cả hai báo gửi mới InTransit | Có form gửi và xác nhận nhận; mới một bên gửi thì chiều nhận/báo sự cố bị chặn |
| Kiểm tra → hoàn tất | Có hạn 72h riêng, chặn hoàn tất sớm, giữ tiền khi dispute, worker settlement | E2E chọn lọc PASS; không đồng nghĩa carrier/custody thật hoặc release readiness |
| Sự cố → xử lý | Dispute có source, quyết định resolution mới bị gate ADR0057 | Đây là ranh giới có chủ ý; không đánh dấu là chức năng đã nghiệm thu xuyên suốt |

API chung nằm ở [controller](../../apps/api/src/modules/exchanges/exchanges.controller.ts)
và [service](../../apps/api/src/modules/exchanges/exchanges.service.ts), persistence
Mongo qua command executor/transaction, tiền qua ledger. Contract là
[OpenAPI](../../packages/api-contract/openapi.yaml), không phải DTO riêng của UI.
Web dùng [exchange service](../../apps/user-web/src/services/exchange.ts) và
[detail adapter](../../apps/user-web/src/services/exchangeDetail.ts); RN dùng
[detail screen](../../apps/mobile-react-native/src/features/exchanges/exchange-detail-screen.tsx)
và [actions card](../../apps/mobile-react-native/src/features/exchanges/exchange-actions-card.tsx).
Expo web là bản chạy web của RN; không phải `apps/user-web`, không phải native PASS.
Flutter không được kiểm UI trong gói này. ViaPoint/inspection vật lý không được
coi là đã nối chỉ vì có yêu cầu trong phụ lục. Đổi nhiều listing đơn không đồng
nghĩa đổi một bộ sách: validator bundle hiện chỉ cho Sale.

## Phát hiện đã xác nhận

### X01 — P1: accept không kiểm lại điều kiện sách và phía còn lại

- Vị trí: `exchanges.service.ts:581–640`, đặc biệt vòng lặp tại 622 chỉ kiểm
  `trade === Available` và marketplace channel trước reserve. `requireActive`
  kiểm actor đang accept; không kiểm lại chủ phía còn lại. Listing projection
  không bổ sung kiểm Approved/Visible hoặc revision nội dung được thỏa thuận.
- Thử trên API/Mongo thật: tạo đề xuất hợp lệ, rồi chủ sửa sách 150.000 → 450.000
  và gửi duyệt lại. Accept trả **200**, Exchange `AcceptedAwaitingFunding`, sách
  `PendingReview + Reserved`, cọc theo giá cũ 150.000. Ca ẩn sách cũng accept
  **200**, sách `Hidden + Reserved`.
- Ca riêng: khóa tài khoản người tạo đề xuất rồi bên kia accept vẫn **200**;
  phía bị khóa nộp tiền trả **403**. Sách đã bị giữ cho giao dịch chưa thể funding
  trong trạng thái tài khoản đó. Không có bằng chứng tự trừ tiền phía bị khóa.
- Tác động: ràng buộc sách chưa đủ điều kiện vào giao dịch mới; phải chờ hủy/hết
  hạn hoặc xử lý trạng thái để giải phóng. Mâu thuẫn FR-X04, UC accept: sách đổi
  nội dung phải làm đề xuất cũ Unavailable, không dùng việc còn Available làm đủ.
- Độ chắc chắn: **xác nhận bằng HTTP/Mongo**, không chỉ suy từ source.

### X02 — P1: thiếu snapshot sách thỏa thuận, tiền cũ nhưng UI đọc giá mới

- Service lưu listing IDs/cọc/bù; response không có snapshot revision/nội dung
  sách được chấp thuận. Accept không buộc listing revision trùng đề xuất.
- Ca API: sách A 100.000, B 450.000 → cọc A 450.000, A bù 350.000. B sửa thành
  600.000 và Staff duyệt; accept **200** vẫn giữ cọc 450.000/bù 350.000.
- Web `exchange.ts:257` ưu tiên `listing.exchangeValue` hiện tại; detail đọc public
  listing hiện tại. Trang lịch sử QA sau hủy hiển thị **nhận 600.000, giao 100.000,
  bù 350.000**. Quan sát desktop và viewport 390px; số tiền không còn khớp hai
  sách đang trình bày. Không dùng lịch sử này để khẳng định đã có settlement sai.
- RN detail cũng đọc public listings theo IDs; thiếu frozen snapshot được xác
  nhận từ source, chưa chạy riêng mọi tổ hợp sách bị ẩn/xóa trên RN.
- Tác động: Member không biết mình chấp nhận ấn bản/nội dung/giá nào; lịch sử
  thỏa thuận thay đổi theo listing. Mâu thuẫn FR-X02/X04 và quy tắc revision.
- Độ chắc chắn: **API + web xác nhận**; phạm vi RN nêu trên là source-confirmed.

### X03 — mâu thuẫn nghiệp vụ: counter được nhập bù tùy ý

- SRS FR-X02/X03 và BR-22 yêu cầu bù suy ra từ giá trị sách; counter thay listing
  đủ điều kiện, không thương lượng thay giá bỏ qua duyệt listing.
- OpenAPI `CounterExchangeProposal` tại 19464 nhận `diffAmount/diffPayer`, không
  nhận sách thay thế. `exchanges.service.ts:732–820` ghi trực tiếp số bù/bên bù.
  Dialog counter của cả web/RN đi theo contract này.
- API thật: cùng A 100.000/B 150.000, counter `0/none` trả **200**, bù từ 50.000
  thành 0, vẫn hai sách cũ và cọc 150.000/100.000.
- Độ chắc chắn: **mâu thuẫn SRS ↔ contract/code xác nhận**. Cần chủ dự án/nhóm
  chọn giữ quy tắc SRS hay chấp thuận thay đổi nghiệp vụ trước khi sửa contract.
  Không mặc định UI tự do thương lượng là lỗi cần sửa theo một chiều tùy chọn.
- Không kết luận ledger có khoản bù dương không người trả: Mongo validator hiện
  có ràng buộc cặp amount/payer. Ca đó không thuộc bằng chứng thực chạy.

### X04 — P2: một chiều đã gửi nhưng chưa thể nhận/báo sự cố

- `ship` tại 1349 chỉ chuyển InTransit khi **cả hai** đã báo gửi (1411);
  `receive` tại 1443 và `dispute` tại 1769 chỉ nhận InTransit/Delivered.
- API thật: A báo gửi **200**; trạng thái vẫn Preparing vì B chưa gửi. B gọi
  nhận sách hoặc mở dispute đều **409**, chưa có inspection deadline của B.
  RN cũng chưa mở nút nhận ở trạng thái này.
- Nếu sách A đã thực sự tới trước khi B gửi, B không có bước nhận/claim phù hợp
  lúc đó. Đây là hệ quả có điều kiện; QA chỉ có khai báo gửi, không chứng minh
  hàng đã giao vật lý hoặc provider đã pickup.
- Mâu thuẫn state machine 7.4/FR-X08/X10: tiến độ và quyền kiểm tra phải theo
  từng chiều, không đợi nhãn cả hai đã gửi. Tiền vẫn giữ, không có bằng chứng
  tự release sai trong ca này.
- Độ chắc chắn: **điều kiện chặn xác nhận bằng API/source**, tác động vật lý chưa
  được nghiệm thu. Không tự mở resolution đang bị ADR0057 chặn.

### X05 — P2: gửi sau hạn có thể thoát worker hết hạn

- `ship` không kiểm `shippingDeadline` tại command time; `expireShipping:1934`
  và worker `exchange-expiry.service.ts:143` chỉ xét Preparing.
- QA đặt **riêng shippingDeadline thành thời điểm quá khứ trong DB test của ca**
  để mô phỏng worker chưa quét; không đổi revision, ledger, balance hoặc giờ máy.
  A gửi muộn **200**/Preparing; B cũng gửi muộn **200**/InTransit. Gọi service
  `expireShipping` thực sau đó trả null, không xử lý ca này nữa.
- Tác động: kết quả phụ thuộc thứ tự request/worker; cả hai gửi muộn có thể đi
  tiếp thay vì chịu quy tắc quá hạn. Không phải bằng chứng worker đã được chạy
  lâu ngoài đời hoặc có settlement sai.
- Độ chắc chắn: **xác nhận bằng fixture quá hạn có chủ ý + service thật**.

### X06 — P2: mất ACK chưa phục hồi bền vững trên hai client

- RN `exchange-actions-card.tsx`, ví dụ fund tại 278, sinh UUID mỗi lần mutation;
  chưa có pending intent dùng lại key/body gốc và chặn hành động đối nghịch.
- Browser Expo web: request funding thật đã commit, proxy bỏ ACK và giữ GET
  snapshot cũ để mô phỏng đọc chưa cập nhật. UI vẫn có CTA nộp/cancel; bấm lại
  dùng **key khác**, backend trả **409**. Trạng thái thật đã funded.
- Web `exchange.ts:372–402` giữ intent khi mất mạng nhưng xóa cho mọi 4xx trừ
  IdempotencyConflict, bao gồm 429. Gọi module thật trên Vite: commit rồi mất ACK
  → pending true; retry cùng key gặp **429 tổng hợp, không tới API** → pending
  false; lần tiếp dùng key mới → backend **409**. Ledger có **1 payment journal**.
- Tác động: người dùng mắc ở kết quả không rõ, không lấy lại receipt cũ và có
  thể thấy hành động ngược khi dữ liệu còn cũ. **Chưa thấy trừ tiền hai lần**;
  backend đã từ chối lần funding lặp ở các ca thực chạy.
- Độ chắc chắn: **real command + fault injection xác nhận**. Stale GET, mất ACK
  và 429 là lỗi mạng/response được chủ động tạo; không báo provider tự phát lỗi.

### X07 — P2: nhãn cọc web đang dùng tổng tiền cần nộp

- `exchangeDetail.ts:92` tính `viewerFundingAmount = deposit + ownDiff`.
  `BookInfoCard/index.tsx:152–155` hiển thị số đó dưới nhãn “Tiền cọc bảo chứng”,
  rồi trình bày bù ở ô riêng và hứa hoàn lại 100% tiền cọc.
- Ca X02: cọc gốc 450.000 + bù 350.000 = cần nộp 800.000, UI ghi **cọc 800.000**
  và **bù 350.000**. Số tiền phải nộp là 800.000, không phải 1.150.000; sau hoàn
  tất khoản bù không có cùng nghĩa hoàn trả như cọc.
- Tác động: hiểu sai tiền sẽ bị giữ/hoàn và tiền chuyển cho đối tác. Độ chắc chắn:
  **adapter + browser screenshot xác nhận**; không phải double-charge backend.

## Ranh giới cố ý giữ và nghi vấn không nâng thành kết luận

- ADR0057: resolution mới bị chặn để giữ tiền/sách an toàn. Không tự làm tiếp
  decision/return/settlement hoặc coi test xanh là đóng gate người thật.
- GHN **đóng băng theo yêu cầu chủ dự án**. Chỉ đọc source:
  `exchange-actions-card.tsx:448–510` có catch tạo tracking ngẫu nhiên và thông
  báo “Tạo đơn GHN thành công!” khi request lỗi. Đây là hành vi fallback xác nhận
  từ code; **không gọi provider/không kiểm cấu hình/không sửa**. Không đưa việc
  thay GHN vào gói tiếp theo; nhóm sẽ quyết định riêng sau khi lên lớp.
- Carrier code/tracking/member tự khai không chứng minh custody. Chưa có bằng
  chứng giao nhận vật lý hoặc hai Shipment xuyên suốt theo mô hình mới của SRS.
- Không coi đề xuất legacy thiếu conversation là lỗi mới: ADR0041 có đường tương
  thích legacy. Không trộn whole-book-bundle với multi-listing Exchange.
- Chưa audit đầy đủ notification/deep link, hết trang danh sách, keyboard/
  TalkBack, native/ARM/iOS, Flutter, luồng Staff xử lý thật hoặc toàn bộ race.

## Kiểm chứng thực chạy và giới hạn

| Check | Kết quả | Môi trường/giới hạn |
| --- | --- | --- |
| API Nest build | PASS | Source khảo sát; không sửa production source |
| Exchange E2E chọn theo rủi ro | **9 PASS / 36 SKIP** | `apps/api/test/exchanges.e2e-spec.ts`, Mongo QA replica set; skip không là PASS |
| HTTP/Mongo probe các ca X01–X05 | **FAIL theo yêu cầu nghiệp vụ** | API thật, dữ liệu tổng hợp; lỗi nêu trên đã tái hiện; không sửa test để che lỗi |
| Web lịch sử và tiền ở desktop/390px | **FAIL X02/X07** | Vite Member web, dữ liệu từ API thật, ảnh/storage fake |
| Lost-ACK/retry web và RN Expo web | **FAIL X06** | API commit thật; fault injection; RN không phải native |
| Release/native/human/CI source mới | NOT RUN | Không mở gate hoặc suy từ CI main; không phải nghiệm thu toàn core |

E2E đã chọn full lifecycle, hai hạn kiểm tra/later receiver, LOCKED existing
obligations/revoked replay, multi-book, nonparticipant authorization, tranh chấp
đua worker, hết funding hạn và Staff/Admin tự xử lý. Pattern funding race dùng
tiếng Anh không khớp tên tiếng Việt nên **không nhận bằng chứng race funding**
từ lượt này. Không chạy lại toàn bộ harness không liên quan.

Lệnh: dùng `MONGO_TEST_URL` trỏ QA riêng và
`MONGO_E2E_DATABASE=latlai_exchange_core_audit_test`, rồi chạy pinned Vitest qua
`.tmp/run-pinned.mjs` với file `test/exchanges.e2e-spec.ts` và `-t` chọn các ca
trên. Build/probe logs, JSON kết quả và screenshot lưu cục bộ trong
`.tmp/exchange-core-audit/` (ignored, không phải artifact CI lâu dài).
Probe dùng fixture hiện hành ở `apps/admin-web/tests/test-api.mjs`, chỉ tạo
Member/sách/ảnh tổng hợp và ví simulator. Mail local, storage fake; không trả phí
AI/provider, không email người dùng. Không commit token, request body hoặc PII.

Cuối khảo sát: fixture DB ngẫu nhiên `ops_browser_*_test` tự dọn trong finally;
DB E2E `latlai_exchange_core_audit_test` và user/role riêng đã dọn. Đối soát còn
**0 QA database / 0 fixture user / 0 fixture role**; Docker `mongo-test` đã dừng.
Port API 3009, ảnh 3010, web 5194, Expo web 8087 và QA 57017 không còn listener.
Không khởi động/dừng/reset DB local chính. 28 file ngoài gói giữ nguyên checksum.
`pnpm docs:check` PASS. Diff-check hai file của gói PASS; diff-check toàn working
tree còn trailing whitespace ở `AccountMenu.module.css:109` thuộc thay đổi ngoài
gói, được giữ nguyên thay vì sửa ké.

## Đề xuất đúng ba gói tiếp theo, chưa triển khai

1. **Chốt thỏa thuận Exchange trước khi giữ sách** (X01/X02/X03).
   API/contract/Mongo và hai client: lưu revision/nội dung/giá được thỏa thuận,
   tái kiểm eligibility cả hai phía khi accept; không giữ một bên nếu sách đổi
   nội dung/ẩn/chờ duyệt/chủ không còn đủ điều kiện. Người dùng thấy đúng sách và
   đúng nghĩa vụ đã chấp thuận, lịch sử không trôi theo listing. Hoàn thành khi
   các regression trên, cạnh tranh reserve và retry revision đều đạt, contract
   sinh lại và UI đọc đúng snapshot. Cần nhóm quyết định quy tắc counter X03;
   nếu đổi schema thì migration mới, không sửa migration cũ. Có thể tự chuẩn bị
   và kiểm QA phần kỹ thuật sau duyệt; nhóm nghiệm thu nghiệp vụ/giá trị thực.
2. **Làm rõ tiền và phục hồi chính xác thao tác Member** (X06/X07).
   RN/web Exchange: giữ key/body khi kết quả chưa rõ kể cả 429/mất mạng/Back,
   chặn lệnh đối nghịch đến khi reconcile; tách cọc, bù và tổng tiền. Hoàn thành
   khi lost ACK + stale GET + retry cho cùng receipt/một journal, session đổi
   không lẫn intent, desktop/390px và native phù hợp. Có thể tự làm API/browser
   QA sau duyệt; human/native accessibility vẫn cần người và thiết bị thực.
   Phụ thuộc snapshot/contract gói 1 để không tiếp tục hiển thị giá sai.
3. **Thống nhất tiến độ và hạn giao nhận từng chiều** (X04/X05).
   API/worker/contract và RN/web: command và worker có cùng quy tắc quá hạn,
   không dùng việc cả hai khai gửi để thay thế trạng thái từng chiều. Người nhận
   biết sách nào đã tới và quyền kiểm tra/báo sự cố của mình. Hoàn thành khi các
   thứ tự một bên gửi/nhận trước, deadline race và dispute giữ tiền đều có test
   cùng UI đúng bước tiếp theo. Cần chốt mức hỗ trợ theo READINESS/ADR0057 và
   nguồn bằng chứng pickup/delivery; không mở settlement/return hoặc GHN để lấp
   khoảng trống. Tự làm được khảo sát/test/thiết kế kỹ thuật sau duyệt, nghiệm
   thu giao nhận vật lý và quyết định mở gate cần nhóm/người thật.

**Nên làm gói 1 trước**: giữ sách và nghĩa vụ tiền chỉ an toàn khi cả hai đang
chấp nhận đúng cùng một thỏa thuận hợp lệ; đây cũng là nền cho UI và giao nhận.
