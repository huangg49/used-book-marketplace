# Admin — bàn kiểm duyệt bài đăng

Ngày02/11/2026. Owner yêu cầu đánh giá và làm lại màn `/review/listings` sau khi
User1 gửi bài. Nhánh `codex/admin-listing-review-workspace`, base `cbc616f7`.
Không sửa Member web đang được Antigravity xử lý, contract, API, migration hoặc dữ liệu bài.

## Vấn đề và thay đổi

| Trước | Sau |
| --- | --- |
| Màn chào rất lớn dù đã có bài cần duyệt | Khi vào hàng chờ bài đăng, mở hồ sơ đầu tiên đã tải; Back chủ động vẫn giữ danh sách |
| Hàng chờ hẹp, chữ10–11px và không có ảnh nhận diện | Cột304px desktop, thumbnail từ private media API, tên sách14px, thông tin theo nhóm; co/ẩn hợp lý trên màn hẹp |
| Nội dung bị bó trong khung cố định, có khoảng trống vô ích | Canvas tận dụng chiều rộng của khu Admin, tách danh sách và hồ sơ trên nền giấy |
| Tên sách, giá, tình trạng nằm rải rác | Tiêu đề sách rõ và tóm tắt hình thức/tình trạng khai báo/giá/số ảnh từ revision thật |
| Điều kiện đầu sách dễ bị bỏ sót ở cuối | Cảnh báo ở đầu hồ sơ và exact deep link đến yêu cầu đầu sách cho Admin; Staff được chỉ rõ phải chờ Admin |
| Phiếu quyết định mang câu quảng bá, ít chỉ dẫn vì sao nút bị khóa | Tiêu đề tác vụ cụ thể, lý do chặn theo catalog/fulfillment/reference, checklist và confirm/recovery hiện có |
| Gallery nhỏ, thumbnail dễ thành một hàng lẻ | Ảnh lớn contain, grid4/8 ảnh theo không gian; giữ zoom/phím/khôi phục focus và kiểm tải bytes |

Giữ logo, wine/cream/paper và Be Vietnam Pro. Taste `framed-sheet`, seed916461391,
kind support; dùng giấy hồ sơ và ảnh từng bản sách làm đặc trưng. Sidebar đang có
giữ nguyên vì ngoài phạm vi, kể cả màu bão hòa trái với default của Taste. Không
thêm KPI, dữ liệu mẫu hoặc chỉ số tổng hàng chờ. Count vẫn là số hồ sơ đã tải.
Critique thực hiện trong cùng phiên theo lựa chọn trước đó của owner không cần
review thứ hai; không là đánh giá độc lập hoặc nghiệm thu người thật.

## Hành trình và bất biến

| Vai trò | Entry → thao tác | Kết quả và bước tiếp |
| --- | --- | --- |
| Admin/Staff ACTIVE | Menu Bài đăng sách → hồ sơ đầu tiên hoặc chọn hàng | Xem revision thật; polling không thay hồ sơ đang mở |
| Admin | Cảnh báo catalog → Mở yêu cầu đầu sách | Đúng catalog ID; giữ quy trình xác nhận độc lập trước khi duyệt bài |
| Staff | Xem bài có catalog chưa xác nhận | Thông báo chờ Admin; không cấp quyền catalog bằng UI |
| Người duyệt độc lập | Đọc ảnh/nội dung → đủ checklist → xác nhận | Chỉ báo đã lưu sau ACK; vẫn giữ key/body/version, reconcile và lý do từ chối |
| Người đang nhập | Chuyển hồ sơ/Back/đăng xuất | Leave guard hiện có; hủy rời giữ checklist/lý do, đồng ý rời mới bỏ form |

Queue thumbnail chỉ giúp nhận diện, không đánh dấu ảnh trong gallery đã đọc và
không tự tích checklist. Không đổi quyết định tiền/quyền hoặc duyệt hộ bài User1.

