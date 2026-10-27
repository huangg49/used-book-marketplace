# Use case, truy vết và demo SRS 1.1

> Checklist đặc tả tại mốc 26–27/09/2026. Các nhãn **chưa chạy**/Planned và số ca
> bên dưới là tình trạng lúc lập tài liệu, không là bảng nghiệm thu hiện tại.
> Main đã bổ sung auction/point Order; đối chiếu evidence theo source và
> [SESSION_STATE](../handoff/SESSION_STATE.md)/[READINESS](../handoff/READINESS.md).

Ngày 26/09/2026. Đọc cùng [nghiệp vụ](LOCAL_HANDOVER_AUCTION.md), [thiết kế logic](LOCAL_TRANSACTION_DESIGN.md)
và [SRS 1.1](../SRS_V1_1.md). Tất cả AC-H/AC-AU dưới đây là **chưa chạy**.
42 E2E API hiện có không được dùng làm bằng chứng rằng point/auction đã hoàn thành.

Cập nhật 27/09/2026: listing có114 API E2E theo báo cáo riêng; AC-H/AC-AU vẫn chưa
chạy. [32 ca cam kết CM-AC](COMMITMENT_ACCEPTANCE.md) bổ sung kiểm tra reservation,
deadline và race trước các workflow ở đây; CM-AC cũng đang Planned.

## 1. Use case bổ sung

| Mã | Actor, trigger và tiền điều kiện | Luồng chính | Ngoại lệ / hậu điều kiện |
|---|---|---|---|
| UC-H01 | Admin quản lý vùng/điểm; có quyền hiện hành | Tạo hai record demo, giờ/capacity, phân Staff, Active/Paused | Không Closed khi còn sách; không gỡ người phụ trách cuối khi chưa bàn giao nghĩa vụ; có audit |
| UC-H02 | Member chọn ViaPoint, listing đủ điều kiện | Chọn điểm chung và từng chặng, thấy phí/cọc, xác nhận snapshot; giữ 1/2 slot và listing atomically | Ngoài vùng/điểm đầy/không giao nhau → không tạo giao dịch dở; Proposed chưa giữ |
| UC-H03 | Staff được phân công, booking đã đủ funding hoặc auction intake | Đối chiếu người giao/kiện/listing, nhận, chụp ảnh, gắn mã kệ, tạo receipt | Sai điểm/booking, đến muộn, carrier mâu thuẫn → incident; receipt không được tạo bằng carrier Delivered |
| UC-H04 | Staff độc lập kiểm tra sách đã nhận | Checklist + ảnh + report revision, Pass/Fail/NeedsEvidence | Quá hạn không Pass; nghi giả yêu cầu chứng cứ; Fail không sửa snapshot giao dịch |
| UC-H05 | Recipient có Pass và quyền xem | Xem report/kiểm tra tại quầy, chấp nhận đúng phiên bản; Exchange chờ cả hai acceptance | Từ chối/no-show mở xử lý, không mặc định đồng ý; chưa release thì sách vẫn ở điểm |
| UC-H06 | Staff bàn giao, Recipient có ReleaseAuthorized | Recipient tạo mã, Staff xác nhận đúng sách/điểm; hoặc carrier pickup đúng leg; lưu custody | Mã sai/hết hạn/lặp, claim/role revoke → không giao; nhận cuối mới mở 72h |
| UC-H07 | Staff/Admin xử lý quá hạn/return/incident | Giữ tiền/release, xác định custody/lỗi/nguồn, return hoặc allocation, đóng khi thực thi xong | Quỹ thiếu ghi outstanding; không tịch thu sách không đến lấy; pre-auction cũng có hồ sơ |
| UC-AU01 | Seller có Sale Approved tại TP.HCM | Snapshot start/step/buyNow/điểm, giữ listing/slot; nhận/Pass tại điểm; mở24h | Intake lỗi không mở; không tự duyệt; listing không còn mua/đổi thường |
| UC-AU02 | Bidder đủ điều kiện thấy Active còn hạn | Chọn nhận/ship, manual hoặc Auto max, xác nhận cam kết; tính leader/price/sequence | Bid thấp/sai lưới/tự bid/sai quyền → từ chối; không lộ max; retry không trả thêm |
| UC-AU03 | Buyer chọn BuyNow trước bid đầu | Atomically đóng bid, chuyển commitment/slot sang một Order, chờ trả15phút | Bid thắng trước thì mất BuyNow; thanh toán lỗi/hết hạn không reopen |
| UC-AU04 | Server đến endAt | Chặn bid, close một lần, tạo Order giá thắng, chờ trả24h hoặc Unsold | Tie theo sequence; mất eligibility → OnHold/Cancelled; không chọn runner-up |
| UC-AU05 | Người thắng thanh toán hoặc bỏ hạn | Đủ tiền → Order ViaPoint dùng report/slot cũ, recipient acceptance và giao nhận | Chưa đủ tiền không tự nạp/charge; hết hạn → PaymentExpired, reclaim, không bán lại khi còn custody |

