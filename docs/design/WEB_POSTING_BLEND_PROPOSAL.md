# Đăng sách — đề xuất kết hợp hai bản — 11/10/2026

Trạng thái: **ĐỀ XUẤT, CHƯA DUYỆT TRIỂN KHAI**. Chỉ nghiên cứu/thiết kế;
không thay product code, API, DB, canonical DESIGN hoặc surface brief.

## Căn cứ và mục tiêu

- Bản Tuấn Minh `36cb0c0` (10/10), nhánh remote `feat/ui-search-bar-redesign`
  xác nhận cùng SHA trong lượt khảo sát trước: SellBookPage, Tailwind, nền
  `ĐangAnh_BG.png` và `Spending_BG.png`. Bản 07/10 `c412fc3` là mốc trước đó.
- Bản hiện tại `0a07b67`: SellBookPage/CSS, CatalogBookPicker,
  CatalogClassificationFields, ListingSubmissionConfirmation và
  listing-submission service. Đã đọc source và ảnh QA contextual-filters-sell-
  desktop; ảnh này là evidence lịch sử, không phải runtime mới.
- Bản cũ được đối chiếu bằng code/asset; chưa dựng runtime riêng để đo layout/
  hiệu năng. Những nhận xét về tràn/cost là nguy cơ cần kiểm khi triển khai,
  không phải lỗi browser đã tái hiện.
- Mode Operate: người đăng mô tả đúng từng bản sách vật lý, kiểm tra lại và
  gửi duyệt. Đề xuất giữ nhận diện bố cục/nền của Minh, kết hợp sự rõ ràng và
  cơ chế bảo vệ thao tác của bản hiện tại.

## Phần giữ và phần điều chỉnh

| Phần | Quyết định đề xuất |
| --- | --- |
| Nền Minh | Giữ giấy cổ, sách/bút/lá ở rìa; vùng đọc yên và form giấy đặc. Không thêm texture động hoặc mảng kính mờ. |
| Tiến trình Minh | Giữ một bộ 5 bước ngang; mỗi bước có tên/trạng thái ngắn. Bỏ bộ điều hướng dọc trùng chức năng, thay vùng trái bằng preview. |
| Thông tin tóm tắt Minh | Đưa dữ liệu hữu ích vào preview: ảnh, tên/tác giả, tình trạng, hình thức và hai giá khi phù hợp. Không cắt mất tên dài. |
| Bản hiện tại | Giữ 5 nhóm việc, chọn đầu sách/catalog, phân loại theo danh mục, ảnh thật, kiểm tra điều kiện, bảo vệ thoát và nguyên lần gửi khi retry. |
| Màu và chữ | Nền giấy cổ giữ sắc tự nhiên; nút/active/focus dùng wine/cream hiện tại. Anton chỉ tiêu đề, Be Vietnam Pro cho tác vụ; không đưa màu xanh hành động cũ trở lại toàn trang. |
| Thành công | Giữ receipt chờ duyệt hiện tại sau phản hồi thành công; nền giấy thống nhất. Không thêm một sân khấu minh họa/animation thứ hai. |

Khung desktop đề xuất:

```text
Navbar chung
Đăng sách · Để sách đi tiếp.
01 Thông tin — 02 Ảnh — 03 Tình trạng — 04 Bán/đổi — 05 Kiểm tra
┌─────────────────────┬──────────────────────────────────────────┐
│ Cuốn sách của bạn   │ Tên bước · Bước n/5                      │
│ Ảnh + tên/tác giả   │ Form giấy rõ nhãn, nhóm có khoảng thở     │
│ Tình trạng + giá    │                                          │
│ Chưa công khai      │ Quay lại                       Tiếp tục   │
└─────────────────────┴──────────────────────────────────────────┘
```

Desktop khoảng 1200px trở lên: vùng trái 240–280px, form chiếm phần còn lại,
container khoảng 1240–1320px. Đây là điểm xuất phát để kiểm browser, không phải
breakpoint đã nghiệm thu. Preview sticky chỉ khi đủ chiều cao và có giới hạn
trong workspace. Không thêm cột thứ ba. Trên laptop khoảng 1024–1200px ưu tiên
form; preview có thể chuyển thành disclosure **Xem bản nháp**. Mobile một cột,
hiện tên bước + Bước n/5 và bộ năm nút số 44px với tên đầy đủ cho AT; bước cuối
mở đầy đủ preview. Không yêu cầu cuộn ngang để biết các bước.

Trang cuộn tự nhiên, không ép cả form dài vào một viewport hoặc thêm cuộn lồng.
Giữ chiều cao tối thiểu vừa phải ở desktop cho chuyển bước; mobile bỏ khoảng
trống trang trí. Hàng hành động ở cuối form; chỉ ghim nếu còn đủ chỗ, không che
ô nhập/nội dung khi bàn phím mở. Kiểm laptop 125%, 320/390px và chữ lớn trước chốt.

## Năm bước và phản hồi

