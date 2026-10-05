# ADR 0029: Tra giá sách mới trên nhà sách trực tuyến cho trợ lý gợi ý giá

**Status: Proposed — đã triển khai sau cờ tắt mặc định, chờ chủ dự án duyệt.** 06/10/2026.
Nhánh `codex/bao-price-assist-gemini`. OpenAPI 0.23.0, migration `0007-online-price-lookup`.
Bổ sung [ADR 0028](0028-listing-price-assistant.md); luật cố định vẫn quyết định khoảng giá.

## 1. Bài toán

Nguồn giá trong ADR 0028 chỉ do nhân viên nhập (`price_references`), nên hầu hết đầu
sách trả “chưa đủ dữ liệu”. Người bán mong trợ lý biết giá sách trên thị trường. Một
model tự “biết” hoặc tự đọc giá trên mạng thì không kiểm chứng được và có thể đọc nhầm
ấn bản/giá.

## 2. Quyết định

**Tra trực tuyến để lấy nguồn, kiểm tra từng trang, lưu lại, rồi tính giá từ dữ liệu đã lưu.**

1. Chỉ giá **sách mới** ở danh sách nhà sách được phép (`PRICE_LOOKUP_SHOPS`, mặc định
   đề xuất `fahasa.com, tiki.vn, nhanam.vn, nxbtre.com.vn, nxbkimdong.com.vn`). Không lấy
   giá rao sách cũ (Shopee, Chợ Tốt): nhiễu và dễ bị đẩy giá.
2. Gemini với Google Search **chỉ đề xuất URL** trang sản phẩm. Chỉ gửi dữ kiện catalog
   (tên, tác giả, NXB, năm, ISBN); không gửi gì về người bán hay bài đăng.
3. Server tự tải trang (`safe-fetch.ts`): chỉ https, chỉ domain được phép và tên miền con,
   host chuyển hướng của công cụ tìm kiếm chỉ được ở bước đầu, chặn địa chỉ private/
   loopback/link-local, tự theo redirect và kiểm lại từng bước, 5 s, 2 MB, không cookie.
4. Giá đọc từ dữ liệu có cấu trúc của trang (`page-check.ts`): offer JSON-LD Product/Book,
   hoặc `product:price` / `itemprop="price"`. Không đoán từ chữ trên trang, không dùng số
   model trả. Chỉ giữ khi cùng ISBN; trang không có ISBN thì phải khớp tên sách và có tên
   tác giả. Bỏ AggregateOffer, tiền khác VND, giá ngoài 1.000–10.000.000 đ. Nội dung trang
   không bao giờ gửi cho model.
5. Giá đạt kiểm tra lưu ở `online_price_offers` (app được ghi, tách khỏi
   `price_references` chỉ nhân viên ghi) kèm shop, URL, ngày; trả về như nguồn
   `OnlineRetail` có link “Mở trang”. Lần tra mới thay (retire) bộ giá cũ.
6. Một lần tra mỗi đầu sách: lease trên `price_lookups/<bookId>` (insert/update có điều
   kiện), chạy sau request; làm mới sau 30 ngày, 7 ngày nếu không tìm thấy, 24 giờ nếu lỗi.
   Chỉ sách catalog đã xác nhận. Tính vào hạn mức tra mỗi ngày và ngân sách chung
   (token + phí mỗi lần tìm `PRICE_LOOKUP_SEARCH_USD`).
7. Khi đang tra và chưa có nguồn khác: `NeedsMoreData` với `R-LOOKUP-PENDING`.
   `OnlineRetail` là giá sách mới cho băng tình trạng của ADR 0028; giá bìa nhân viên nhập
   được ưu tiên khi có cả hai; quá 3 tháng thì coi là cũ.
8. Chỉ provider Gemini (cần Google Search grounding). Tắt mặc định
   (`PRICE_LOOKUP_ENABLED=false`), cần cả trợ lý bật.

## 3. Không làm

Không cào trang tìm kiếm của shop, không đăng nhập, không chạy JavaScript của trang (shop
chỉ hiện giá bằng JS sẽ không cho giá — loại khỏi danh sách thay vì vượt qua), không lấy
giá sách cũ, không để model quyết định con số.

## 4. Cần chủ dự án quyết định

1. Danh sách shop được phép và điều khoản sử dụng của từng shop (mỗi đầu sách tải tối đa
   một lần/30 ngày, user-agent nhận diện).
2. Phí mỗi lần tìm của Google (mặc định 0,035 USD là giả định, cần đối chiếu bảng giá).
3. Có thêm giá rao sách cũ sau này không (đánh dấu là giá rao, không vào khoảng giá).
