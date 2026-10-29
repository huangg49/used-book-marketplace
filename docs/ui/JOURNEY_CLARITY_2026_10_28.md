# Nối hành trình Member và vận hành — 28/10/2026

Owner yêu cầu cải thiện UX bị phân mảnh; xác nhận cả Member và Staff/Admin đều
khó tìm bước tiếp theo. Nhánh `codex/member-journey-clarity`, base `46acb26`;
commit subject `fix(ux): connect member journeys and role-based workspace guidance`.
Không đổi backend/contract0.58/migration/tiền, không chạm GHN/carrier/Driver.

## Những gì đã thay đổi

- Web `/account` và RN `/account` thành **Việc của tôi**: tiếp tục giao dịch,
  tìm/đăng sách, thông tin/đánh giá. Mỗi lối vào có tên tác vụ và mô tả ngắn;
  phân biệt đơn trực tiếp, trao đổi và đơn thắng đấu giá.
- Gỡ khỏi trang tổng quan các widget cũ: tiến trình đơn mẫu trên web, RN4.9/
  badge uy tín, đơn/mã vận chuyển/trạm mẫu và số liệu trang đầu bị gọi là tổng.
  Không hiển thị số dư0 khi chưa tải; ví có trang thực riêng. Widget cũ trong
  thư mục profile không còn được AccountOverviewPage mount; không tái sử dụng
  DashboardOrders chứa dữ liệu mẫu như nguồn dữ liệu sản phẩm.
- Hướng dẫn công khai `/guide` trên cả hai app, chọn mua/bán/đổi/đấu giá; có
  đường đi thực hiện và nơi theo dõi kết quả. Có entry trên home/footer web,
  home/login RN và tài khoản. Mở chat chưa giữ sách; gửi duyệt chưa public;
  bán đấu giá cần intake/inspection. Không hứa completion hoặc giải ngân sớm.
- Đơn trực tiếp có liên kết tới đấu giá/hướng dẫn; hoàn tất có lối sang đúng
  review. RN Exchange Completed có lối review. Sửa lời hướng dẫn web để các
  state đang xử lý không bị gọi chung là “đã kết thúc”.
- Dashboard Staff/Admin có disclosure “Chưa biết bắt đầu ở đâu?”, dùng chính
  navigationGroups hiện tại, thêm ngữ cảnh từng loại việc. Staff có intake/
  collection; ADMIN-only không được gán quyền hai bước đó. Catalog và resolution
  chỉ hiện theo predicate quyền hiện có. Nhắc phân công/independence và custody;
  không thêm quyền hoặc sửa queue/command, không liên kết mô phỏng carrier mới.

## Bản đồ để cả nhóm cùng dùng

| Người dùng muốn làm | Đi vào | Nơi tiếp tục / kết quả |
| --- | --- | --- |
| Member mua | Tìm sách → bản sách → Mua ngay hoặc trò chuyện/chốt đơn | Đơn mua/bán trực tiếp → chi tiết; review khi Completed/đủ điều kiện |
| Member đăng bán | Đăng sách web; RN Kệ sách → tạo bản nháp | Kệ sách: nháp/chờ duyệt/cần sửa/hiển thị; đơn và hội thoại khi giao dịch |
| Member đổi | Tìm sách để đổi → chọn sách muốn nhận → đề nghị | Trao đổi của tôi: gửi/nhận/đang thực hiện; chi tiết quyết định bước tiếp |
| Member đấu giá | Xem phiên → đặt giá/mua ngay nếu được phép | Đấu giá của tôi → phiên/đơn thắng, thanh toán và nhận sách theo trạng thái |
| Staff kiểm duyệt | Dashboard → Bài đăng sách/Đánh giá giao dịch | Queue → chi tiết, version/lý do/quyền hiện tại |
| Staff tại điểm | Dashboard → Nhận sách đấu giá/Giao sách/Sự cố | Queue → hồ sơ; cần phân công tại điểm và độc lập giao dịch |
| Admin | Dashboard → Đầu sách/Đơn cần xử lý/Phiên/Quá hạn/Điểm | Hồ sơ và chứng cứ; role không tự cấp thao tác Staff hoặc đảo tiền |

