# U06 — Nội dung, định dạng tiền và trạng thái

29/09/2026, nhánh `codex/u06-states-copy` (tách từ `codex/u05-action-bar`).

## Rà soát

- Quét chuỗi tiếng Việt trong `features/`, `core/`, `app/` (trừ catalog/preview nội
  bộ) tìm thuật ngữ backend/tiếng Anh (API, token, server, version, listing, draft,
  upload, worker, status…): **không có** trong luồng sản phẩm; “email” là từ thông dụng.
- Định dạng VND có 4 chỗ tự viết: `book.tsx`, `shelf-grid.tsx`, `shelf-screen.tsx`
  dùng “₫”, còn bước “Kiểm tra” của editor ghi “85.000 đồng” — khác cách sách sẽ hiện
  trên kệ.
- Trạng thái đã có trong các màn: tải, rỗng, lỗi có nút thử lại, mất kết nối API
  (A00 ghi nhận kệ “Chưa kết nối được máy chủ” + thử lại), ảnh thiếu/lỗi (browser
  suite). Không thấy CTA giả; ví/Order chưa có UI nên không có trạng thái tiền để rà.

## Thay đổi

- `core/ui/format.ts` (mới, không phụ thuộc React Native): `formatVnd` là nguồn duy
  nhất; xuất qua `core/ui`. `book.tsx`, `shelf-grid.tsx`, `shelf-screen.tsx` và
  `displayPrice` của editor dùng chung. Nhãn ô nhập và câu hướng dẫn vẫn ghi “(đồng)”.
- `format.test.ts`: nhóm nghìn kiểu vi-VN, số âm/lẻ/NaN/quá lớn → “Chưa có giá”.

## Kiểm thử

| Lệnh / môi trường | Kết quả |
|---|---|
| RN unit | 10 file, **68/68 PASS** |
| RN lint/typecheck | PASS |
| `export:web` + `pnpm test:public:browser` | **PASS** 3 suite (gồm giá “125.000 ₫”, “1.000.000 ₫” trên kệ/chi tiết) |
| Android Hermes | Bước Kiểm tra hiển thị “85.000 ₫” |

## Giới hạn

Walkthrough offline toàn bộ màn trên native chưa làm (Q01/N05 đã có một phần trên máy
cũ). Chuyển động/giảm chuyển động: không thêm chuyển động mới nên không có gì để rà.
