# ADR0070: Người đang dẫn được Mua ngay; Mua ngay của người khác có 5 phút thách đấu

03/11/2026. Accepted theo yêu cầu của thành viên nhóm trong phiên làm việc. Sửa phần
"người đang dẫn không dùng" của FR-AU06 trong [ADR0047](0047-seller-scheduled-auctions.md)
và độ dài cửa sổ 60 giây của [ADR0043](0043-buy-now-challenge-window.md) cho trường hợp
người bấm không dẫn giá. Không đổi READINESS.

## Vấn đề

ADR0047 cấm người đang dẫn dùng Mua ngay, nhưng người không dẫn vẫn dùng được và kéo
phiên còn nhiều giờ xuống 60 giây. Người đang dẫn không có cách tương tự để kết thúc sớm,
và nếu không trực tuyến đúng phút đó thì mất sách dù đã dẫn suốt phiên.

## Quyết định

1. Người đang dẫn được Mua ngay khi Mua ngay còn khả dụng (phiên đang mở, chưa ai mua
   ngay, giá hiện tại thấp hơn giá mua ngay). Đây là cam kết trả đúng `buyNowPrice`: giá
   hiện tại lên `buyNowPrice`, người đó vẫn dẫn và giữ thứ tự (sequence) đã giành vị trí
   dẫn. Nếu mức Đặt giá tự động của họ cao hơn giá mua ngay, mức đó được giữ (vẫn chỉ họ
   thấy); nếu thấp hơn, cam kết thành lượt trả thủ công bằng giá mua ngay.
2. Cửa sổ thách đấu sau Mua ngay phụ thuộc người bấm:
   - người đang dẫn: `min(endAt, buyNowAt + 60 giây)` như ADR0043;
   - người không dẫn: `min(endAt, buyNowAt + 5 phút)`.
   Trong cửa sổ, mọi người đủ điều kiện vẫn trả giá từ `buyNowPrice + bước` (cả Auto) như
   FR-AU03–05; không gia hạn thêm. Hết giờ đóng phiên như FR-AU07.
3. Phần còn lại của ADR0043/0047 giữ nguyên: Mua ngay một lần mỗi phiên, quyết định dưới
   cùng khóa với lượt trả giá, rút khi giá chạm giá mua ngay.

## Persistence và contract

- Migration `0058-buy-now-rival-window` chỉ đổi validator `auctions`: khi có `buyNowAt`,
  `endAt` bằng `min(plannedEndAt, buyNowAt + 60 s)` hoặc `min(plannedEndAt, buyNowAt + 5 phút)`.
  Không thêm trường; phiên đã có giữ nguyên. Không sửa migration/checksum cũ.
- OpenAPI `buyAuctionNow` mô tả quy tắc mới; request/response không đổi.

## Hệ quả

- Web và RN hiện nút Mua ngay cả khi đang dẫn, với lời giải thích đúng độ dài cửa sổ.
- Người dẫn dùng Mua ngay sẽ tự nâng giá mình lên giá mua ngay để đổi lấy kết thúc sớm.
- Người không dẫn dùng Mua ngay cho người khác 5 phút để phản ứng thay vì 60 giây.
