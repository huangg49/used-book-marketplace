# Sidebar Admin: sự ổn định và quyền kiểm soát

Nghiên cứu27/10/2026 theo phản hồi owner về sidebar mở/đóng khi hover.
Owner duyệt và đã triển khai local27/10; chưa phải nghiệm thu với người dùng.
Phạm vi: Admin web, giữ đỏ rượu/kem, menu/quyền/API và mobile drawer hiện có.

## Kết luận đề xuất

Mặc định mở cố định trên desktop, nút thu/mở trực tiếp và nhớ lựa chọn trên
trình duyệt. Hover tự mở chỉ là chế độ tự chọn. Ưu tiên người dùng biết trước
điều gì xảy ra hơn giảm một lần click bằng mọi giá.

| Chế độ | Hành vi | Phù hợp |
| --- | --- | --- |
| Mở cố định — mặc định | Hiện tên đầy đủ; rê chuột không đổi kích thước | Người mới, chuyển tác vụ thường xuyên |
| Thu gọn | Chỉ icon; chỉ mở bằng nút, không hover mở toàn sidebar | Đọc hồ sơ/bảng, muốn nội dung ổn định |
| Tự mở khi rê chuột | Rail, dừng chuột400ms mới mở tạm; rời300ms mới đóng | Người đã quen và chủ động chọn hover |

400/300ms là giả thuyết để thử, không phải ngưỡng đã chứng minh tối ưu cho Admin.
Animation220ms hiện tại giữ; phân biệt delay kích hoạt với thời lượng animation.

## Điều tìm thấy trước khi triển khai

Nguồn: `apps/admin-web/src/features/navigation/WorkspaceShell.tsx` và module CSS
ở local branch `codex/admin-ui-refactor`, base `d3b19e5` + local work27/10.

- `pinned` chỉ là React state, mặc định true; chưa nhớ lựa chọn khi reload.
- Pointer mouse đi vào bật `hovered` ngay; đi ra tắt ngay, không có dwell/exit delay.
- `expanded` gộp mobile/pinned/hovered/focused/logoutError; chưa có lựa chọn
  thu gọn thực sự tắt hover. Bỏ ghim đồng thời kích hoạt mở tạm là hai ý khác nhau.
- Focus vào nav/account cũng mở tạm. Nút pin, search và nav có điều kiện khác nhau;
  cần giữ keyboard dùng được và làm rõ chế độ, không xóa hỗ trợ focus tùy tiện.
- Sidebar tạm mở phủ nội dung; grid chính chỉ đổi theo pinned. Đây là điểm tốt:
  hover không đẩy toàn bộ bảng/form sang bên. Vẫn có thể che nội dung cần đọc.
- Chưa thấy handler Escape dành riêng cho preview hover trong WorkspaceShell.
- Có tên accessible/title, aria-current, mobile dialog và menu theo quyền; giữ lại.

Đây là phân tích source, không là phép đo tần suất kích hoạt nhầm hay mệt mỏi.

## Cơ sở và giới hạn suy luận

