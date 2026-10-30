# Cải thiện UX frontend — 28/10/2026

Nhánh `codex/frontend-ux-consistency`, base local `68f40fb`; giữ nguyên gói
Exchange/API trước đó. Đây là refinement giao diện theo DESIGN hiện hành,
không phải nghiệm thu toàn sản phẩm hay nghiên cứu người dùng.

## Phạm vi đã đối chiếu

| Client | Source và kết luận |
| --- | --- |
| Member React/Vite | `apps/user-web/src/app/router.tsx`, Header/MainLayout/DashboardLayout, BookSearchPage, ExchangeMinePage, NotificationsPage và component trạng thái. Hệ màu cửa hàng đã có; một số màn giao dịch còn typography/bố cục cũ. Ưu tiên sửa điều hướng dùng chung và danh sách trao đổi. |
| RN / Expo web | `src/features/search/search-screen.tsx`, navigation, core/ui và UI catalog. Màn tìm kiếm có mic giả, reset chưa xóa từ khóa, chip “Sách hiếm” không khớp lọc LikeNew, control nhỏ và chip cuộn ngang. Đã sửa các điểm này. |
| Admin/Staff | WorkspaceShell/navigation, UserDirectory, OperationsQueue và ListFeedback có phân quyền trình bày, drawer mobile, lỗi/retry và giữ dữ liệu cũ khi refresh lỗi. Chỉ rà source ở lượt này; không coi đó là browser/device PASS. Không thay workspace mới chỉ để đồng bộ hình thức với Member. |
| Flutter | `apps/mobile-flutter/lib/main.dart` chỉ có MaterialApp và trang giới thiệu scaffold, chưa có hành trình Member/API/session. Không dựng màn chức năng giả hoặc công bố ngang RN/web. |

UI web dùng UI/UX Pro Max + Taste + Impeccable; RN dùng Pro Max + Impeccable.
Giữ đỏ rượu vang–kem của Member web và phần nhận diện RN hiện hành; không thay
DESIGN hay áp lại palette xanh lên web. GHN/carrier/Driver nằm ngoài gói theo
yêu cầu owner; không thay API, tiền, migration hoặc state transition.

## Thay đổi có tác động sử dụng

- Header web xác định mục hiện tại theo đường dẫn và ý nghĩa query, thay so sánh
  nguyên URL: thêm từ khóa/bộ lọc không làm mất trạng thái điều hướng. Menu mobile
  đóng bằng Escape và trả focus, đóng khi focus/click ra ngoài header; có cleanup.
  Main có focus target cho liên kết bỏ qua điều hướng.
- “Trao đổi của tôi”: heading và copy ngắn, tab không in hoa giãn chữ; bốn mục
  xuống hai cột trên mobile. Nút/tab có vùng chạm48px; tên sách dài và tên đối tác
  được đọc đầy đủ. Card dùng vùng trên cho đối tác/ngày tạo, vùng dưới cho hành
  động; sách xếp dọc dưới900px. Giữ ảnh QA thật từ fixture, không tạo rating.
- Keyboard tab dùng ArrowLeft/Right/Home/End và chuyển focus cùng lựa chọn. Bổ
  sung nhãn INSPECTING; hủy/hết hạn không còn ghi chung “Bị từ chối”. Màu trạng
  thái dùng palette có trong DESIGN; lỗi có hướng khôi phục, retry bận bị khóa,
  trạng thái rỗng giải thích và có lối đi tiếp phù hợp từng mục.
- RN tìm kiếm bỏ mic chưa tích hợp; không tự bật bàn phím khi mở màn, nút Search
  bàn phím đóng IME. Input16px, mode/filter/sort/chip chính48dp; chip lọc xuống
  dòng. “Đặt lại tiêu chí” xóa cả query lẫn filter; “Xóa bộ lọc” vẫn giữ query.
  LikeNew shortcut đồng bộ với nhóm tình trạng, không hiển thị chip trái với API.
  Số sách ghi “Đã tải”, không giả là tổng kết quả hoặc chỉ tại TP.HCM.