UC-03/05/06/07/08 của SRS tiếp tục cho luồng DirectDelivery. ViaPoint đi qua UC-H02–07;
auction dùng UC-AU01–05 rồi quay về UC-H05–07 và Order settlement/dispute hiện hữu.

## 2. Ma trận nghiệm thu và truy vết

| Mã | FR liên quan | Ca thực hiện và kết quả kỳ vọng |
|---|---|---|
| AC-H01 | FR-H06 | Guest ngoài vùng xem được; tạo giao dịch có một địa chỉ ngoài HCM-DEMO-v1 bị chặn phía server, không giữ tiền/sách |
| AC-H02 | FR-H04, FR-H06 | Hai điểm có nhãn mô phỏng, giờ, capacity; không hiển thị tọa độ/cơ sở đối tác bịa; không dùng IP để chặn |
| AC-H03 | FR-H04, FR-H05 | Hai request lấy slot cuối: đúng một thành công; accept Exchange thiếu hai slot không giữ một cuốn |
| AC-H04 | FR-H04 | Paused không nhận booking mới nhưng xử lý booking cũ; Closed/capacity giảm dưới usage bị chặn |
| AC-H05 | FR-H06 | Buyer chỉ chọn điểm Seller chấp nhận; Exchange giao hai danh sách rỗng thì không chốt; chấp nhận revision cũ bị conflict |
| AC-H06 | FR-H01, FR-H02 | Order direct P200k/S30k: Buyer230k hold, Seller ứng30k, cuối Seller220k, nền tảng10k; không thu carrier hai lần |
| AC-H07 | FR-H01, FR-H02 | Order via point hai ship: nguồn260k, đích Seller190k/carrier60k/platform10k; self/self phí ship0 |
| AC-H08 | FR-H01, FR-H02 | Exchange A self→ship, B ship→self: mỗi người30k ngoài cọc/Δ; cùng funding không gộp phí vào deposit |
| AC-H09 | FR-H02, FR-H03 | Pickup và hủy cạnh tranh: fee được capture hoặc refund đúng một lần; không available âm; chặng return có nguồn riêng |
| AC-H10 | FR-H07 | Carrier Delivered tới điểm chưa thành StaffReceived; chỉ staff receipt đúng booking mới chuyển custody và bắt đầu SLA kiểm tra |
| AC-H11 | FR-H04, FR-H07 | Staff sai điểm, tự nhận sách mình, Admin thiếu assignment hoặc assignment bị thu hồi giữa guard/commit đều bị chặn |
| AC-H12 | FR-T01, FR-T02 | Pass có checklist/ảnh/thời điểm; nhãn đúng phạm vi, ISBN hợp lệ không sinh nhãn chính hãng; evidence private không rò |
| AC-H13 | FR-T02, FR-H08 | Nghi giả → NeedsEvidence, quá48h không đủ → xử lý từ chối; không tự ghi vi phạm counterfeit chỉ vì thiếu hóa đơn |
| AC-H14 | FR-H08 | Sách sai mô tả → không bàn giao; không sửa snapshot để qua kiểm tra; report mới giữ lịch sử và vô hiệu release cũ |
| AC-H15 | FR-H09, FR-H10 | Chỉ một sách Exchange tới/Pass hoặc chỉ một acceptance → không release bất kỳ cuốn nào |
| AC-H16 | FR-H10, FR-T03 | Sau barrier, A nhận trước/B nhận sau: mỗi bên có72h riêng; aggregate ViaPoint còn Fulfilling khi mới A nhận, cả hai mới Inspection; không hoàn hai cọc theo mốc nhận A |
| AC-H17 | FR-H11 | Mã sai/đúng điểm khác/hết10phút/đã dùng bị chặn; lần sai thứ6 trong15phút bị rate limit; không có mã trong log |
| AC-H18 | FR-H11, FR-T03 | Mất mạng sau commit handover, retry key trả receipt cũ; một custody event; nhận tại quầy mới mở72h, không phải lúc Pass |
| AC-H19 | FR-H09, FR-H12 | No-show/hủy: sách còn ở điểm thì listing không Available; quá14ngày mở Admin task, không tự bán/tịch thu |
| AC-H20 | FR-H12 | Outbound giữ slot tới hết nghĩa vụ để có chỗ return; chuyển Auction→Order không tăng slot; cleanup không giải phóng slot đang InTransit |
| AC-H21 | FR-T04 | Mất sách pre-auction vẫn tạo incident; hoàn BuyerHold nếu đã có Buyer và bồi thường chủ từ quỹ theo giá bảo vệ; không chi trùng sale proceeds |
| AC-H22 | FR-T04 | Hai allocations cạnh tranh quỹ cuối: không chi vượt nguồn; phần chưa trả không Closed, point Paused nhận mới; carrier bồi thường muộn đối soát lossReference |
| AC-H23 | FR-H11, FR-T03 | Claim hợp lệ và handover/settlement cùng lúc: khóa xác định kết quả; claim thắng trước chặn release, không bỏ quyền vì đã bấm chấp nhận report |
| AC-H24 | FR-H01, FR-H04 | Đổi địa chỉ/điểm/phương thức sau chốt không âm thầm sửa phí; before pickup hủy/tạo lại an toàn, after custody qua hỗ trợ |
| AC-AU01 | FR-AU01, FR-AU02 | ADR0048: sách lẻ Marketplace Sale/Both/Exchange đủ điều kiện hoặc Auction cũ được intake, giữ nguyên channel/revision/giá; bundle/khác chủ/ảnh chưa sẵn sàng/catalog chưa Confirmed/bài không đủ điều kiện bị chặn. Chưa nhận hoặc report không Pass không mở; tự kiểm tra bị chặn |
| AC-AU02 | FR-AU01, FR-H05 | Auction intake cạnh tranh checkout/Exchange: một commitment; không gap khi chuyển sang Order; không bán thường khi đang auction |
| AC-AU03 | FR-AU03, FR-AU04 | start200k, step50k, A Auto400k, B250/350/450k → giá200/300/400/450k; leader A/A/A/B |
| AC-AU04 | FR-AU03, FR-AU04 | Một manual300k → giá300k; một Auto400k → giá200k; manual nhảy nhiều bước không bị đổi thành bid thấp hơn |
| AC-AU05 | FR-AU04, FR-AU10 | Hai Auto cùng400k: sequence đạt400k sớm hơn thắng400k; request lặp không đổi priority; Seller/Guest không thấy trần |
| AC-AU06 | FR-AU03, FR-AU05 | Giá sai lưới/trần>1m/hạ max bị chặn; tăng max đang dẫn không tự nâng price; tắt Auto giữ nghĩa vụ đang dẫn và không giảm giá |
| AC-AU07 | FR-AU06 | Bid đầu và BuyNow cạnh tranh: một bên thắng; BuyNow timeout không reopen; hai BuyNow cùng đến không tạo hai Order |
| AC-AU08 | FR-AU07 | T−1ms nhận bid, T=endAt từ chối dù worker trễ; close lặp chỉ một outcome/Order; không bid→Unsold |
| AC-AU09 | FR-AU07, FR-AU08 | Winner trả trước hạn thành công; đúng hạn hết quyền; thiếu tiền/hết hạn→PaymentExpired, không charge/runner-up/auto-relist |
| AC-AU10 | FR-AU02, FR-AU09 | Seller hủy trước bid được; sau bid bị chặn; participant mất eligibility trước close→OnHold và quyết định độc lập, không âm thầm đổi winner |
| AC-AU11 | FR-AU09, FR-AU10 | Self-bid, Staff xử lý sách bid, account khác đọc max hoặc vượt quota bị chặn; role/session đổi giữa guard và transaction được kiểm lại |
| AC-AU12 | FR-AU05, FR-AU10 | Đóng app/mất SSE vẫn Auto server; tắt Auto và bid đối thủ đồng thời có một thứ tự hợp lệ; reload GET khôi phục kết quả |
| AC-AU13 | FR-AU07, FR-AU10 | Worker crash/retry/khởi động lại và user payment đồng thời: một Order, một journal; endAt+24h không phụ thuộc worker chạy lúc nào |
| AC-AU14 | FR-AU08, FR-H12 | Unsold/PaymentExpired/Cancelled vẫn giữ sách khỏi kệ cho tới reclaim; lấy lại xong mới được tạo auction intake mới |

