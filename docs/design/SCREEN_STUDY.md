# Bước 2 — Dấu chuyền tay trong ba màn hình React Native

Ngày kiểm tra: 25/09/2026. Trạng thái: prototype tương tác để review thiết kế.
Đây chưa phải tính năng marketplace kết nối API hoặc bản phát hành native.

Tiếp nối bước 3: primitive đã được chuyển sang `src/core/ui` và dùng chung với
auth/profile; có catalog `/ui`. Phần mô tả primitive cục bộ bên dưới là mốc lịch
sử bước 2. Xem [hợp đồng component hiện tại](UI_COMPONENTS.md) và
[luật giao diện](UI_CODING_RULES.md). Phạm vi dữ liệu mẫu/thiếu native QA vẫn giữ nguyên.

## Ý đồ thiết kế

“Một cuốn sách, một lần gặp mới” chuyển câu chuyện thương hiệu thành hành động:
tìm một cuốn muốn đọc, hiểu rõ bản sách trước khi nhận, rồi mô tả trung thực cuốn
sách mình muốn chuyền tay. Bìa sách là hình ảnh chính; giao diện không cạnh tranh
với bìa bằng gradient, hiệu ứng kính, khối trang trí hay hàng loạt card nổi.

| Màn hình | Quyết định và lý do |
|---|---|
| Khám phá | Kệ hai cột, bìa giữ nguyên tỷ lệ, tiêu đề Lora, tình trạng đặt trước giá. Dấu trang lưu sách là một hành động thật. Hero thu lại khi tìm kiếm để dành chỗ cho kết quả. |
| Chi tiết | Ảnh lớn và thông tin ấn bản giúp nhận diện đúng sách. Giá bán và giá trị đổi tách riêng. “Trước khi chuyền tay” nhấn mạnh mô tả tình trạng; không có đánh giá, độ khan hiếm hoặc huy hiệu uy tín bịa đặt. |
| Đăng sách | Bốn bước trong một luồng: đầu sách → ảnh/tình trạng → bán/đổi → kiểm tra. Luôn thấy vị trí hiện tại và nút tiếp tục. Mỗi bước hỏi thông tin cần cho quyết định tiếp theo. |

Màu lấy trực tiếp từ đề xuất `packages/brand/v1.1/identity.tokens.json`.
Lora 600 dùng cho tiêu đề và tên sách; Be Vietnam Pro dùng cho hướng dẫn, nút,
giá và ký hiệu đồng. Cam terracotta là dấu nhấn đồ họa; chữ nhỏ dùng rustText.
Logo gốc giữ nguyên. Không biến mọi đoạn văn thành khẩu hiệu thương hiệu.

Ảnh lưu trữ có giấy phép và ghi nguồn ở màn hình chi tiết. Các ảnh không chứng
minh tình trạng một bản sách đang bán. Fixture thứ tư cố ý có tên tiếng Việt dài,
giá 1.000.000 đồng và không có ảnh để kiểm tra thiết kế ngoài trường hợp đẹp nhất.
Xem [nguồn tài sản](../../apps/mobile-react-native/assets/design/README.md).

## Chạy và review

Từ thư mục `apps/mobile-react-native`, dùng PowerShell:

```powershell
$env:EXPO_PUBLIC_DESIGN_PREVIEW = '1'
pnpm exec expo start --web --port 8082
```

Mở `http://127.0.0.1:8082/design`. Cấu hình `.env` theo README của ứng dụng;
prototype không cần đăng nhập và không gọi API marketplace. Dừng server rồi bỏ
biến môi trường khi trở lại chế độ thông thường:

```powershell
Remove-Item Env:EXPO_PUBLIC_DESIGN_PREVIEW
```

Biến `EXPO_PUBLIC_*` được đóng vào bundle lúc build. Khi không đặt bằng `1`,
route `/design` chuyển về `/`. Đây là công tắc review, không phải cơ chế bảo mật
hay bảo đảm tài sản prototype bị loại khỏi bundle. Không phát hành build bật
preview như sản phẩm hoàn chỉnh.

Trên Expo native đã cấu hình, vào route `/design` bằng deep link của development
server. Cần kiểm tra native riêng; bản web chỉ giúp review nhanh cùng mã màn hình.

Nút **Kiểm thử** mở các trạng thái mô phỏng: đang tải, mất kết nối, rỗng, thiếu ảnh,
sách giữ chỗ và tài khoản hạn chế. Có nút điền nháp mẫu và tăng chữ 135%.
Chữ lớn trong bảng này là stress test typography, không thay thế Dynamic Type,
TalkBack hoặc VoiceOver. Kệ chuyển một cột khi hệ số chữ tổng hợp từ 130%.

## Hành vi đã có

