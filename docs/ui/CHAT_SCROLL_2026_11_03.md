# Sửa vùng cuộn phiếu/hội thoại — 03/11/2026

Owner báo không lăn chuột được khi chia đôi cửa sổ ở `/chat/:roomId`, đang xem
phiếu trao đổi. Base4e77f4e5, nhánh `codex/chat-scroll-containment`; chỉ Member web.

## Nguyên nhân và sửa

Document đang khóa để dùng workspace cố định. Từ960px trở xuống, CSS cũ lại đặt
sheet/parent height:auto và overflow:visible, cộng chat tối thiểu600px. Vùng sheet
phình theo nội dung, bị ancestor cắt; không có scroll range dù overflow-y:auto.
Tái hiện trên hội thoại demo thực:950px, viewport940px, sheet cao3160px tới y3349,
wheel650px nhưng scrollTop vẫn0.390px cũng bị, desktop1440px cuộn được.

Giữ đúng viewport model ở màn hẹp: một grid row minmax(0,1fr), sheet height100%/
min-height0, body overflow-y:auto; chat dùng chiều cao còn lại thay600px tối thiểu.
Tab không bị flex co mất, vẫn giữ mounted composer/draft. Main room min-height0;
chiều cao dưới1000px trừ đúng header72px, desktop76px. Không đổi brand, motion,
session, API, giao dịch, tiền hoặc cấu hình máy.

## Kiểm chứng

- **FAIL xác nhận trước sửa:** runner mới chạy với source checkout ứng dụng cũ,
  assertion viewport-bounded agreement thất bại tại960×940; read-only probe hội
  thoại thực cho scrollTop0 tại950/760/390. Không gửi tin/command giao dịch.
- **PASS sau sửa:** `node apps/user-web/tests/chat-guidance.mjs --scroll-only`:
  HTTP+Socket.IO fixture độc lập, không DB/storage.18ca buyer/seller trên1440,
  1000,961,960,950,760,390,320px; chữ130% và cửa sổ950×480. Wheel và Ctrl+End
  tới cuối, focus tới action cuối, header đứng yên, không overflow ngang,
  composer trong viewport, đổi tab giữ draft, Back trả document scroll.
- **PASS2ca OrderCreated** ở950/390px: embedded private Order cùng frame cuộn
  được; tab Hội thoại đưa tới composer trong viewport. Không đổi hành vi Order.
- **PASS** Member typecheck/build, lint ChatPage; diff check. Detector có advisory
  màu đã tồn tại ngoài diff, không tự mở rộng palette để chạy theo điểm detector.
  Đã xem ảnh950/390px cùng đợt; fixture không là native/human acceptance.

Evidence local `.tmp/chat-scroll-qa/` và `.tmp/receipt-review-demo/chat-scroll-*`.
Giữ bộ dữ liệu/giao dịch demo hiện có; không test ghi/xóa trên DB chính. Không
push/PR/merge hoặc đổi READINESS. Gói được áp dụng vào checkout ứng dụng local
qua fast-forward sau khi working tree sạch; frontend HMR nhận source mới.
