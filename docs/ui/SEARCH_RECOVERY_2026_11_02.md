# Tìm sách — phục hồi lượt nhập và trạng thái tải, 02/11/2026

Owner báo nhập từ bất kỳ ở Member web `/books?data=live` nhưng skeleton không
kết thúc. Khảo sát trên worktree HEAD `cbc616f7`+diff và checkout đang chạy HEAD
`f3291409`; bảo toàn các thay đổi UI/Admin/Member khác, chỉ áp hunk ô nhập tìm sách.

## Bằng chứng nguyên nhân

Public search đọc thật với từ không khớp trả200 và danh sách rỗng bình thường;
không tái hiện treo với nhập chữ thông thường. Có đường lỗi xác nhận ở IME:
compositionstart→đổi text→blur không có compositionend để `composing=true` mãi.
`searchPending` vì thế luôn true, query disabled và skeleton vẫn hiện dù không
có request đang chạy. Repro trước sửa vẫn loading sau khi rời ô1giây.

Đây là đường gây kẹt đã tái hiện, chưa đủ bằng chứng để khẳng định chính xác
chuỗi sự kiện từ ảnh chụp của owner. Không quy lỗi cho API hoặc hiệu ứng chuyển
động khi API thực tế trả kết quả; không sửa policy motion.

## Thay đổi và hành trình

[BookSearchPage](../../apps/user-web/src/pages/BookSearchPage.tsx): khi blur, kết
thúc trạng thái composition để tiếp tục debounce/query; submit chủ động kết thúc
lượt nhập bị gián đoạn và tìm từ khóa đã trim. Enter đang ghép ký tự (isComposing
hoặc keyCode229) không submit form sớm. Compositionend bình thường và debounce
300ms giữ nguyên. Không đổi backend, filter/search semantics, cache keys, timeout
chung15giây, quyền, session hoặc dữ liệu.

Người dùng nhập → đợi kết thúc ghép dấu hoặc bấm Tìm sách/rời ô → query → kết quả
hoặc trạng thái không có sách. Lỗi mạng/timeout → thông báo lỗi, giữ từ khóa →
Thử lại cùng query. Không hiển thị không có sách để che request lỗi.

## Kiểm chứng

- PASS typecheck cả hai checkout, Member308unit/44file, production build;
  lint0error/8warning có trước. Detector1lần exit0/0finding, không là human UX.
- [Browser regression](../../apps/user-web/tests/search-recovery.mjs), lệnh
  `pnpm --filter @used-books/user-web test:search-recovery:browser`: PASS8nhóm,
  Chromium reduce-motion, HTTP có kiểm soát, không gọi API/DB/provider. Gồm empty,
  composition/Enter, blur thiếu end, explicit submit thiếu end/trim, clear text,
  network error/retry, request treo thoát loading theo timeout15giây/retry và
  nút mobile390px. Test chờ query tương ứng, không nhận DOM rỗng cũ làm kết quả mới.
- PASS app/API local thật đọc public search:3response200,0pageErrors,1440/390px;
  từ không khớp hiển thị Chưa có cuốn sách nào phù hợp, không còn skeleton sau
  IME blur, không tràn ngang. Không viết DB hoặc thay đổi bài User1.
- IME events được phát có kiểm soát qua browser; chưa nghiệm thu bộ gõ OS thật
  hoặc mọi browser. Native/human/remote CI NOT RUN. Chưa push/merge/đóng gate.

Evidence ignored `.tmp/search-recovery/`: `before/`, `browser-result.json`,
`live-result.json`, ảnh `empty-live-*`, logs build/detector/QA. Vite QA5186 được
dừng sau kiểm tra; các app local có sẵn được giữ chạy.