- Tìm không dấu theo tên/tác giả/thể loại; lọc bán/đổi; sắp xếp giá hoặc giá trị đổi.
- Lưu/bỏ lưu sách; quay từ chi tiết về đúng kệ; giữ bộ lọc trong phiên.
- Xem ảnh lớn, nguồn ảnh, tình trạng và giá. Nút mua/đổi mở giải thích bước tiếp
  theo, chưa tạo đơn hoặc đề nghị đổi. Trạng thái không đủ điều kiện chặn nút.
- Chọn ảnh thiết bị để xem cục bộ, xóa ảnh, tối đa 8 ảnh; giới hạn thử 10 MB/ảnh
  khi picker trả kích thước. Đây chưa phải kiểm tra hoặc xử lý ảnh trên server.
- Kiểm tra từng bước, giá nguyên 10.000–1.000.000 theo POL16 của SRS hiện tại,
  phân biệt giá bán/đổi; chặn thiếu trang trọng yếu và yêu cầu xác nhận quyền đăng.
- Gửi thử khi mất mạng giữ nguyên nháp và báo lỗi. Khi hợp lệ, thông báo rõ chưa
  gửi dữ liệu lên server. Nháp và sách đã lưu chỉ tồn tại trong phiên, mất khi reload.

## Bằng chứng kiểm tra

Các lệnh sau đạt trên workspace ngày 25/09/2026:

```text
pnpm contract:check
pnpm --filter @used-books/mobile-react-native typecheck
pnpm --filter @used-books/mobile-react-native lint
pnpm --filter @used-books/mobile-react-native test
EXPO_PUBLIC_DESIGN_PREVIEW=1 pnpm --filter @used-books/mobile-react-native export:all
```

Dòng cuối minh họa biến môi trường; trong PowerShell đặt biến như phần chạy ở trên.
16 test đạt: 10 test session có sẵn, 6 test mới về tìm kiếm, giao bộ lọc với kệ
đã lưu, biên giá, dữ liệu theo hình thức giao dịch, kiểm tra lại toàn bộ nháp và
chặn ảnh quá giới hạn/thiếu trang. Export tạo bundle Android, iOS, web; không
phải APK/IPA và không chứng minh build native thành công.

Đã thao tác trong browser trên cùng mã React Native:

- Tìm `jane`, lưu sách, mở chi tiết và quay lại đúng kệ đã lưu; kệ không khớp
  bộ lọc có thông báo và hành động bỏ bộ lọc riêng.
- Nút mua mở lời giải thích bản thử; sách giữ chỗ khóa cả mua và đổi.
- Form trống bị chặn; chọn ảnh JPEG trong repo qua file chooser và hoàn tất mô tả;
  giá 9.000 bị chặn; chưa xác nhận quyền đăng bị chặn.
- Gửi thử mất mạng giữ dữ liệu, khôi phục trạng thái bình thường rồi hoàn tất;
  tài khoản hạn chế khóa nút gửi.
- Sắp xếp tăng dần trả 85.000 → 95.000 → 125.000 → 1.000.000; thử lại sau lỗi
  mạng trả về bốn sách; trạng thái tải, rỗng và thiếu ảnh hiển thị đúng nhánh.
- Đã xem ba màn hình ở 390 × 844, chi tiết ở 320 × 740, form chữ 135% ở 320 × 740
  và bố cục desktop. Form 320 px không tràn ngang. Chip lọc cuộn ngang có chủ ý.
- Tên dài tiếng Việt trên chi tiết 390 px không tràn ngang; font đã tải. Hai lỗi
  console ban đầu về SVG và BackHandler web đã sửa, không có lỗi mới trong vòng
  kiểm tra sau khi reload.

Đây là kiểm tra tập trung, không phải kiểm thử mọi tổ hợp kích thước và trạng thái.
Không chạy lại API E2E vì bước 2 không thay đổi endpoint, auth hoặc contract.

## Ranh giới và bước tiếp theo

Mã nằm riêng tại `src/features/design-preview`; route chỉ compose màn hình.
Không có token store, transport hoặc quyền nghiệp vụ thứ hai. Font, màu và các
primitive hiện cục bộ trong prototype; chưa tuyên bố là thư viện UI ổn định cho cả
team. Auth/profile và token runtime chung chưa được chuyển sang nhận diện 1.1.

Trước khi nâng thành màn hình sản phẩm cần chạy Android/iOS thật: safe area,
bàn phím, ảnh và quyền truy cập thư viện, Back Android, tiếng Việt, font scaling,
TalkBack/VoiceOver, focus modal, thiết bị nhỏ và thời gian tải ảnh. Sau đó tích hợp
catalog/listing theo contract đã review, phân trang, upload an toàn, bản nháp bền
vững và quyền/state transition do server quyết định. Không dùng fixture làm cache
server hoặc xem trạng thái mô phỏng là authorization.

Bước 3 sẽ rút bộ luật coding giao diện, token và component dùng chung từ các quyết
định đã kiểm chứng này, kèm tiêu chí review chống giao diện chung chung. Không coi
“trông không giống AI” là bằng chứng chất lượng; cần bản sắc, tính rõ ràng, tính
trung thực và khả năng sử dụng nhất quán.