## Bằng chứng

- PASS worktree: Admin typecheck,228unit/34file, lint0error/2warning sẵn có ở
  auto-review-view, production build và bundle budget. Không thay source AI đó.
- PASS checkout ứng dụng đang dùng: typecheck và219unit/33file. Checkout này ở
  `f3291409` có UI chưa commit của teammate, khác worktree; chỉ áp các hunk UI review
  tương ứng, giữ các phần AI/contract chỉ có ở worktree khỏi bản local cũ.
- PASS browser mới10nhóm kiểm: real Nest/Mongo QA `*_test`, storage fake; entry tự
  mở, catalog gate, viewer/Escape/focus, dirty leave/cancel/retain, explicit Back,
  catalog deep link/confirm, hủy confirm không ghi, approve có ACK và đúng DB state,
  không nhảy hồ sơ sau queue invalidation, responsive1440/768/390 và0pageErrors.
  Runner: `apps/admin-web/tests/review-workspace.mjs`;
  `MONGO_TEST_URL` bắt buộc từ QA riêng theo START_HERE.
- PASS local read-only nghiệp vụ: Chromium, API3000/DB chính hiện có,8ảnh gallery
  và thumbnail thật tải được;1920/1440/768/390 không tràn ngang,0pageErrors. Login
  tạo session như bình thường; không gửi quyết định lên bài thật.
- Lượt baseline đầu chưa tải được ảnh trong browser; lần fetch riêng trả200WebP,
  sau đó browser hiển thị đủ ảnh. Có API watch reload trong khoảng khảo sát nhưng
  chưa chứng minh nguyên nhân ảnh trống; không nhận là lỗi storage đã được sửa.
- Detector chạy một lần exit0: chỉ advisory về type/radius so với brief chung;
  dùng scale riêng của màn vận hành dưới đây. Không đồng nghĩa không còn lỗi UX.
- QA kết thúc đã xác nhận0database/user/role của runner; API/Vite QA dừng và dừng
  đúng Mongo QA đã bật cho lượt này. App/Mongo chính giữ chạy. Dữ liệu preview QA
  cũ đã được lưu archive ở gói trước; lượt này không restore hoặc cleanup DB chính.

Artifact ignored: `.tmp/admin-review/` gồm baseline, ảnh sau, QA result, detector
và bản sao source trước khi áp UI vào checkout đang chạy. Không commit credential.

NOT RUN: native, human usability/acceptance, full legacy browser harness, remote CI.
Không push/PR/merge, không đổi READINESS. Shared catalog review dùng cùng CSS nên
đã đi qua QA confirm; không thiết kế lại toàn bộ shell hoặc các bàn vận hành khác.

## Sửa ảnh thumbnail tràn — phản hồi owner cùng ngày

Owner phát hiện thumbnail đè nhãn và phần tình trạng. Check không tràn ngang ở
lượt trước không chứng minh containment của từng ảnh; đây là lỗi đã bỏ sót.
Reproduce trên ảnh thật: ô64px nhưng ảnh đầu cao138px ở1920px; failed containment
ở1920/1600/1440/1100/390. Grid min-content sizing giữ ảnh cao hơn ô dù đã khai100%.

Đổi riêng khung thumbnail sang flex/border-box có chiều cao xác định, ảnh có min-size0,
max-size100%, contain và overflow được giới hạn trong button. Không cắt ảnh gốc,
không đổi storage hoặc dữ liệu bài. Caption vẫn nằm ngoài button, có khoảng cách.

PASS sau sửa trên app local đang dùng, ảnh Supabase thật:8/8ảnh nằm trong ô và
không đè caption/section tiếp ở1920/1600/1440/1100/768/390,0pageErrors. Chọn ảnh8,
mở viewer/Escape/khôi phục focus PASS. Helper đo geometry được thêm vào runner
QA để chặn tái phát; helper đã chạy trên đủ8ảnh local, full runner QA không chạy
lại cho CSS-only follow-up này. Syntax/diff/docs PASS. Evidence ignored:
`.tmp/admin-review/thumbnails-before.json`, `thumbnails-after.json` và ảnh tương ứng.

