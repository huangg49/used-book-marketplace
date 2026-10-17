# Popup mua bán và Mua ngay — 17/10/2026

Nhánh `codex/purchase-popup-ui`, base `ed8734f`. Member web React/Vite only.
Kế thừa DESIGN.md: wine/cream/paper, Anton heading và Be Vietnam Pro cho tác vụ.

- Mua ngay: bản sách, tình trạng, nơi nhận và bảng tiền rõ hơn; form địa chỉ và
  xác nhận đặt mua dùng popup. Tạo đơn vẫn đến bước thanh toán ví riêng.
- Thương lượng: Buyer gửi địa chỉ/báo giá bằng popup; Seller mở popup nhập giá
  đã thỏa thuận và tạo đơn. Sửa lời giải thích: tạo đơn là chờ thanh toán, chỉ
  thanh toán thành công mới đang giao dịch.
- Đăng bán: nơi gửi là tóm tắt và nút mở popup, giữ dữ liệu khi đóng/mở hoặc
  chuyển bước. API tạo địa chỉ vẫn chạy ở lần gửi bài theo submission hiện có.
- `PurchaseDialog` dùng native dialog qua portal: nền inert, giữ focus, Escape,
  click ngoài, trả focus, khóa đóng khi đang gửi, khôi phục body scroll khi rời
  trang. Popup cuộn trong viewport; animation260ms giữ cả khi reduced-motion.
- `PurchaseAddressFields` dùng chung cho hai cách mua: địa chỉ có sẵn/mặc định,
  chọn địa chỉ mới, form có nhãn/autocomplete/validation. Checkout pin cả body và
  key địa chỉ/quote để lỗi mạng và refetch không thay ý định cũ.

## Evidence

Ảnh Chromium thật, API/Mongo QA replica set riêng và database disposable `*_test`.
Tên, địa chỉ, số điện thoại, ảnh sách và tiền đều là fixture. Storage/carrier/ví
mô phỏng; không là Supabase/provider thật hoặc dữ liệu người dùng.

| Ảnh | Bối cảnh |
| --- | --- |
| [Địa chỉ mobile](address-mobile.png), [desktop](address-desktop.png) | Popup390×844/1440×900, font100%; mobile có cuộn để đến nút cuối form |
| [Xác nhận mobile](checkout-mobile.png), [desktop](checkout-desktop.png) |125.000đ tiền sách +30.000đ phí giao; chưa giữ sách hoặc trừ tiền ở bước quote |
| [Tóm tắt mobile](summary-mobile.png), [desktop](summary-desktop.png) | Trang sau khi đóng popup, đã có báo giá |
| [Gửi báo giá](quote-mobile.png) | Buyer thương lượng,390×844; người bán nhập giá sách sau |
| [Tạo đơn](seller-create-desktop.png) | Seller nhập90.000đ, kiểm nơi nhận và phí trước lệnh tạo Order |
| [Nơi gửi mobile](origin-popup-mobile.png), [desktop](origin-popup-desktop.png) |390×844/1440×900, font130%; popup cuộn, dữ liệu vẫn giữ khi đóng/mở |

Modal captures đợi entrance animation/fonts xong, focus heading và cuộn popup về
đầu trước chụp. Nơi gửi được chụp sau khi đã điền đủ form. Không dùng ảnh full-page
của modal khi viewport thay đổi làm bằng chứng vị trí. Không tạo raster sản phẩm.

## Kiểm tra

Node24.21.0/pnpm11.19.0, local:

- PASS `@used-books/user-web` lint/typecheck/build và135unit (21file). Bốn warning
  exchange có sẵn và warning bundle lớn vẫn còn.
- PASS `test:buy-now:browser`: popup Escape/close/reopen giữ form, focus trap/return,
  reduced-motion vẫn260ms; mất ACK address/create/pay giữ key/body, một
  Order/payment; thiếu tiền không hold; Preparing không cần Seller duyệt lại;
  shipment/file-picker/poll503 và pickup mô phỏng hiện có tiếp tục đạt.
- PASS `test:seller-order:browser`: hai phiên390/1440, chọn địa chỉ mới khi có
  default; mất ACK address và create giữ key/body, giá nhập còn sau đóng popup;
  một Order, Buyer thiếu tiền rồi thanh toán, nhãn listing đúng payment.
- PASS `test:browser`: shelf/filter/paging/detail và lỗi/retry cũ, đăng nhập/owner,
  năm bước đăng bán và nơi gửi popup, giữ dữ liệu, upload/submit replay; public
  screens320px130%, form390px100/130%. Không thay acceptance native.
- API build chỉ để dùng fixture HTTP; không tính là API test/full Mongo gate.
- Detector chạy một lượt:6advisory về size/radius; đã dùng lại ramp1.5/1.25/.625rem
  và12px. Không chạy lại detector để đổi điểm. Config/brief drift cũ giữ nguyên.

[Review ban đầu](REVIEW.md) trả `fix`; [verdict cuối](VERDICT.md) trả `ship`, chấm
cả hai fix resolved (không là một lượt review toàn hệ thống mới).
[Documenter](DOCUMENTATION.md) cập nhật UI_COMPONENTS, giữ DESIGN/sidecar và ghi
drift cũ. AI không thay human review. Native/live storage/remote CI/human usability
NOT RUN. READINESS giữ nguyên; không push/PR/merge/deploy trong gói này.

Lượt review đầu trả `fix`: viền input bị global `input:not(...)` đè thành màu
nhạt, và Checkout chưa chọn lại địa chỉ mới sau khi server xác nhận lưu.
Đã sửa selector trong popup và chọn ID vừa lưu trước quote. Browser regression
kiểm computed border `rgb(142,117,100)`; ca lưu thành công → quote422 → thử lại
phải giữ địa chỉ đã lưu, không gửi thêm POST address. Không đổi CSS chung hoặc API.
Ca cuối PASS với hai địa chỉ tổng cộng (default cũ + địa chỉ mới), hai POST cho cùng
một address key/body do mất ACK, không có POST thứ ba sau quote422. Bộ fixture đã
dọn hết database/users/roles; chỉ dừng Mongo QA do phiên này khởi động.
