# Báo giá mua sách giao trực tiếp — F0

27/09/2026 · OpenAPI **0.11.0** · [ADR 0016](../adr/0016-direct-sale-quotes.md).
Nhánh increment: `codex/direct-sale-quotes`; tiếp nối working tree có các increment
trước chưa commit, không phải một PR sạch chỉ chứa báo giá.

## Đã triển khai

Hai API thật trên NestJS/PostgreSQL, tiền tố `/api/v1`:

| Operation | Route | Hành vi |
|---|---|---|
| createSaleQuote | POST `/listings/{listingId}/quotes` | MEMBER ACTIVE, Idempotency-Key, expected listing version/revision và địa chỉ nhận/version; trả QuoteReceipt |
| getMySaleQuote | GET `/me/quotes/{quoteId}` | Chỉ buyer có quyền MEMBER, trả SaleQuote và assessment hiện tại |

Phạm vi Sale/Both, một cuốn, DirectDelivery, vùng mô phỏng TP.HCM. Server tính tiền
và kiểm tra nơi gửi đã gắn vào revision, nơi nhận thuộc buyer, quyền/trạng thái
hai phía, eligibility và phiên bản. Không nhận số tiền hoặc người chịu phí từ client.

Theo POL-13/POL-22/BR-20: sách 200.000đ + ship 30.000đ = buyer 230.000đ; hoa hồng 10.000đ,
seller dự kiến nhận 220.000đ khi hoàn tất bình thường, đã gồm hoàn ứng ship. Ship
không chịu hoa hồng. Không phát sinh Order, reservation, hold, journal hoặc Shipment.

Hạn báo giá 5 phút, quota 20 báo giá chưa hết hạn/buyer là mặc định kỹ thuật ở ADR 0016,
không thay hạn giữ Order 15 phút. Mọi phép tính VND là integer, làm tròn half-up.
Quote/policy bất biến; receipt/audit ghi cùng transaction, không tạo outbox.
Request lặp cùng key/nội dung trả receipt cũ, không kéo dài hạn hoặc tạo bản mới.

GET phân biệt Current, Expired, Changed, Unavailable; ưu tiên theo ADR. Đổi/xóa địa
chỉ hoặc đổi policy không sửa lịch sử và không tự tính lại tiền trong quote cũ.
Current là kết quả kiểm tra tại thời điểm đọc, không đảm bảo sách đã được giữ.
Không trả địa chỉ/điện thoại/tên người nhận hoặc ID nơi gửi của seller. No-store.

## Bằng chứng thực thi

Node 24.19.0, pnpm 11.19.0, Windows, PostgreSQL riêng với tên DB kết thúc `_test`.
Mỗi E2E tạo schema riêng, áp toàn bộ SQL migration rồi dọn schema; không reset DB chung.

| Kiểm tra | Kết quả |
|---|---|
| `pnpm contract:check` | Qua; YAML parse và generated types đồng bộ |
| `pnpm lint`, `pnpm typecheck` | Qua toàn workspace |
| `pnpm test` | 117 qua: API 29, session 14, RN 61, operations 13 |
| `pnpm test:api:e2e` | 160 qua, 10 files; có 18 quote HTTP/DB và 1 upgrade quote |
| API build + operations build | Qua |

Test mới: [tính tiền](../../apps/api/test/quote-money.spec.ts),
[HTTP/database](../../apps/api/test/quotes.e2e-spec.ts),
[upgrade](../../apps/api/test/quote-migration.e2e-spec.ts).

- Tính tiền/làm tròn/biên; client giả số tiền, method, versions; mua sách của mình;
  địa chỉ người khác; guest/staff/buyer khác; Restricted/Locked/mất role/revoked session.
- Replay sau xóa địa chỉ/hết hạn; đổi payload cùng key; T−1/T/T+1 quanh expiry;
  thay policy, hide/reopen, mất eligibility; Sale/Both và Exchange-only; listing cũ
  thiếu nơi gửi. Projection/receipt/audit không lộ contact và listing không bị đổi.
- Barrier khóa PostgreSQL thật: hai request cùng key chỉ ghi một quote; quota 19
  với hai request chỉ nhận thêm một; address/role/hide thắng trước quote thì từ chối;
  quote thắng trước sửa địa chỉ thì thành công rồi GET báo Changed. Chờ khóa tài
  nguyên xong mới lấy decision time và kiểm tra session hết hạn.
- SQL chặn sửa/xóa quote, giả totals/commission/self-buy; failpoint audit rollback
  quote, retry thành công. Migration nâng 8→9 với địa chỉ/revision/receipt/audit có
  sẵn giữ nguyên dữ liệu, các guard cũ và constraint đúng một target.

Log 500/503 trong suite là failpoint có assertion rollback/retry, không phải lỗi bỏ qua.
Driver pg 8/Prisma hiện có cảnh báo concurrent query deprecation; tests qua nhưng
không suy ra đã tương thích pg 9. Không đổi dependency trong increment này.

## Cài đặt và giới hạn

Chạy `pnpm db:generate`, `pnpm db:migrate`, build API và khởi động API mới theo
[setup](../../apps/api/README.md). Migration mới
`20260927020000_direct_sale_quotes` thêm bảng/policy demo và target receipt/audit;
không backfill quote, không đổi địa chỉ/tin đăng/mật khẩu, không cần reseed hay env mới.

Local application DB: lịch sử 8 migration đã đối chiếu checksum trước deploy;
đã áp dụng migration thứ 9 và kiểm tra checksum cả 9, không còn migration chờ. Các bài API E2E
ở trên chạy NestJS mới trong process test, không phải xác nhận process API cổng 3000 cũ
đã nạp code mới. Lần thao tác restart trước bị automatic approval review chặn với
thông báo `blocked by policy`; increment này không thử lại hoặc vượt chặn.

Không có UI báo giá/RN checkout, thanh toán, hãng vận chuyển thật, ViaPoint, exchange
quote hoặc đấu giá. Storage trong fixture được thay bằng adapter giả; không tính
suite này là bằng chứng Supabase live. Không thay UI nên không chạy lại native build;
native address/fulfillment/picker acceptance vẫn chưa đóng.

Bước tiếp theo **F1**: Order AwaitingPayment, snapshot và exclusive commitment,
create/read/cancel/expiry theo [kế hoạch](TRANSACTION_FOUNDATION_PLAN.md) và CM-AC.
Chỉ mở luồng mua cho Member khi các gate F1/F2 hoàn tất; quote không thay checkout.
