# Motion Admin — nghiên cứu và bản thử27/10/2026

Owner muốn thêm điểm nhấn animation/effect để làm việc bớt nhàm chán. Gói này
ban đầu nghiên cứu và dựng phòng thử độc lập; owner đã duyệt và gắn ba hiệu ứng
vào Admin runtime27/10, chi tiết triển khai/kiểm chứng ở cuối tài liệu.
Nhánh `codex/admin-ui-refactor`, base `d3b19e5` + local work. Giữ UI/UX Pro Max,
Taste và Impeccable; mode Operate, không áp motion budget của landing page.

## Nguồn và kết luận

- [NN/G — Role of animation in UX](https://www.nngroup.com/articles/animation-purpose-ux/):
  motion thu hút chú ý; phản hồi và giải thích chuyển trạng thái là những ứng dụng
  hữu ích, chuyển động không liên quan có thể làm gián đoạn công việc.
- [Carbon — Motion](https://www.carbondesignsystem.com/building-blocks/foundations/motion/overview):
  productive motion cho thao tác thường xuyên; expressive motion cho khoảnh khắc
  quan trọng/thỉnh thoảng. Timing thay đổi theo phạm vi chuyển động.
- Pro Max local search `animation distraction feedback`: tránh nhiều animation
  đồng thời, phản hồi loading rõ và hạn chế vòng lặp trang trí. Skill là hướng dẫn,
  không phải số liệu usability của Lật lại.

Đề xuất cho sản phẩm: giấy, nét mực và gáy sách tạo cùng một ngôn ngữ. Có một
chuyển động đặc trưng ở lúc người dùng đổi ngữ cảnh; các thao tác lặp lại giữ
nhanh, ít dịch chuyển. Những khoảng thời gian bên dưới là tham số thử, chưa là
giá trị tối ưu được xác nhận bằng người dùng.

## Kiểm kê hiện tại — tránh giới thiệu lại cái đã có

| Vị trí | Đã có trong source |
| --- | --- |
| Dashboard chart | Đường xử lý vẽ vào800ms, có viewport/visibility cleanup |
| Kệ sách | Book hover/focus nâng4–5px, chọn sách làm phiếu turn380ms |
| Kết quả kiểm duyệt | Stamp460ms chỉ sau receipt/reconcile/projection khớp |
| Sidebar | Ba chế độ đã duyệt, Auto400/300ms; width/grid transition220ms |
| Command palette/mobile drawer | Entrance có sẵn; native dialog/Escape/focus |

Đây là các hiệu ứng đang có, không tính là đề xuất mới. Chính sách receipt,
focus/Back và ba chế độ sidebar được giữ nguyên.

## Chỗ nên thêm hoặc tinh chỉnh

| Ưu tiên | Vị trí | Chuyển động | Điều kiện và phạm vi |
| --- | --- | --- | --- |
| Cao | Biểu đồ Dashboard | Nét mực chuyển liền mạch khoảng300–420ms khi đổi dữ liệu/loại hồ sơ | Cùng domain thì nội suy theo ngày; đổi7/30ngày phải đổi domain/nhãn đúng, không nối các ngày không tương ứng. Background refetch không đổi data thì không chạy lại |
| Cao | Danh sách → chi tiết, đổi khu vực | Một mép giấy lướt và bề mặt paper dịch rất ít, khoảng220–360ms | Chỉ khi Router đã chấp nhận navigation; không chặn nội dung, không delay fetch, không chạy lại cho filter/typing/Back restoration |
| Vừa | Phiếu xem nhanh | Bề mặt nghiêng tối đa1.5–2°, nâng4px, trả về150ms | Frame/paper ở vùng riêng; không nghiêng bảng, input, nút duyệt hoặc làm sáng ảnh sách gây sai cảm nhận tình trạng |
| Vừa | Nút/link chính | Mực nhấn/đường kẻ trả lời hover/focus, press100–150ms | Pointer và keyboard tương đương; không magnetic cursor hay mục tiêu click chạy theo chuột |
| Vừa | Dữ liệu mới sau refresh | Nhấn nhẹ vào đúng giá trị/thanh thay đổi, khoảng250–350ms | Chỉ sau GET thành công, so sánh dữ liệu thật. Không chạy count-up qua những số trung gian hay báo cập nhật thành công cho request lỗi |
| Sau | Danh sách/hàng vừa đổi | Fade/boundary highlight ngắn180–240ms | Giữ row identity, thứ tự API, focus/input/draft. Không stagger toàn bảng mỗi lần polling hoặc tự đẩy hồ sơ người dùng đang đọc |

Một lần chỉ để một khoảnh khắc chiếm chú ý. Không thêm particle/confetti,
auto-parallax, nền chuyển động liên tục hoặc con trỏ tùy biến vào bàn vận hành.
Đây là quyết định thiết kế cho tác vụ hiện tại, không tuyên bố các hiệu ứng đó
luôn sai ở mọi loại website.

## Phòng thử độc lập

URL local: `http://localhost:5173/design/motion/index.html`.
Source: `apps/admin-web/public/design/motion/{index.html,motion.css,motion.js}`.

- Ba cảnh: sang trang360ms; nét hình học đổi shape420ms; phiếu nâng520ms để quan
  sát rõ, còn pointer follow150ms/giới hạn2°. Không dùng số liệu hay ảnh sách giả.
- SVG ở cảnh nét mực chỉ là hình học nghiên cứu, được ghi rõ không có dữ liệu
  vận hành; khi triển khai chart thật phải theo domain/semantics ở trên.
- Có nút phát/dừng, radio desktop, select mobile; play/stop nằm trong khung xem.
  Không fetch, mutation, token, analytics hoặc dependency mới. Không thay Admin,
  session, sidebar hay API; không tạo ràng buộc phải dùng framework animation.
- Khi dừng/interruption, nét về hình cuối đã chọn; paper trở về trạng thái cuối,
  không để nội dung phụ thuộc animation.finished. Tab ẩn/blur/pagehide/offscreen
  hủy rAF/timer/WAAPI. Không autoplay/loop. Giữ authored motion theo owner kể cả
  OS prefers-reduced-motion; không đổi thiết lập hệ điều hành.

## Kiểm chứng phòng thử độc lập

Đã kiểm JS syntax và CUA1280×860/320×780: ba chế độ, native keyboard/Enter,
phát lặp/Stop, nét đổi thật qua DOM path, paper cancel về transform mặc định,
mobile select/target≥44px và không tràn document. Không benchmark FPS/CPU/mobile
GPU, không thử người dùng làm việc30phút, không screen-reader speech/cross-browser.
Browser facade không hỗ trợ document.getAnimations, dùng DOM path/computed style/
feedback thay cho việc bịa số animation đang chạy.

Detector1lượt trả exit1/JSON: tiny10/11px, font alias và cream palette. Đã sửa chữ
nhỏ thành≥12px và dùng tên font canonical/Auth Bricolage/Be Vietnam Pro; cream là
brand đã duyệt, giữ lại. Không chạy lại để đuổi điểm sạch hoặc gọi đây là audit PASS.

## Triển khai runtime đã được owner duyệt —27/10/2026

- `core/page-frame.tsx` giữ quyết định theo pathname qua profile/query renders và
  Suspense; chỉ sau nội dung resolve mới phát mép giấy320ms bằng WAAPI. PUSH/REPLACE
  đổi pathname được phép; initial/POP/Back/query-only không phát. Chỉ lớp edge
  pointer-events:none chuyển động, không transform nội dung/focus/containing block,
  không delay fetch và không quyết định navigation theo animation.finished.
- `features/dashboard/chart-motion.ts`: nội suy380ms theo domain ngày giống nhau
  và cùng thang đo. Đổi domain/scale dùng opacity320ms cho nét mới đúng số liệu;
  đổi7/30 vẫn dùng query riêng/loading, reset scope như trước. Không nối bảy ngày
  sang ba mươi ngày. Resize không morph; poll không đổi geometry không phát lại.
  Readout/bảng luôn là snapshot đã chọn, dấu chấm tạm ẩn khi nét chuyển. Bỏ CSS
  stroke-draw800ms cũ để không chạy chồng. Không thêm dependency/số liệu mẫu vào app.
- `core/paper-depth.ts`: chỉ lớp nền giấy của phiếu xem nhanh nghiêng
  tối đa1.5°/2°, nâng4px, trả150ms; host, chữ, ảnh và click targets đứng yên.
  Keyboard focus nâng nền2px; chỉ fine mouse/viewport>720. Touch/drag không theo
  con trỏ. Cache geometry hủy khi scroll/resize; rAF gộp pointermove. Paper turn
  cũ và stamp sau ACK giữ nguyên, depth không chạy trong turn của phiếu.
- Shared boundary: hidden/offscreen/blur/pagehide/unmount hủy observer/listener/
  rAF/WAAPI; chart luôn về geometry thật cuối, giấy về baseline. Thiếu WAAPI vẫn
  đọc/thao tác đúng. Giữ authored motion theo owner dù reduced-motion, không đổi
  OS và không thêm loop/timer polling cho hiệu ứng.

Kiểm chứng: Admin159tests/20files (8mới) gồm same data/domain/scale/resize,
interpolation/final state/rapid interruption, boundary cancellation, depth limits,
touch/drag/coarse/hidden fallback và route POP/query rules. Lint/typecheck/build/
bundle budget PASS. API chính ready/login/CORS/2queue/overview7+30 trả200; không
đổi backend/contract/migration trong gói motion.

CUA1440×1000/320×780 trên QA DB*_test: scope đổi thật qua polyline coordinates,
7→30→7→30 giữ đúng30points/description, keyboard select có focus; link workboard
document coordinates đứng yên khi nền nâng. Mép giấy chạy khoảng339ms gồm scheduling
trong lượt chẩn đoán; diagnostic tạm đã gỡ. Back không chạy edge; dirty form chặn
route, ở lại giữ draft/không edge. Mobile table30hàng/preview/Back trả focus về sách,
không tràn document, depth không theo mobile. Artifact `.tmp/admin-motion-runtime/`
là fixture/genuine API events với storage fake, không phải data app chính.

Detector một lượt exit0 có4advisories: hai shadow literal đã thay token shadow-md;
hai giá trị cũ (wine separator #9e5750 và heading fluid1.375rem) giữ brand/layout
đã duyệt. Không rescan/không gọi detector sạch. FPS/GPU/30phút comfort/cross-browser/
screen-reader speech/zoom200% và browser fault-injection suite NOT RUN. Unit boundary
không thay cho OS hidden-tab/low-end device acceptance. READINESS không đổi.

Lượt xác nhận browser cuối sau đổi shadow sang token/giữ transition origin qua
StrictMode không chạy được: local browser use bị tắt trong Work settings. Không
thử vòng qua quyền đó; evidence CUA ở trên là trước hai chỉnh sửa cuối này. QA
fixture đã close/drop đúng DB/users/roles, Vite5174 và Mongo QA đã stop; cổng
3009/3010/5174/57017 không còn listener. Không reset được viewport/đóng tab QA qua
CUA sau khi quyền bị tắt; tab agent tạo là temporary, không mark deliverable.
