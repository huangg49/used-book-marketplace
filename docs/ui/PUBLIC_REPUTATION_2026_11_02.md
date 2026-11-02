# Hồ sơ uy tín công khai — 02/11/2026

Owner phản ánh `/members/:id` sát mép trái, phần phải trống, số liệu và giải thích
thiếu phân cấp. Checkout app đã đổi `reviews.module.css` sang khung dashboard
`margin:0;padding:0`, trong khi hồ sơ công khai dùng lại class `page` đó ngoài
dashboard. Các thay đổi giao diện đánh giá của teammate được giữ nguyên.

Nhánh `codex/public-reputation-profile`, base09198a00. Chỉ Member web; không thay
API, contract, dữ liệu đánh giá, điểm số, tiền hoặc chính sách công bố.

## Kết quả

- CSS module riêng cho hồ sơ; khung1180px căn giữa, lề an toàn và một document
  scroll. Không sticky hoặc scroll panel bên trong.
- Danh tính bằng tên API và chữ cái đầu (không giả avatar/verified badge); tách
  điểm đối tác, chất lượng sách và số mẫu. Sao hỗ trợ phần lẻ; điểm số dạng chữ
  vẫn là thông tin accessibility chính. Giữ số0/điểm null trung thực.
- Nhận xét là phần chính, tác giả mở được hồ sơ công khai, điểm/nội dung/tags/
  phản hồi được phân cấp. Chỉ render phản hồi Approved; không gắn nhãn cảm tính
  “xuất sắc/kém” lên đánh giá công khai. Nhãn dữ liệu mẫu trong nội dung giữ nguyên.
- Cách hiểu điểm nằm ở cột phụ; công thức/công bố mở bằng details. Mobile chuyển
  một cột, màn rất hẹp dùng hai hàng điểm; không ngắt số3.5 thành nhiều dòng.
- Loading, empty, lỗi ban đầu/retry, tải thêm lỗi/retry, stale network giữ dữ liệu;
 403/404 che dữ liệu cache. Không biến lỗi thành hồ sơ0đánh giá.
- Khóa cache public infinite query là `['memberReputation','public',id]`, tránh
  xung đột object của summary ở checkout app (`['memberReputation',owner]`). Giữ
  prefix để invalidation sau review vẫn cập nhật cả hai.
- Source worktree giữ SupportLink Member/Review hiện có. Checkout app0.71 chưa
  có hành trình report/support này; patch không đưa link chưa được nối vào đó.

## Kiểm chứng

| Kiểm tra | Kết quả và giới hạn |
| --- | --- |
| Browser presentation | PASS1440/900/390/320, chữ130%, một vùng cuộn, số mẫu/điểm, phản hồi đã duyệt, phân trang/retry, empty/null, đổi người, loading/503/404 và cache summary/infinite khác cấu trúc |
| Loại dữ liệu browser | HTTP fixture cho hồ sơ, không test DB/harness ghi; không là bằng chứng backend lifecycle hoặc native |
| App chính5174 | PASS profile public thực từ API3000: hai review, điểm3.5/4.0,2mẫu,2giao dịch,0vi phạm; bố cục/CSS riêng đã áp đúng trang; không đổi dữ liệu |
| Kiểm tĩnh | User web typecheck/build/lint PASS; warning build chunk/lint cũ ngoài phạm vi |
| Impeccable | Chạy detector một lượt;1advisory radius16px, đã đổi về panel12px theo DESIGN; xác nhận bằng hình sau sửa, không tuyên bố detector rescan |
| Chưa thực hiện | Native/human acceptance, remote CI, push/PR/merge; không đổi READINESS |

Tái kiểm UI fixture: `pnpm --filter @used-books/user-web test:reputation:browser`.
Script dùng Vite5184 nội bộ rồi tự dọn; người demo tiếp tục dùng5174. Ảnh/baseline/
fingerprint runtime giữ ignored, không commit nội dung DB hoặc cấu hình riêng.