## Tân trang thứ bậc thông tin theo phản hồi owner

Owner chưa chấp nhận bản phẳng, yêu cầu nhấn nhá và chỉ rõ phải đọc gì. Phần này
thay cách trình bày ở đầu report, giữ nghiệp vụ và shell bên ngoài.

- Nhận diện sách/author/summary ghép thành vùng wine; giá24px vàng, tên28px trắng,
  metadata12px. Không thêm số liệu hoặc thông tin người bán chưa có trong contract.
- Gallery có nền và khung riêng, heading/icon18px; tab đang đọc có nền wine.
  Hàng được chọn và nút đọc có điểm nhấn. Giữ fix thumbnail containment.
- `ListingCondition.tsx` tách lời khai, mức tình trạng tự đánh giá và4nhóm ghi chú;
  mô tả đầy đủ có vùng riêng. Null vẫn là chưa khai báo; không biến lời khai thành
  xác minh hoặc tích hộ checklist. Metadata/description không bị viết lại.
- Phiếu quyết định có header wine, checked state rõ, progressbar từ số ô thực chọn;
  dirty guard, canApprove, photosReady, key/body/version và dialog ACK giữ nguyên.
- Responsive dựa thêm vào container980px, vì sidebar bên ngoài còn hiện ở tablet;
  không đè thay đổi navigation của teammate. Ở vùng hẹp chỉ hiện một khu làm việc.

PASS: worktree228unit, typecheck/lint0error (2warningAI cũ), production build/budget;
checkout app219unit/typecheck. Runner QA mới11nhóm PASS, real Nest/Mongo test+fake
storage, gồm geometry thumbnail và progress1→0 khi chuyển hồ sơ; fixture DB/user/
role còn0, API/Vite QA dừng và Mongo QA được dừng sau lượt thử.

PASS browser local đọc nghiệp vụ: đủ8ảnh thật,1920/1440/768/390 không tràn ngang;
geometry8/8/caption/section ở6độ rộng390–1920 và viewer/Escape/focus PASS0pageErrors.
User1 DB chính vẫn PendingReview. Một lượt capture gặp API đang reload; thử lại
khi API trả401/CORS đúng thì PASS, không sửa auth/config hoặc kết luận nguyên nhân
khác. Detector1lần exit0 với17advisory type/radius; scope mới ghi DESIGN, không chạy
lại để lấy0finding. Artifact mới `refresh-confirm-*`, QA result và refresh-detector
trong `.tmp/admin-review/`. Human UX/native/remote CI NOT RUN; chưa push/merge.

## Tinh chỉnh riêng phần đối chiếu đầu sách

Owner chỉ định phần dưới của hồ sơ. Bỏ tiêu đề phụ lặp và khung trắng lồng khung;
giữ một disclosure. `BookReferenceCard.tsx` trình bày tên/tác giả/trạng thái rõ,
chia xuất bản và phân loại/mã sách thành hai cột, về một cột theo bề rộng khung.
Giữ category chuẩn, series và attributes khi có. Ngôn ngữ hiển thị nhãn đọc được,
kèm mã khi cần; ISBN/năm/ấn bản null là chưa cung cấp, không tự khẳng định không có.
Cảnh báo chuyển thành dòng ngắn với link Xem yêu cầu chỉ cho Admin.

Giữ nguyên queryKey/enabled, callback onReady, current permissions và điều kiện
canApprove. Không sửa shared MetadataView hoặc các trang catalog khác. Summary
native giữ Space/Enter, icon xoay theo open state và policy motion hiện hành.