Tất cả race test kiểm tra cả response và DB/ledger/custody sau commit. Đồng hồ có
thể điều khiển trong test; không đổi timestamp production để diễn. Kế hoạch chạy
riêng DB `_test` và object namespace; không coi seed SQL thay nghiệp vụ đã implement.

## 3. Bộ dữ liệu demo

- HCM-DEMO-01/02: hai điểm, mỗi điểm20 slots, 09–18h, địa chỉ mô phỏng/không tọa độ.
- M1/M2/M3: MEMBER verified ACTIVE; MR restricted; Admin A1/A2 độc lập.
- S1/S2 phụ trách điểm A; S3 phụ trách điểm B; S1 có MEMBER để thử cấm tự xử lý.
- T1 TEST_OPERATOR chỉ simulator; không có quyền inspection/ledger adjustment.
- B1 mua200k; B2/B3 đổi100k/300k; B4 đấu start200k step50k buyNow600k; B5 sai mô tả.
- Wallet fixture M1/M2/M3 mỗi2m, Seller đủ phí ứng; quỹ incident2m; mọi nguồn mở đầu
  có journal qua seed/test fixture có nhãn, không tạo tiền bằng admin edit số dư.
- Một số cuốn sách thật có thể đặt ở bàn demo được phép dùng; ảnh/bằng chứng có quyền
  sử dụng. Không gắn địa chỉ/SĐT/ngân hàng cá nhân thật vào dataset công khai.

