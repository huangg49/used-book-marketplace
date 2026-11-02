# Giỏ sách Member — 01/11/2026

Nhánh local `codex/member-cart`, base `b13f0d5b`, subject
`feat(cart): connect bounded member carts to single-listing checkout`.
Theo [ADR0060](../adr/0060-member-cart.md) và FR-O01–O02/AC-07.

| Vai trò/entry | Điều kiện → command | Kết quả → bước tiếp/Back |
|---|---|---|
| Member web: menu tài khoản → Giỏ sách; bài đăng bán → Thêm vào giỏ | Current ACTIVE MEMBER, public Sale/Both Available, không tự mua; max50 | Một dòng quantity1, chưa giữ chỗ; Mở giỏ hoặc tiếp tục xem sách |
| Member RN: Tài khoản → Giỏ sách; chi tiết sách → Thêm vào giỏ | Cùng API và shared intent; sẵn sàng giao hàng mới canBuy | Giỏ lưu server, thấy từ web/RN; Back không đổi intent |
| Giỏ → Mua bài đăng này | Chọn đúng một dòng; actual checkout revalidates quote/version/price/address | Một Order riêng; trở về giỏ hoặc Đơn hàng của tôi |
| Member LOCKED/RESTRICTED | Đọc/xóa dòng own cart | Không cấp mới giao dịch; không xóa ví/giữ chỗ/đơn |

Source: [API](../../apps/api/src/modules/cart/cart.service.ts),
[projection](../../apps/api/src/modules/listings/public-listing.service.ts),
[shared](../../packages/session-client/src/cart.ts),
[web](../../apps/user-web/src/pages/CartPage.tsx),
[RN](../../apps/mobile-react-native/src/features/cart/cart-screen.tsx).

Không có nút checkout nhiều dòng. Bài không còn công khai không lộ metadata cũ;
dòng vẫn xóa được. Giá đổi hiện cả giá lúc thêm và giá mới. Error không thành giỏ
trống; kết quả cũ có lỗi không mở mua. Mất ACK add/remove giữ key/body/version/path;
remount từ màn khác không đảo add thành remove. CartFull có thông báo50 rõ ràng.

## Bằng chứng và giới hạn

- Contract0.67/213operations/33controllers; registry62 migrations qua0049. Schema
  PASS27/27 trên Mongo8 `rs-test`57017 và database `_test`; DB chính không áp dụng.
- PASS9nhóm [API harness](../../scripts/test-member-cart-api.mjs): real Nest/Mongo/Sharp,
  storage fake; kiểm quyền/self/quantity/unknown fields, replay/body conflict,
  current price/version, hidden/private null, unique/max50, locked read/remove và
  quyền bị thu hồi trước replay, genuine actor/listing contention. 49 dòng capacity
  là IDs QA unavailable có nhãn; hai admission cạnh tranh dùng listing thật đã duyệt.
  Không có reservation/Order/ledger side effect từ cart.
- PASS [Browser](../../scripts/test-member-cart-browser.mjs): real API/Mongo, storage
  fake; entry thật web/RN-web, add/remove mất ACK503 + Back/remount đúng intent,
  giá đổi, read error/retry, giỏ hai dòng → đúng một Order mỗi client. Đơn QA được
  hủy qua API để kiểm khép kín reservation. Chưa thanh toán trong harness cart;
  payment có regression riêng của checkout.
- Shared session PASS105/105 (cart thêm7); web253/253 và RN164/164. API/public
  projection unit9/9; API/web/RN typecheck/lint và API/web build PASS, warnings cũ.
  Expo Android/iOS/web export PASS; không native runtime. HTTP408/429 được kiểm ở
  helper; browser dùng503 để tránh retry tự động408 của Chromium. Handler QA phải
  drain trước unroute; lỗi interception làm test FAIL, không được bỏ qua.
- Phát hiện đã sửa: web checkout mở từ giỏ có thể dùng cache public-listing cũ,
  dù giỏ đã đọc giá mới. Quote server409 bảo vệ tiền nhưng đứt luồng. Refetch khi
  mở và chặn prepare trong lúc đọc lại; browser tái hiện đổi125.000→140.000 rồi
  tạo đúng Order từ giá/version mới. Không tự đổi intent sau khi đã gửi.
- Final regression PASS hồ sơ web/RN-web và mua ngay RN-web + web checkout-only:
  create/pay/cancel/lost ACK/Back/single hold. UI320px/web130% đã xem ảnh tại
  `docs/ui/member-cart-2026-11-01/`; stacking mobile và error sau recovery đã sửa.
- Native/live storage/provider/human UX/remote CI NOT RUN cho gói này. Export
  android/iOS/web là transformation, không là runtime/native PASS. Không GHN,
  paid AI, dependency upgrade, push/PR/merge/deploy hoặc tự đóng READINESS.

Gói này cũng cập nhật contract annotation cho Order chat LOCKED theo ADR0059:
allowlist-wide test từng FAIL vì thiếu `x-locked-access`; sửa metadata contract,
giữ ca từ chối và các kiểm participant/current session thực tế. Test toàn21ca
obligations PASS sau sửa. Không nới mọi route chat hoặc command tạo mới.