PASS typecheck ở worktree/app,228unit, lint0error/2warningAI cũ, build/budget;
QA11nhóm real Nest/Mongo test+fake storage PASS, gồm catalog confirm→approval.
Live read-only nghiệp vụ1920/1440/768/390 không tràn ngang, link đúng catalog ID,
Space đóng/Enter mở lại PASS0pageErrors. Snapshot `reference-*.png` và
`reference-live-result.json` trong `.tmp/admin-review/`. QA database/user/role còn0,
đã dừng Mongo QA do lượt này bật. Detector1lần exit0,15advisory type/radius; không
coi đó là usability acceptance. Không ghi quyết định vào DB chính/push/merge.

## Chốt vùng cuộn theo yêu cầu owner

Source kiểm tra: worktree `codex/admin-listing-review-workspace`, HEAD `cbc616f7`
cộng diff UI chưa commit; checkout ứng dụng local HEAD `f3291409` chỉ nhận các
hunk tương thích trong queue/detail/CSS sau khi đối chiếu baseline. Không thay
shell, App.css hoặc Member web đang được teammate sửa.

- Route kiểm duyệt chiếm viewport; menu và heading trang giữ nguyên vị trí.
  Bỏ cạnh tranh giữa cuộn document và các cột sticky. Các ancestor flex/grid
  có min-height0 để thực sự nhường chỗ cho vùng làm việc.
- Queue cuộn toàn bộ trong khung, gồm bộ lọc; không để header/filter ép danh sách
  xuống0px ở cửa sổ thấp. Giữ cache vị trí theo người dùng/loại/trạng thái/filter.
- Desktop: reader và phiếu quyết định có cùng ranh giới trên/dưới, tự cuộn và
  chặn wheel chaining. Không có thanh cuộn dossier thứ hai. Phần nhận diện sách
  đi cùng nội dung đọc, còn heading trang đứng yên.
- Dossier dưới740px: một vùng cuộn chứa nội dung và phiếu, không lồng hai vùng
  cuộn. Mở hàng chờ chuyển sang một pane; nút tới phiếu chỉ cuộn đúng dossier.
- Chuyển hồ sơ reset reader/phiếu về đầu; hủy rời hồ sơ giữ vị trí và form.
  Các vùng cuộn có tên và nhận focus để dùng PageDown; viewer/disclosure/guard
  và xác nhận quyết định vẫn hoạt động. Không đổi điều kiện duyệt/API/storage.

PASS:228unit/34file, typecheck, lint0error/2warning AI có trước, build/budget exit0;
checkout app typecheck PASS. Browser QA12nhóm, real Nest/Mongo replica set riêng
`*_test`+storage fake; gồm wheel/keyboard/boundary, đổi pane, cửa sổ thấp, hủy rời/
đổi hồ sơ, xác nhận đầu sách và duyệt listing QA. Lượt test vị trí ban đầu đọc DOM
cũ ngay sau URL đổi; đã đợi đúng mã hồ sơ mới trước khi kiểm, không bỏ assertion.
Teardown fixture hoàn tất exit0, API/Vite QA không còn listener; Mongo QA do lượt
này bật đã dừng. Kiểm kê metadata QA độc lập không hoàn tất trước khi dừng, nên
không ghi nhận kết quả count0 từ lượt kiểm kê đó.

PASS đọc nghiệp vụ local, đủ8ảnh Supabase thật,0pageErrors:
1920×1080,1440×900,1100×900,768×1024,390×844,1920×600,390×500. Document không
cuộn/tràn ngang; hai pane desktop cùng top/bottom, dossier không có overflow thừa;
wheel/PageDown không kéo heading hay pane bên cạnh. Space/Enter disclosure PASS.
User1 DB chính vẫn PendingReview; không gửi quyết định bằng account thật.
Evidence ignored: `scroll-live-result.json`, `scroll-*.png`, `qa/result.json`,
`scroll-qa.private.log`, `scroll-build.log` trong `.tmp/admin-review/`.
Detector1lần exit0 với advisory type/radius thuộc brief đã ghi; không là human UX
acceptance. Native/human/remote CI NOT RUN. Chưa push/merge, không đóng READINESS.