## 4. Kịch bản trình diễn

| Mã | Thao tác | Điều cần chứng minh |
|---|---|---|
| DEMO-01 | M1 bán B1, M2 chọn điểm A và self-collect; trả tiền → S1 nhận/Pass → M2 xem và chấp nhận → mã nhận → hết inspection → settlement | Điểm/Staff/recipient đúng quyền; nhận khác Completed; ledger cân bằng |
| DEMO-02 | M1/M2 đổi B2/B3; funding; mới B2 tới rồi thử giao; B3 đến/Pass; hai acceptance; hai lần nhận | Không release một nửa; cọc/Δ/phí tách; hai inspection windows |
| DEMO-03 | B5 đến sai mô tả hoặc nghi bản sao; Staff Fail/NeedsEvidence; người mua mở claim; return | Không nhãn chính hãng giả, không sửa snapshot, không trả tiền giả |
| DEMO-04 | Seller gửi B4/Pass, mở auction; A Auto400k, B manual250k rồi450k; close → thanh toán → nhận tại điểm | Auto trần riêng, price đúng, một winner/Order; Seller không thấy max |
| DEMO-05 | Phiên khác BuyNow cùng bid đầu; hoặc winner không trả; thử mua lại sách chưa reclaim | Một kết quả cạnh tranh; thất bại vẫn giữ custody/commitment hợp lệ |
| DEMO-06 | Order direct ship và Order via point ship: phát pickup/delivered lặp; incident mất tại điểm thiếu quỹ | Ship còn tồn tại, phí không thu đôi, không chi vượt quỹ |

Đến hạn trong demo dùng môi trường test clock/fixture thời gian có nhãn, không
biến 24giờ production thành10giây ngầm. Mọi case có expected, actual, evidence và
phiên bản chạy; chỉ điền Passed sau thực chạy. Bộ v1.0 và LS-AC vẫn cần nghiệm thu
phần còn áp dụng, không được thay bằng sáu demo happy-path.