- Thanh điều hướng RN dùng chung: subtitle địa điểm chỉ hiện khi đủ rộng, để
  thông báo/chat luôn còn chỗ ở320px; các nút trên có vùng chạm48dp. Thanh dưới
  giảm khoảng trống trong item để “Tài khoản” không vỡ từ khi tăng chữ; bổ sung
  focus cho nút đăng sách. Bỏ chấm báo mới cố định ở đấu giá khi không có dữ liệu.
- StatePanel thêm lựa chọn `wine`, mặc định giữ giao diện consumer cũ; màn search
  dùng lựa chọn này và `/ui` có ví dụ. Copy thông báo web mô tả cập nhật sách/giao
  dịch, không giới hạn nhầm vào đấu giá.

## Kiểm chứng và giới hạn

Kết quả trên source gói này; dùng `corepack pnpm@11.19.0`, Node24.22.1:

| Kiểm tra | Kết quả |
| --- | --- |
| `--filter @used-books/user-web typecheck`, `lint`, `test`, `build` | PASS;251 unit. Lint có warning cũ; build có cảnh báo chunk>500kB. |
| `--filter @used-books/mobile-react-native typecheck`, `lint`, `test`, `export:web` | PASS;161 unit; export có cảnh báo Expo force exit sau khi xuất xong, tiến trình exit0. |
| `--filter @used-books/user-web test:exchange:browser` | PASS: ca UX mới ở1440/768/390/320 và chữ lớn, Arrow/Home/End, menu Escape/focus, empty/error/retry; create/accept/cancel, lost ACK, funding rejection và403 của suite cũ. |
| `test:public:browser` | PASS: search reset thật, LikeNew chip, top buttons48px nằm trong320px và nhãn account hai dòng ở130%; shelf/detail/pagination/error/retry, địa chỉ, đăng–sửa–gửi duyệt và lost-ACK regressions. |
| `docs:check`, `git diff --check` | PASS. |

Browser dùng Chromium và Nest/Mongo QA riêng, storage fake. Screenshot dưới
`apps/user-web/test-results/exchange/exchange-mine-*.png` và
`apps/mobile-react-native/test-results/search-*.png` là dữ liệu QA, không phải
sản phẩm, đánh giá hay tài khoản khách thật. Các thư mục artifact được ignore.
Harness web dùng lại phiên hiện có để không thêm login vượt giới hạn QA; chờ
đích hội thoại ổn định sau redirect từ URL Exchange cũ. Không giảm auth limit
hoặc sửa assertion để bỏ qua lỗi sản phẩm. API có log Unauthorized trong ca
thu hồi quyền403, suite vẫn kiểm dữ liệu bị ẩn như yêu cầu.

Impeccable detector chạy một lần trên web UI đã đổi, báo16 advisory ở CSS trao
đổi:15 màu trạng thái legacy và1 radius pill. Đã đối chiếu từng finding và thay
bằng màu DESIGN/radius8px; không chạy lặp để lấy điểm hoặc gọi detector là bằng
chứng accessibility hoàn chỉnh. Source và screenshot mới là căn cứ chính.
Các cặp chữ/nền trạng thái mới và secondary text được tính tương phản từ palette:
5,77–13,37:1; không suy phép tính màu này thành WCAG PASS toàn giao diện.

Native Android/TalkBack/ARM/iOS, tương tác cảm ứng trên máy thật, live provider,
human UX review và remote CI của commit mới chưa được nghiệm thu trong gói.
Không đổi READINESS. Build web còn cảnh báo bundle lớn; lint web còn warning
trên source có sẵn, không được xem là đã giải quyết toàn bộ.

## Việc tiếp theo

1. Review người thật hai hành trình tìm sách và theo dõi trao đổi, ưu tiên chữ
   lớn/keyboard/TalkBack trên Android. Browser Expo không đóng gate native.
2. Chuẩn hóa các form giao dịch còn lại theo component và palette hiện hành,
   làm từng hành trình với pending/error/input retention; không rút bước auth,
   ACK hoặc mở gate nghiệp vụ để làm UI ngắn hơn.
3. Sau khi nhóm quyết định phạm vi Flutter và giao nhận, mới lập gói riêng cho
   các phần đó. Không suy scaffold hoặc màn mô phỏng là tính năng hoàn chỉnh.