## Đồng bộ typography khối giá

Owner duyệt làm cùng cỡ chữ cho Hình thức/Giá bán/Giá trị đổi. Thêm scope
`trade-facts`: giá trị16px và căn baseline, mode600/ink, tiền700/wine, null400/muted.
Null nhận class riêng thay vì price; giữ nguyên formatter/giá/dữ liệu nghiệp vụ.
Áp đúng hunk vào app local; không đổi MetadataView hoặc các khối facts khác.
PASS typecheck hai checkout; browser local1920/768/390 xác nhận cả3giá trị16px,
cùng cột, weight600/700/400, không tràn ngang,0pageErrors; xem ảnh desktop/mobile.
Evidence ignored `trade-type-*.png`, `trade-type-result.json`; detector1lần exit0
(advisory type/radius). Không chạy lại harness ghi DB cho thay đổi trình bày này.

## Lý do khóa nút nằm ngay cạnh hành động

Owner đã tích6mục nhưng không thấy vì sao chưa duyệt được. Cảnh báo cũ có ở đầu
phiếu, nhưng bị khuất khi cuộn xuống. `decision-form.tsx` chuyển prerequisite
message xuống ngay trước các nút; có heading Chưa thể duyệt bài đăng, status
động và aria-describedby nối vào nút. Thông báo nêu catalog/fulfillment/reference
hoặc thiếu ảnh theo điều kiện thực; chưa thay ready/canApprove/checklist/command.
Không lấn thông báo phục hồi khi command chưa xác định kết quả.

Admin có Xem yêu cầu đầu sách tới đúng ID; Staff được báo cần Admin xác nhận và
không có link thao tác. Link vẫn đi qua dirty guard, hủy rời giữ đủ6check/lý do.
Phân biệt đầu sách chưa xác nhận với đã từ chối. Điều kiện catalog được xác nhận
và ảnh/reference tải thành công vẫn bắt buộc dù checklist đủ.

QA mới phát hiện Staff gửi3request đọc private catalog qua `ListingTitle`, dù
`BookReference` đã có guard. Endpoint nguồn chỉ cho ADMIN ở catalog.controller.ts.
Đã thêm capability cho Title từ queue/detail/NextReview; key tách quyền đọc và
không render private metadata khi thiếu quyền, kể cả cache bị điền sẵn. Giữ title
public cho đầu sách Confirmed và fallback rõ cho Staff với đầu sách chưa xác nhận.
Không đổi API/quyền backend hoặc biến cache thành nguồn cấp quyền.

PASS229unit/34file (thêm negative cache test), typecheck hai checkout, lint0error/
2warning AI cũ, build/budget. Browser QA14nhóm real Nest/Mongo replica set test+
fake storage:6tick vẫn disabled, status/link/description sát nút ở1920/1440/390,
dirty cancel giữ check; Staff không có link/private request, catalog confirm→
listing approval vẫn ACK thật trong DB QA, gate biến mất khi đủ điều kiện.
Teardown hoàn tất; kiểm kê độc lập0fixture DB/user/role trước khi dừng Mongo QA.

Live read-only với đủ8ảnh thật: cảnh báo cách nút20px và cùng viewport ở cả3size,
6checkbox tick nhưng nút vẫn disabled,0pageErrors. User1 vẫn PendingReview; không
gửi quyết định trên DB chính. Chỉ áp các hunk tương thích vào checkout ứng dụng,
giữ focus styles textarea/input do teammate sửa; không chép file CSS đè chúng.
Evidence ignored `approval-gate-*.png`, `approval-gate-live-result.json`, QA/build/
detector logs. Detector1lần exit0/advisory type/radius; không là human acceptance.
Native/remote CI NOT RUN; chưa push/merge hoặc đóng READINESS.