Source chính: web `pages/AccountOverviewPage.tsx`, `MemberGuidePage.tsx`,
`lib/member-journeys.ts`; RN `features/account/account-screen.tsx`,
`features/navigation/guide-screen.tsx`; Admin `dashboard/WorkspaceStart.tsx`.
Các đường dẫn này tương đối từ `src/` của từng app.

## Kiểm tra và giới hạn

- Web251/RN161/Admin219 unit PASS; ba app typecheck/lint, web/Admin build và
  RN export PASS. Web còn warnings cũ và chunk warning. Không chạy lại API/
  Mongo gates vì source/contract/migration không đổi.
- Browser qua real API/Mongo QA riêng, fake storage: Member đăng nhập → hub →
  guide4luồng, lựa chọn/filter đúng → đơn Completed → đúng review → gửi/sửa/
  xóa/lost-ACK như trước. RN hub/guide/filter/orders/review và profile PASS.
  Staff và ADMIN-only hướng dẫn theo đúng nhóm việc; không thao tác GHN.
- Account browser riêng kiểm keyboard menu ArrowDown/Escape, guide bằng Enter,
  số thứ tự, profile/wallet thật và LOCKED không quảng cáo đăng bài mới trên hub.
  Các selector menu cũ trong frontend-ux/buy-now/wallet-checkout đã cập nhật;
  assertion số dư chuyển về WalletPage thực. Không chạy lại toàn bộ gói tiền/
  shipping; cập nhật selector không là evidence nghiệm thu tài chính mới.
- Đã xem web1440/768/390/320, RN web320/chữ130%, Staff/Admin desktop/mobile.
  Detector một lần0findings. Không là human usability test; native/TalkBack/
  ARM/iOS NOT RUN. Flutter vẫn scaffold, không được suy parity.
- Hướng dẫn giúp tìm đúng luồng đã có, không hoàn thiện mọi luồng backend còn
  thiếu. DirectDelivery vẫn theo F2h/READINESS; dispute/return/ordinary ViaPoint/
  account governance chưa được đóng gate. Không thay thiết kế/motion toàn app.
- QA đã dừng; Mongo chính giữ trạng thái dừng và dữ liệu. Chỉ commit local,
  chưa push/PR/merge/deploy hoặc có CI của nhánh mới.

Ảnh QA đã xem:
[Member web](evidence/journey-clarity/member-web.png),
[hướng dẫn web](evidence/journey-clarity/guide-web.png),
[RN web320/chữ130%](evidence/journey-clarity/member-rn-web-large.png),
[Staff](evidence/journey-clarity/staff.png), [ADMIN-only](evidence/journey-clarity/admin.png).

Tái chạy: build API cùng source; export RN web với API QA3009 theo START_HERE;
đặt MONGO_TEST_URL cho replica set QA57017 rồi chạy `pnpm test:journeys:browser`.
Account riêng: `node apps/user-web/tests/account-overview.mjs`. Harness tự dọn
fixture DB/users/roles/process; storage giả, Completed fixture không chứng minh
fulfillment. Log và ảnh bổ sung ở `.tmp/review-evidence/` và
`.tmp/journey-account-evidence/`, không commit env/token.

## Checklist bàn giao cho một chức năng mới

Ghi trong issue/PR: vai trò → entry → điều kiện → các bước → nơi thấy kết quả →
bước tiếp theo → đường quay lại. Liệt kê trạng thái loading/empty/error/bị từ
chối, cách giữ bản nháp và xử lý mất phản hồi. Nếu thiếu phần nối sang chức
năng khác thì ghi rõ người/module cần phối hợp, không dùng dữ liệu mẫu để che.

Nghiệm thu nhóm nên có một lượt người chưa viết chức năng thử từ trang vào,
không gửi URL thẳng tới màn cuối. Ghi những chỗ họ dừng/hiểu sai. Đây là phần
vẫn cần người thật; report và test xanh của AI không thay được.
