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
2. OpenAI Web Search hoặc Gemini Google Search **chỉ đề xuất URL** trang sản phẩm. Chỉ gửi dữ kiện catalog
   (tên, tác giả, NXB, năm, tập/ấn bản, ISBN); không gửi gì về người bán hay bài đăng.
   OpenAI tìm bằng tiếng Việt và thử cách viết ISBN phù hợp. Nếu tên NXB khớp duy nhất
   một domain đã cho phép, tìm domain đó trước. Mở rộng một lần sang các nhà sách còn
   lại khi chưa có nguồn xác minh được và còn thời gian tra. Nếu không nhận diện được
   domain NXB, tìm trên danh sách được phép. Chỉ dùng URL có dẫn nguồn từ công cụ tìm.
3. Server tự tải trang (`safe-fetch.ts`): chỉ https, chỉ domain được phép và tên miền con,
   host chuyển hướng của công cụ tìm kiếm chỉ được ở bước đầu, chặn địa chỉ private/
   loopback/link-local, tự theo redirect và kiểm lại từng bước, 5 s, 2 MB, không cookie.
   Kiểm tối đa hai trang cùng lúc. Bỏ tham số theo dõi phổ biến để một trang sản phẩm
   chỉ tính một nguồn. Giữ tham số định danh sản phẩm.
   Sau hai lỗi truy cập liên tiếp của cùng nhà sách trong một lượt tra, bỏ các URL
   còn lại của nhà sách đó, kể cả khi đến qua link chuyển hướng. Trang tải được nhưng
   sai ISBN hoặc thiếu giá vẫn được xử lý như dữ liệu không phù hợp.
4. Giá đọc từ dữ liệu có cấu trúc của trang (`page-check.ts`): offer JSON-LD Product/Book,
   hoặc `product:price` / `itemprop="price"`. Không đoán từ chữ trên trang, không dùng số
   model trả. Ưu tiên ISBN trong dữ liệu sản phẩm. Khi thiếu ISBN ở đó, kiểm tra số có nhãn
   ISBN trong thân trang, chỉ dùng khi có duy nhất một ISBN và một sản phẩm có giá.
   Trang không có ISBN thì phải khớp tên sách và có tên tác giả. Bỏ AggregateOffer,
   tiền khác VND, giá ngoài 1.000–10.000.000 đ. Nội dung trang
   không bao giờ gửi cho model. Với đầu sách đang chờ duyệt, ISBN đã khai phải được
   xác minh trên trang. Nếu không khai ISBN, cần khớp tên của sản phẩm có giá và
   tác giả ghi trên trang. Tập/ấn bản đã khai phải khớp, kể cả khi khác cách ghi
   số La Mã và số Ả Rập.
5. Giá đạt kiểm tra lưu ở `online_price_offers` (app được ghi, tách khỏi
   `price_references` chỉ nhân viên ghi) kèm shop, URL, ngày; trả về như nguồn
   `OnlineRetail` có link “Mở trang”. Lần tra mới thay (retire) bộ giá cũ.
6. Một lần tra mỗi đầu sách: lease trên `price_lookups/<bookId>` (insert/update có điều
   kiện), chạy sau request; làm mới sau 30 ngày, 7 ngày nếu không tìm thấy nguồn,
   24 giờ nếu provider lỗi hoặc còn URL chưa xác minh được vì lỗi truy cập.
   Nếu đã có nguồn giá xác minh được, giữ thời hạn lưu thông thường.
   Từ 10/11/2026, đầu sách đã xác nhận hoặc yêu cầu chờ duyệt của chính người bán
   được tra giá khi đủ dữ kiện nhận diện và có ảnh bản sách Ready. Tra giá không
   xác nhận hay công khai đầu sách. Lượt tra và nguồn mới gắn với revision của
   catalog theo migration `0076-online-price-catalog-revision`. Khi sửa và gửi lại,
   lượt tra/nguồn của revision trước không áp dụng cho bản mới. Dữ liệu lịch sử
   chưa có revision chỉ dùng cho đầu sách đã xác nhận.
   Tính vào hạn mức tra mỗi ngày và ngân sách chung
   (token + phí tìm kiếm theo từng provider, ước tính theo usage provider trả về).
   Khi đổi model chính hoặc phiên bản cách tìm, lần tra cũ thiếu nguồn hoặc bị lỗi
   được phép tra lại. Nguồn đã xác minh giữ thời hạn lưu. Lượt tra của đầu sách
   chờ duyệt còn có hạn mức riêng theo thành viên, dùng ngưỡng
   `PRICE_ASSIST_USER_DAILY_LIMIT`.
7. Khi đang tra và chưa có nguồn khác: `NeedsMoreData` với `R-LOOKUP-PENDING`.
   `R-NEED-BOOK-IDENTITY` hướng dẫn bổ sung dữ kiện. `R-LOOKUP-UNAVAILABLE` phân biệt
   lỗi hoặc hết lượt tra với trường hợp đã tra nhưng chưa có nguồn phù hợp. Người
   bán nhận `R-LOOKUP-DISABLED` khi tra giá đang tắt hoặc chưa có provider. Người
   bán vẫn có thể nhập giá. Gợi ý dựa trên đầu sách chờ duyệt luôn có mức `Limited`.
   `price-reference` có thể trả `lookupStatus` của lượt tra đã tồn tại cho cùng
   revision, qua quyền chủ bài hiện hành. Đọc tiến độ không gọi provider, không
   tạo gợi ý và không tiêu hạn mức. Member web đọc lại có giới hạn ở bước 4.
   Khi đã có nguồn, hiện khoảng tham chiếu. Khi đọc lỗi hoặc hết lượt tự kiểm
   tra, cho người bán xem lại thủ công hoặc nhập giá.
   `OnlineRetail` là giá sách mới cho băng tình trạng của ADR 0028; giá bìa nhân viên nhập
   được ưu tiên khi có cả hai; quá 3 tháng thì coi là cũ.
8. Tắt mặc định (`PRICE_LOOKUP_ENABLED=false`). `PRICE_LOOKUP_PROVIDERS=openai,gemini`
   chọn OpenAI trước. Dùng Gemini tối đa một lần nếu OpenAI timeout, lỗi kết nối,
   HTTP 408/429/5xx. Hai lượt chia ngân sách tra 25 giây (15 + 10), dùng cùng lease.
   Kết quả hợp lệ không có nguồn giữ trạng thái thiếu dữ liệu. Nếu bỏ danh sách,
   giữ cách cấu hình Gemini cũ qua `PRICE_ASSIST_*`. Cấu hình tra theo danh sách
   có key riêng và độc lập với model soạn khoảng giá. Xem [ENV_HANDOFF](../handoff/ENV_HANDOFF.md).

## 3. Không làm

Không cào trang tìm kiếm của shop, không đăng nhập, không chạy JavaScript của trang (shop
chỉ hiện giá bằng JS sẽ không cho giá — loại khỏi danh sách thay vì vượt qua), không lấy
giá sách cũ, không để model quyết định con số.

## 4. Cần chủ dự án quyết định

1. Danh sách shop được phép và điều khoản sử dụng của từng shop (mỗi đầu sách tải tối đa
   một lần/30 ngày, user-agent nhận diện).
2. Phí mỗi lần tìm của Google (mặc định 0,035 USD là giả định, cần đối chiếu bảng giá).
3. Có thêm giá rao sách cũ sau này không (đánh dấu là giá rao, không vào khoảng giá).