1. [Baymard: hover delay300–500ms](https://baymard.com/research-articles/dropdown-menu-flickering-issue)
   mô tả nghiên cứu menu ecommerce: mở tức thì có thể làm gián đoạn tác vụ;
   delay giảm kích hoạt nhầm. Áp dụng400ms cho sidebar là suy luận thiết kế,
   chưa là kết quả nghiên cứu người vận hành Lật lại. Không dùng tỷ lệ ecommerce
   làm số liệu về Admin.
2. [Atlassian navigation layout](https://atlassian.design/components/navigation-system/layout)
   có nút thu/mở, shortcut tùy chọn và overlay theo viewport. Đây là tham khảo
   pattern thực tế, không là bằng chứng pattern đó tốt nhất cho mọi Admin.
3. [Jira navigation](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-new-navigation-in-jira/)
   cho người dùng chủ động thu/mở sidebar; hỗ trợ phím tắt. Dễ tìm và dễ quay lại
   là mục tiêu phù hợp hơn biểu tượng pin có nhiều nghĩa ẩn.
4. [WAI: content on hover/focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
   yêu cầu nội dung hover liên quan có thể đóng, có thể trỏ vào và giữ đủ lâu;
   có ngoại lệ khi không che/thay nội dung. Cần kiểm hành vi cụ thể trước kết luận
   conform/fail, không tự coi mọi sidebar tự mở là vi phạm.
5. [WAI: on focus](https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html)
   phân biệt đổi nội dung với đổi ngữ cảnh. Mở sidebar khi focus không tự động
   vi phạm; không chuyển trang, gửi form hoặc giành focus chỉ do Tab tới icon.

Pro Max local search `hover accidental activation` khuyên primary interaction
dùng click/tap và không lệ thuộc hover. Taste/Impeccable Operate đặt tác vụ,
khả năng dự đoán và brand hiện có lên trước biểu diễn chuyển động.

## Điều khiển và cách nhớ lựa chọn

- Giữ nút thu/mở dễ thấy ở đầu sidebar, nhãn hành động rõ. Mở cố định ↔ Thu gọn
  là thao tác một lần; không bắt vào trang Settings.
- Thêm mục nhỏ “Hiển thị thanh điều hướng”, mở bảng chọn ba radio và mô tả ngắn.
  Cho biết chế độ đang chọn; mở được cả khi rail thu gọn. Không cần modal chặn việc.
- Chọn một chế độ áp dụng ngay, không nút Save thừa. Ghi tùy chọn giao diện có
  version vào localStorage; không chứa user/PII/token, không cần API. Nói rõ lưu
  trên trình duyệt này. Nếu storage bị chặn, vẫn thao tác được trong phiên.
- Nút mở khi đang Auto chuyển sang Mở cố định. Nút thu gọn chuyển sang Thu gọn;
  quay lại Auto phải chọn rõ ràng. Không âm thầm bật lại hover.
- Mobile tiếp tục Menu/drawer bằng tap; không hover. Về desktop phục hồi lựa chọn
  desktop. Không tự ghi đè tùy chọn do resize hoặc đổi route.
- Chưa thêm drag-resize hay shortcut mới: tăng phần phải học, không giải quyết
  vấn đề hover hiện tại. Có thể cân nhắc sau nếu xuất hiện nhu cầu thực tế.

## Nếu bật chế độ Auto

- Chỉ mouse và môi trường có hover phù hợp. Touch/pen dùng nút; keyboard có đường
  mở trực tiếp và focus rõ ràng, không phải chờ dwell của chuột.
- Rê qua nhanh dưới400ms không mở; rời trong lúc chờ thì hủy. Rời preview chờ
  300ms, quay lại thì hủy đóng. Không có khe hở giữa rail và preview.
- Giữ mở khi focus còn trong menu hoặc đang tương tác bảng chọn hiển thị.
  Popup con của sidebar được tính là cùng vùng tương tác.
- Escape đóng preview, không cướp focus; không tự mở lại khi chuột còn nằm đó.
  Chỉ cho kích hoạt hover mới sau khi rời rồi quay vào. Không xử lý Escape của
  một dialog khác đang ở phía trên.
- Đổi route/chế độ/viewport, tab bị ẩn hoặc unmount phải hủy timer; không có
  timer cũ mở lại menu. Giữ owner motion policy, không đổi cài đặt hệ điều hành.
- Preview giữ nguyên chiều rộng nội dung chính, không reflow form/bảng; ghim mở
  mới thay layout có chủ đích. Chữ/icon không đổi vị trí đích click bất ngờ.

## Kiểm chứng trước khi nhận

Kiểm kỹ thuật: reload/logout-login giữ preference; dữ liệu storage sai/bị chặn
có fallback; click qua rail không tự mở; timer nhanh/chậm/rời-quay lại; Escape
không mở lại; keyboard focus/tooltip/nhãn; dialog con; dirty-form guard; mobile
và zoom200%; không horizontal overflow hay visible scrollbar; cleanup timer.

Thử tác vụ với người dùng: chuyển giữa2queue, đọc hồ sơ, quay lại hàng chờ,
tìm directory. Quan sát số lần mở ngoài ý muốn, click nhầm, mất mục tiêu và hỏi
chế độ nào dễ chịu sau vài phút. Chưa có số đo hay human sign-off; không suy từ
animation mượt rằng người dùng thoải mái. Ưu tiên kiểm mặc định thủ công trước,
Auto là lựa chọn bổ sung nếu thực sự giúp tác vụ.

## Implementation và kiểm chứng27/10

- `SidebarPreferences.tsx` dùng native nonmodal popover, ba radio có nhãn/mô tả,
  nút đóng và trạng thái chế độ ở trigger. Có thể mở từ rail; ArrowDown đổi radio,
  Escape trả focus. Không thêm dependency, API hay dữ liệu nhận diện vào storage.
- `sidebar-preferences.ts` lưu `{version:1,mode}` dưới `latlai.admin.sidebar.v1`;
  dữ liệu không hợp lệ trở về expanded, đọc/ghi lỗi không làm vỡ UI. Chỉ ghi khi
  người dùng chọn, không tự ghi lại theo viewport/route.
- Controller tách hover400/300ms, focus giữ mở, popup hold, Escape suppress,
  reset/teardown. Chỉ mouse có hover/fine pointer và không đang kéo chuột.
  Mode/layout đổi, route, visibility/blur và unmount hủy preview cũ.
- Unit:128test cũ PASS trong lượt tổng;18test mới PASS sau sửa assertion không
  phụ thuộc thứ tự attribute HTML. Bao gồm storage sai/bị chặn, dwell, re-entry,
  focus, popup hold, Escape không bật lại, reset và teardown không còn timer.
- CUA IAB:1280×800 chọn từng chế độ, thu gọn giữ khi Tab; reload/đăng nhập lại
  giữ Thu gọn; Auto keyboard/chuột thật mở trễ, Escape vẫn đóng sau khi chờ,
  mainX80px trước/sau preview; route/back giữ Auto. CtrlK đóng preferences trước
  khi mở đúng1dialog, Escape trả về trigger.
- Mobile320×780: panel trong viewport, không tràn ngang, scrollbar none;
  Escape lần1 chỉ đóng popover, lần2 đóng drawer/trả focus/khôi phục body scroll.
  Desktop1280×500: panel top24/bottom424, không vượt vùng nhìn. Mobile không
  đổi lựa chọn desktop. Timing biên399/400 và299/300ms xác nhận bằng fake timers,
  thao tác CUA không phải phép đo latency chính xác.
- Lint/typecheck/build/bundle budget PASS; detector1advisory tên ease-spring cũ,
  giữ motion đã duyệt. Full browser harness, zoom200%, trình duyệt khác và thử
  nghiệm với người dùng NOT RUN. Không có thay đổi gate READINESS.
