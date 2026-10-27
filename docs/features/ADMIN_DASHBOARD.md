# Dashboard vận hành Lật lại —27/10/2026

Owner yêu cầu Dashboard có biểu đồ thật, đẹp và mang vibe Lật lại; đã chọn phạm
vi xu hướng7/30ngày và cho phép thêm API thống kê. Nhánh local `codex/admin-ui-refactor`,
base `d3b19e5`; chưa commit/push, không đóng gate release.

## Thiết kế và cách đọc

Nền kem, paper panels, chữ Auth Bricolage/Be Vietnam Pro và mảng wine cho hàng
chờ; giữ logo/sidebar đã duyệt. Ba số tổng ở một dải ruled, không tám card lặp.
Biểu đồ chính là nhịp kiểm duyệt: gửi duyệt nét đứt/tông control, đã xử lý nét
liền/wine, ngày TP.HCM, trục số nguyên bắt đầu0. Không smoothing, tỷ lệ tăng giả,
doanh thu hoặc số tài khoản trang đầu. Cơ sở chọn line/bar:
[NN/G](https://www.nngroup.com/articles/dashboards-preattentive/),
[Highcharts](https://www.highcharts.com/blog/best-practices/line-chart-vs-bar-chart-choosing-the-right-one-for-your-objectives-and-data/).
Đây là lựa chọn thiết kế của gói, không nghiên cứu định lượng riêng cho Lật lại.

- 7/30ngày áp dụng dải lượt gửi/xử lý và biểu đồ; số đang chờ là hiện tại,
  không phải tồn tại đầu/cuối kỳ. Filter loại hồ sơ trong figure chỉ lọc biểu đồ;
  dải số liệu tổng và hai link hàng chờ vẫn là tổng theo quyền.
- Menu loại hồ sơ dùng ScopeFilter combobox/listbox: nền giấy, selected wine/
  cream và dấu tick, hover nền shelf; trigger underline giữ như bản đã duyệt.
  Các mục44px, Esc/click ngoài hủy lựa chọn đang duyệt, Enter/Space/Tab xác nhận;
  có Arrow/Home/End và typeahead gõ không dấu. DOM focus ở trigger với
  aria-activedescendant, tham khảo [WAI-ARIA select-only](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/).
  CUA đã kiểm keyboard/click và mobile320; chưa nghiệm thu screen reader thật.
- Owner yêu cầu cụm nút thanh lịch hơn27/10: period dạng text với underline
  wine2px, không nền đỏ đặc/khung kép; refresh nền paper/border1px/no shadow,
  icon16px/stroke1.5. Focus riêng và target44px, gap/width giữ đủ cho mobile từ
  source CSS. Busy dùng một spinner sẵn có, không lặp thêm icon refresh trong
  label. Giữ aria-pressed, disabled/aria-busy, query7/30 và refetch hiện có.
- Có readout theo ngày, nút ngày trước/sau44px, bảng đầy đủ trong disclosure.
  Phân biệt hai series bằng màu và kiểu nét; zero giữ0, lỗi hiển thị lỗi/giữ
  snapshot cũ có nhãn, không giả rỗng. Query7/30 riêng, không gắn nhãn30 cho dữ liệu7.
- Hàng chờ có link bài đăng và đầu sách theo quyền. Kệ giữ sách/preview/motion
  hiện có; khi rỗng chỉ một hàng gọn, có refresh/link bài đã duyệt.
- Việc tại điểm là các hàng compact theo danh sách được phép đọc; không tự coi
  mọi hồ sơ là quá hạn. Sức chứa là heldSlots/capacity, giữ0 thật và trạng thái điểm.
- Mobile: số liệu thành hàng, chart đo bề rộng thực qua ResizeObserver, giảm số
  tick ngày; bảng số liệu có vùng cuộn riêng. Nét chuyển380ms khi cùng domain ngày/
  scale; domain/scale mới hiện đúng nét mới320ms, không nối ngày khác nhau. Resize
  hoặc refetch không đổi số liệu không phát lại. Dừng ngoài viewport/tab ẩn/blur,
  giữ hình cuối đúng; giữ motion theo owner dù reduced-motion. Chi tiết và QA gói
  motion ở [motion study](../design/ADMIN_MOTION_STUDY.md).
- Nhánh Test Operator chỉ có vận hành mô phỏng, không gọi thống kê kiểm duyệt.
  Staff không có chart catalog hoặc sức chứa/quyền Admin. Không tạo token store.

## Tinh chỉnh cụm dưới Dashboard —27/10/2026

Theo screenshot owner: empty shelf chuyển thành dải paper có dấu logo gốc,
copy rõ và CTA xem bài đã duyệt/cập nhật có thứ bậc; không báo “đã xử lý hết”
từ một trang rỗng. Hai vùng việc/sức chứa dùng chung mặt giấy chia rule mảnh,
việc là link cả hàng với icon/note sẵn có, số0 trung tính và số dương wine.
Chỉ đổi trình bày, không đổi tập nguồn/quyền/session/API. Trên màn nhỏ, giữ
thứ tự việc→sức chứa; tên dài wrap, số không co, target≥44px từ source CSS.

`PointCapacity` nhóm tên/trạng thái và heldSlots/capacity vào một record, thay
track dày bằng divisions SVG theo tỷ lệ thật. Với capacity≤40, một vạch/chỗ;
capacity lớn chia tối đa40vạch để giới hạn DOM, clip vẫn đúng tỷ lệ. Số0 không
có vạch wine; quá sức chứa vẫn in số thật/cảnh báo, hình giới hạn100%. Không
vẽ thêm số đang giữ giả để làm đẹp empty state.
Owner yêu cầu thêm màu cho một vùng27/10: riêng capacity dùng mint55%/paper45%,
caption và divider pha ink/mint để cùng hue và đủ tương phản. Số wine giữ
nguyên; CTA Quản lý điểm dùng xanh trầm exchange-ink #254337 có sẵn trong DESIGN,
hover3D cùng tông/cạnh đậm/chữ cream, focus/press theo màu mới. Panel việc/kệ
trống không đổi màu. Scoped CSS variables trong capacity,
không đổi dữ liệu hoặc đánh đồng màu nền với tình trạng hoạt động của điểm.

Owner yêu cầu hover nổi3D rõ hơn cho hàng công việc và link Quản lý điểm: nền wine,
chữ/icon/count cream, bo2px, mặt thẻ nâng6px/nghiêngX3° với perspective900px trong
260ms, cạnh dưới dày6px và bóng đổ mềm. Inner actionFace gồm cả chữ/icon chuyển
cùng mặt thẻ; anchor/hitbox đứng yên, face pointer-events:none để không đẩy vùng
bấm theo đồ họa. Khi nhấn, mặt thẻ lún còn1px/cạnh1px trong100ms. Solid edge chỉ
diễn tả độ dày3D owner yêu cầu, không áp shadow khối cho phần khác. Bỏ gạch chân
và arrow shift cũ. Fine-pointer hover, keyboard
focus-visible và touch active/press có phản hồi; OS motion preference giữ authored
timing theo owner. Các record sức chứa chỉ đọc không thêm affordance click.
Thay đổi CSS scoped + wrapper trình bày trong link, không thêm listener/loop/
dependency/test phản chiếu CSS. Lượt3D:26tests Dashboard/4files, lint/typecheck/
build/budget/docs/diff PASS; visual runtime vẫn NOT RUN vì browser disabled.
Owner tiếp tục yêu cầu hai link trong workboard đỏ nổi thành khối vàng: cùng
actionFace3D, mặt shop-yellow/chữ wine, cạnh vàng pha wine và focus ring vàng;
giữ số/route/quyền, hitbox cố định. CSS variables scope màu riêng workLinks,
không đổi hàng công việc đỏ hoặc record sức chứa. Hover fine-pointer, keyboard
focus và press dùng cùng semantics; browser QA vẫn NOT RUN do quyền đang tắt.

Admin162tests/21files (3test mới cho zero/tỷ lệ nhóm/over-capacity), lint/
typecheck/build/budget PASS. Layout assessment độc lập từ screenshot/source
và detector layout trước/sau sửa0findings; không xem đó là bằng chứng đẹp/QA render.
Browser vẫn bị tắt trong Work settings, visual/responsive/keyboard runtime
sau thay đổi NOT RUN; không dùng phương thức khác vượt quyền. Môi trường QA
không bật thêm; main health/login/queues/overview trả200. Chưa commit/push.

## Contract và dữ liệu

OpenAPI0.52.0: GET `/operations/moderation-overview?days=7|30`, schema
`ModerationOverview`. Controller STAFF/ADMIN; service `MongoCommandService.read`
kiểm tài khoản/quyền hiện tại trong transaction, trả một snapshot có serverTime.
Staff thiếu ADMIN: catalog=null, không query collection catalog. Không trả PII,
reviewerId, lý do từ chối hay tiền. Response no-store theo middleware hiện có.

Mỗi ngày gồm số revision đã gửi theo submittedAt và quyết định theo decidedAt;
resubmit là lượt mới. Lịch sử vẫn tính khi bài sau đó bị gỡ; không suy lịch sử
từ trạng thái hiện tại. Ngày trống được điền0; mốc đầu gồm đủ ngày địa phương,
mốc cuối là serverTime, loại timestamp tương lai. Pending listings khớp queue:
không deleted/Removed và current revision đã gửi. Pending catalog là status Pending.
Pending độc lập kỳ thống kê; không dùng độ dài trang20 làm tổng.

Migration mới `0037-moderation-overview-indexes` thêm3date index cho catalog
revisions/decisions và listing decisions, giữ index submittedAt của listing
revisions. Không sửa migration cũ/validator/dữ liệu nghiệp vụ. Máy đã có DB chạy
`pnpm db:migrate`, restart API/workers cùng bản. Local chính đã áp dụng0037;
không reset/seed/đổi cấu hình. Không cần bootstrap lại vì không collection/quyền mới.

## Kiểm chứng

- API typecheck/build và7unit mới PASS: calendar qua17:00UTC, group/time bounds,
  service từ chối Member/Test Operator/current inactive reviewer.
- `pnpm --filter @used-books/admin-web test:dashboard:api`: build API trước,
  bật QA replica set theo START_HERE và đặt MONGO_TEST_URL của QA. Script tạo
  DB*_test riêng, dùng API tạo/sửa hồ sơ; kiểm contract,401/403/400,7/30ngày,
  biên đầu/trước đầu/tương lai, resubmit/decision, history bài bị gỡ và quyền/
  trạng thái đổi sau login. PASS; finally xóa đúng DB/users/roles fixture. Storage fake.
- Admin151unit/19file PASS (5mới), lint/typecheck/build/budget PASS. API lint exit0
  còn warning cũ ở exchanges/reviews/auction, không sửa ngoài phạm vi. Contract/routes
  PASS178operations/27controllers. CI thêm script HTTP sau build; remote CI NOT RUN.
- CUA QA1440×1000,320×780:7/30, filter, table30hàng, readout ngày trước bằng Enter,
  không tràn document; mobile metric numbers thẳng cột. Staff thật không có catalog
  selector/link và capacity. Screenshot `.tmp/dashboard-redesign/desktop.png`,
  `mobile.png` là dữ liệu QA, không phải số liệu ứng dụng chính.
- Detector1advisory cho line wine #9e5750, cùng tonal separator đã dùng sidebar;
  giữ chủ ý brand. Full browser harness/fault UI suite/screen-reader speech/zoom200%/
  cross-browser/load testing NOT RUN. Không tuyên bố human acceptance hoặc hết bug.
