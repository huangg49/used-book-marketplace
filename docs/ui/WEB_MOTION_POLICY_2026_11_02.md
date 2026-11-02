# Đồng bộ chuyển động trên web — 02/11/2026

Owner yêu cầu giữ các hiệu ứng đã thiết kế khi máy bật Giảm chuyển động, cho
Member web và Admin/Staff. Phạm vi gồm Expo khi chạy web, không đổi cài đặt máy,
nghiệp vụ, dependency, native policy hoặc thêm animation vào nội dung đang tĩnh.

Source: `codex/admin-listing-review-workspace`, HEAD `cbc616f7` cộng diff chưa
commit; giữ nguyên gói review UI đang làm. Checkout ứng dụng local HEAD `f3291409`
nhận cùng biến đổi theo AST/hunk, giữ nguyên các sửa đổi khác của teammate.

## Thay đổi

- Bỏ global cutdown0.01ms trong [Member CSS](../../apps/user-web/src/styles/global.css).
  Bỏ các media rule theo tùy chọn chuyển động trong18file CSS ở Member/Admin:
  gồm nhánh tắt pending illustration/Exchange/Search và các nhánh khôi phục cục bộ.
  Một bộ timing gốc áp dụng cho cả hai preference, không chồng override mới.
- [Member entry](../../apps/user-web/src/main.tsx) đặt Framer Motion thành never
  giảm chuyển động; animation JavaScript và CSS cùng tuân thủ quyết định owner.
- [Expo motion hook](../../apps/mobile-react-native/src/core/ui/motion.ts) giữ
  full motion trên web, không đăng ký OS reduction. Native giữ provider hiện có.
- Giữ nguyên thời lượng, số lần chạy gốc, hover/device conditions, visibility/
  IntersectionObserver, cleanup/Back và fallback kỹ thuật. Minh họa gửi duyệt
  vẫn chạy1lần560ms; spinner vẫn là loop. Không ép mọi animation thành vòng lặp.
- Checkout local có Profile mới hơn worktree: chỉ bỏ2media rule của Profile tại
  đó, không chép tính năng Profile/Member hoặc shell của teammate sang worktree.

## Kiểm chứng

| Kiểm tra | Kết quả | Giới hạn |
| --- | --- | --- |
| Member typecheck, build,308unit/44file | PASS | Lint0error,8warning ở code không đổi |
| Admin typecheck, build/budget,228unit/34file | PASS | Lint0error,2warning AI có trước |
| RN typecheck,5motion-preference tests, lint file đổi | PASS | Không là native interaction PASS |
| Expo export web | PASS | Không là Android/iOS build |
| Browser CSS policy | PASS5nhóm | CSS thật, fixture trình bày; không gọi API/DB |
| App local đang chạy | PASS4màn,0pageErrors | Đọc nghiệp vụ thật, không thực hiện mutation |
| Detector thiết kế1lượt | FAIL5primary,172advisory | Các style có trước, ngoài phạm vi motion; không sửa/ẩn finding để đạt0 |

[Regression script](../../scripts/check-web-motion.mjs), chạy `pnpm test:web-motion`:
kiểm các CSS nguồn không còn nhánh riêng theo preference; nạp CSS thực bằng Vite,
so sánh animation name/duration/iteration và transition property/duration giữa
reduce/no-preference ở1440/390px. Xác nhận clock thực sự chạy khi reduce bật,
không chỉ so sánh hai trạng thái đều tắt. Expo dùng React hook và react-native-web
thật, xác nhận adapter nhìn thấy preference đổi reduce→normal→reduce nhưng hook
web luôn giữ full motion. Test không khởi động app/API hoặc ghi/xóa DB.

Live check trên Member Home/Search và Admin review/dashboard so sánh timing trên
74/68/86/29element; query trình duyệt vẫn báo reduce, không giả đổi setting máy.
Native/full Expo journey, mọi trạng thái tương tác, human UX và remote CI NOT RUN.
Không push/merge hoặc đóng READINESS. Evidence ignored tại `.tmp/web-motion/`:
`browser/result.json`, build/test logs và `live-result.json`.

Detector nêu border-accent của AuthLayout,2font Svnpaulanatalie/Uvncodien ở
global.css (3finding), side-tab ở Admin index.css. Đối chiếu AST36file hai checkout
xác nhận mọi selector/declaration ngoài media preference giữ nguyên; không đưa
các finding thiết kế có trước vào phạm vi sửa animation. Browser regression5nhóm
đã chạy PASS riêng trên cả source worktree và checkout ứng dụng local.