1. **Thông tin sách:** giữ hai đường chọn đầu sách đã có hoặc đề nghị mới;
   metadata đã xác nhận vẫn bất biến. Tên/tác giả/danh mục rõ ràng; thuộc tính
   theo danh mục có nhãn tùy chọn khi không bắt buộc. Disclosure cho thông tin
   bổ sung, không ẩn lỗi hoặc trường bắt buộc. Không thay taxonomy/contract.
2. **Ảnh bản sách:** một vùng tải lên nổi bật, ảnh đã chọn/xóa ảnh và số ảnh.
   Gợi ý chụp bìa/gáy/ruột/vết lỗi, không biến gợi ý thành yêu cầu ảnh mới.
   Giữ JPEG/PNG/WebP, 10MB, tối đa 8 và ít nhất 1 ảnh theo implementation hiện tại.
3. **Tình trạng:** phân nhóm mô tả ruột, bìa/gáy, ghi chú, phụ kiện, mô tả chung;
   giữ cả ba câu hỏi đủ điều kiện. Không dồn vào một khối chữ dài, không thêm
   điểm chất lượng hoặc phần trăm không có dữ liệu.
4. **Bán hoặc đổi:** giữ Sale/Exchange/Both, chỉ hiện các ô giá cần thiết.
   Hai giá đều VNĐ và giữ giới hạn hiện có; không dùng xu, giá khuyến nghị hay
   tùy chọn đấu giá trong luồng đăng listing thường.
5. **Kiểm tra:** overview đầu sách/phân loại + ảnh + tình trạng + giá; mỗi nhóm
   có **Chỉnh sửa** về đúng bước và giữ draft. Xác nhận sở hữu và **Gửi duyệt**
   rõ ràng; chỉ hiển thị đã gửi/chờ duyệt sau service thực sự thành công.

Trạng thái bước: chưa nhập / đang chỉnh / đủ thông tin / cần bổ sung.
Tick phản ánh validation hiện có, không suy từ stepNumber thấp hơn bước hiện tại.
Không tô đỏ toàn bộ các bước chưa nhập. Chỉ nêu lỗi khi blur/tiếp tục/gửi thích
hợp; thông báo gần trường, nhóm lỗi có đường tới ô liên quan, sửa đúng thì gỡ lỗi.
Giữ giá trị và focus có ý nghĩa sau đổi bước. Không dùng phần trăm theo 8 trường
như bản cũ vì bỏ sót nhiều điều kiện; ưu tiên Bước n/5, hoặc số nhóm đủ thông tin
với tiêu chí thống nhất. Đủ thông tin khác với đã được hệ thống duyệt.

Không thêm auto-save giả. Giữ cảnh báo thoát và nói rõ thông tin đang nằm trong
phiên. Không can thiệp closure/key/version của lần gửi; lỗi mạng không tự reset
form, bỏ đóng băng hay tạo lần gửi mới.

## Chuyển động và vật liệu

- Đổi bước: nội dung mới trượt 8–12px với chuyển opacity nhẹ khoảng 180–240ms;
  tránh mode wait tạo khoảng trống giữa hai bước. Chỉ một form tương tác/AT tại
  một thời điểm; cleanup đúng khi bấm nhanh/Back. Cần kiểm cách giữ focus khi
  chuyển động, không chốt implementation trước browser QA.
- Active trên thanh tiến trình dịch ngắn; nền/họa tiết đứng yên. Không dùng
  lật giấy/bão giấy/parallax cho thao tác nhập liệu này.
- Giữ motion theo yêu cầu chủ dự án kể cả prefers-reduced-motion; giới hạn ở
  các lần thao tác, giữ viewport/visibility guards và fallback kỹ thuật.
- Tối ưu ảnh nền cũ 7MB và ảnh success 5MB trước sử dụng; không tăng dependency.
  Asset cũ không tự chứng minh provenance/license: giữ nguồn commit và kiểm
  quyền dùng theo quy trình asset khi đưa vào bản shipping.

## Tham khảo và giới hạn

[W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/)
hỗ trợ chia nhóm logic, nêu số bước/trạng thái và giữ thông tin khi quay lại.
[W3C notifications](https://www.w3.org/WAI/tutorials/forms/notifications/)
hỗ trợ lỗi rõ cách sửa ở gần trường và đưa focus đến đầu vào lỗi. Đây là
căn cứ cho usability; lựa chọn bố cục/vật liệu ở trên là đề xuất thiết kế riêng,
không phải kết quả usability test.

Yêu cầu giữ bản Minh mới hơn brief cũ nói không nền minh họa. Nếu được duyệt,
cập nhật DESIGN/surface brief đúng phạm vi, không coi brief cũ là lý do bỏ nền.
Không đổi API/session/database hay mở rộng nghiệp vụ đấu giá/giá/ảnh.

Sau duyệt: làm bố cục một bước đầu cho chủ dự án kiểm nhận diện, sau đó áp dụng
đủ 5 bước và states. Chạy kiểm tra web, bàn phím/AT structure, ảnh dài/tên dài,
laptop 125%, mobile/bàn phím, dữ liệu qua lại/lỗi/thoát-hủy và retry đúng command.
Gửi thật chỉ trong QA test DB/storage theo START_HERE, không ghi DB local chính.
Lượt đề xuất này không chạy product tests, submit form hoặc gửi email.
