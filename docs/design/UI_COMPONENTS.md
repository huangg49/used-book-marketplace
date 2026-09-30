# Component React Native dùng chung

Bản đầu 25/09/2026. Source: `apps/mobile-react-native/src/core/ui/`.
Import qua `core/ui` (facade `ui.tsx` trỏ đến barrel `ui/index.ts`).
Thư viện nằm trong app vì hiện chỉ có một client React Native; không đưa dependency
React Native vào package brand dùng chung cho Flutter/web.

## Xem component thật

Từ thư mục `apps/mobile-react-native`, PowerShell:

```powershell
$env:EXPO_PUBLIC_DESIGN_PREVIEW = '1'
pnpm exec expo start --web --clear --port 8082
```

Mở `http://127.0.0.1:8082/ui`. Sáu nhóm: nút, nhập liệu, phản hồi, hộp thoại,
sách và chữ; có chế độ chữ 135%. `/design` dùng cùng bộ UI trong ba màn hình mẫu.
Cả hai route chuyển về `/` khi flag không bằng `1`; flag đóng vào bundle khi build,
không phải biện pháp bảo mật. Auth/profile ở `/account` dùng cùng bộ UI ở cấu hình thường.

Khi đổi cờ preview, khởi động Expo với `--clear`. Các script `export:web` và
`export:all` luôn xóa bundler cache: đã phát hiện bundle client giữ giá trị cờ cũ
khi export liên tiếp hai cấu hình mà không xóa cache. Không chạy hai bản export
khác cờ song song. Với bản xuất sẵn, từ root chạy `node scripts/preview-react-native.mjs`
để phục vụ `dist` tại 127.0.0.1:8082 (không tự build, không có hot reload).

## Thành phần và hợp đồng

| API | Trách nhiệm | Chủ màn hình cần cung cấp |
|---|---|---|
| `BrandProvider` | Load font một lần, màn hình chờ/lỗi và retry font | Đặt dưới SafeAreaProvider, trên các màn hình |
| `BrandLogo` | Logo gốc, tỷ lệ và nhãn | Không tự gõ lại wordmark |
| `AppText` | Các vai trò title/heading/card/body/bold/small/label/price | Nội dung và role header nếu là tiêu đề |
| `Button` | Primary/secondary/destructive, pressed/focus/disabled/busy | `title`, `onPress`, `busy`; xử lý mutation ngoài UI |
| `BackAction` | Quay lại: mũi tên + nhãn, vùng chạm tối thiểu 44, xuống dòng/focus/disabled | `title`, `onPress`, `disabled`; screen quyết định router và dirty guard |
| `ActionRow` | Lối vào một mục: icon, tên, mô tả, mũi tên; vùng chạm và focus | `title`, `description`, `icon`, `onPress`; không tự điều hướng |
| `IconButton` | Vùng chạm 44, tên, selected/disabled/focus | `name`, `label`, `onPress` |
| `Chip` | Bộ chọn ngắn, trạng thái selected | `title`, `selected`, `onPress` |
| `TextField` | Label, hint/error, focus, multiline, readonly | `value`, `onChangeText`, các props TextInput cần thiết |
| `SearchField` | Tìm kiếm có icon và xóa từ khóa | Label có nghĩa, query và handler |
| `Checkbox` | Checked/disabled và nhãn xuống dòng | State/handler bên ngoài |
| `Notice` | info/success/warning/error, live region, dismiss tùy chọn | Nội dung đã kiểm soát; thời điểm hiện/ẩn |
| `StatePanel` | Loading, rỗng, lỗi vùng nội dung | Title/message/icon, action có label/handler/busy |
| `Sheet` | Modal có tên, safe area, scroll, close, Back/Escape, tránh bàn phím | Visible, onClose, children; `dismissible`, `backdropDismiss`, `footer` không cuộn |
| `ConfirmDialog` | Câu hỏi có hậu quả, quay lại/confirm, lỗi tại chỗ | Handler, visible/busy/error; không tự đóng khi handler chạy |
| `Screen` | Safe area, keyboard avoidance, scroll, max width, footer | Nội dung; không lồng trong một Screen khác |
| `ActionBar` | Nhóm hành động trong `Screen.footer`: chia đều, phụ trái/chính phải, dòng trạng thái tùy chọn | Các `Button` có `key`; feature quyết định busy/disabled và mutation |
| `BookCover` | Contain, ảnh thiếu/lỗi, phục hồi khi đổi nguồn | Source + nhãn; không có fixture, request hoặc quyền trong component |
| `BookCondition` | Nhãn tình trạng và hình thức | Chuỗi nghiệp vụ đã ánh xạ |
| `BookPrice` | Giá bán và giá trị đổi tách biệt, Be Vietnam Pro | Số tiền nguyên không âm; kiểm tra giới hạn nghiệp vụ ở feature/API |

`ActionButton` và `ErrorNotice` là alias/adapter tương thích cho code cũ, không
phải implementation thứ hai. `Notice error` cũng là adapter; code mới ưu tiên
`tone="error"`. `layout` là các style chung; `colors`, `colorRoles`, `space`,
`radius`, `metrics`, `typography` là token. `TextScale` chỉ phục vụ stress test;
không dùng để vô hiệu hóa font scaling của hệ điều hành.

UI-1: màn chi tiết sách thử các role `bookTitle`, `bookHeading`, `reading`,
`annotation`, `stamp`, `bookPrice` trong theme dùng chung. `BookCondition stamp`
thêm nhãn tình trạng có viền và tách hình thức giao dịch; không là huy hiệu kiểm
định. `BookPrice reading` dùng nhãn 14px/giá 20px; mặc định của các consumer cũ
giữ nguyên. `/ui` nhóm Sách có ví dụ. Không tự áp token thử nghiệm sang màn khác
trước khi chủ dự án duyệt màn chuẩn theo [DESIGN](../DESIGN.md).

UI-1 hướng A: `BookTradeBar` chỉ trình bày giá bán/giá trị đổi bằng `BookPrice`
và một slot `children` cho trạng thái hoặc hành động do caller quản lý. Không có
logic checkout/quyền trong component. `Screen compactFooter` giảm padding dọc
footer xuống 8px (mặc định vẫn 16px), giữ footer ngoài ScrollView/trong safe area,
không overlay hoặc khóa chiều cao. `/ui` nhóm Sách có footer mẫu và chế độ chữ lớn.
Chi tiết thật chỉ hiện footer khi có listing khả dụng và không lỗi refetch; không
đưa giá đã cũ vào vùng giao dịch. C04 sau này phải cấp hành động thật qua slot và
kiểm lại quyền/navigation; không chỉ bật một cờ UI để mở giao dịch.

Tinh chỉnh màn chuẩn03: `BookCondition stamp` bỏ nhãn nhìn thấy “Tình trạng”
nhưng giữ accessibility label “Tình trạng: …”; `mode` vẫn viết rõ dưới dấu.
Gallery chi tiết dùng cột40%, gap16; `PublicPhoto compact` và showcase dùng
khung2:3 nền giấy, `contain` giữ ảnh nguyên vẹn. Lượt màn chuẩn03 chưa đổi kệ;
lượt áp dụng sang kệ được mô tả bên dưới.
Status mẫu/chi tiết: “Tiệm chưa nhận đơn ở bản này.”, giữ font scaling tự nhiên.

Tinh chỉnh giá: `BookTradeBar` dùng `BookPrice reading columns`, hai nhóm nhãn/giá
co giãn theo nội dung, gap tối thiểu32px; thiếu chỗ thì wrap cả nhóm. Khoảng cách
đến slot trạng thái8px. `BookPrice` mặc định và kệ giữ nguyên; `/ui` nhóm Sách có
footer dùng cùng component để kiểm mẫu giá. Không ép giá vào cột hẹp hay thu nhỏ chữ.

UI-1 kệ sách (sau khi chủ dự án duyệt chi tiết): `ShelfGrid` giữ tên export và
callback nhưng trình bày từng hàng, bìa34% bên trái, tên/tình trạng/hình thức/giá
bên phải. `shelfTitle` dùng Lora18/26; nhãn và tác giả dùng annotation14/21.
`BookPrice reading stacked` xếp hai nhóm nhãn/giá theo chiều dọc, gap12px, tránh
dí hai giá vào một cột hẹp; mặc định và footer chi tiết giữ nguyên. `/ui` có ví dụ.
Kệ thật dùng `PublicPhoto compact`; showcase dùng cùng khung2:3 nền giấy. Bỏ
banner khẩu hiệu/ảnh trang trí để sách lên sớm hơn. Không đổi query/filter/cursor,
navigation hoặc thêm chuyển động. Màn kệ mới chờ duyệt ảnh trước/sau.

Cập nhật 29/09: Android xử lý `fontScale` qua Expo plugin để giữ Activity và
picker khi trở lại từ cài đặt chữ. `AppText` tạo lại riêng native Text theo
`useWindowDimensions().fontScale`, tránh Fabric giữ số đo cũ làm cắt nhãn;
không remount form/TextInput hoặc tắt font scaling. `/ui` có hướng dẫn kiểm
đổi cỡ chữ hệ thống trong lúc đang nhập. Xem [Q01-F01](../handoff/Q01_NATIVE_COMPLETION_2026_09_29.md).

Cập nhật 27/09: `Screen.scrollRef` tùy chọn nhận ref của ScrollView, phục vụ
cuộn đến phần tổng hợp lỗi hoặc đầu bước mới mà không unmount nội dung form.
`Button.selected` tùy chọn công bố trạng thái qua accessibilityState/aria-pressed;
feature vẫn cung cấp nhãn rõ trạng thái và style secondary phù hợp. `/ui` có nút
chọn/bỏ chọn và nút “Về đầu nội dung” để kiểm tra hai hành vi này.

Checkbox khai báo cả `accessibilityState` và `aria-checked`/`aria-disabled` để
web xuất trạng thái đúng trong DOM. Catalog nhập liệu có mẫu bật/tắt và mẫu đã
chọn bị khóa. Kiểm tra 26/09/2026 phát hiện dấu tích hiển thị nhưng thiếu
`aria-checked` trên web; kiểm tra native với TalkBack/VoiceOver vẫn cần thực hiện.

## Ví dụ: lỗi tại ô nhập

```tsx
<TextField
  label="Giá bán (đồng)"
  value={price}
  onChangeText={setPrice}
  keyboardType="number-pad"
  hint="Nhập số tiền, ví dụ 125000."
  error={priceError}
/>
<Button title="Gửi duyệt" busy={mutation.isPending} onPress={submit} />
```

Feature kiểm tra giá theo chính sách. Component không tự suy luận tiền hay gửi
request. Điều kiện server vẫn là nguồn quyết định cuối cùng.

## Ví dụ: xác nhận và thất bại

```tsx
<ConfirmDialog
  visible={confirmOpen}
  title="Bỏ bản nháp?"
  message="Nội dung chưa lưu sẽ bị bỏ."
  confirmLabel="Bỏ bản nháp"
  destructive
  busy={mutation.isPending}
  error={errorMessage}
  onCancel={() => setConfirmOpen(false)}
  onConfirm={submitDiscard}
/>
```

`submitDiscard` chặn gọi trùng, đặt busy, await kết quả; chỉ đóng dialog sau thành
công. Khi lỗi, giữ dialog và nháp, gán lời giải thích an toàn. `presentError`
không tự retry, đăng xuất, điều hướng hay hiện modal. Các hành vi đó do feature
và session owner quyết định.

## Mở rộng

Cập nhật 29/09: `Screen.footer` dùng cùng lề ngang và max width với nội dung nên
nút cuối màn hình thẳng hàng với ô nhập. `ActionBar` gom cặp hành động lặp lại ở
editor bài đăng và form địa chỉ (lưu/tiếp tục, quay lại/lưu) và giữ chúng trên bàn
phím; `note` dùng cho trạng thái như “Có thay đổi chưa lưu.”. `/ui` nhóm Nút có ví dụ.
Không dùng ActionBar cho hơn hai hành động hoặc hành động phá hủy; những thao tác đó
ở trong nội dung hoặc `ConfirmDialog`.

Cập nhật mobile 28/09: `Sheet.footer` nằm ngoài ScrollView; dùng cho hành động
chính của bộ lọc. Lỗi áp dụng đặt ngay trên hành động trong footer. Nội dung dài
cuộn độc lập, đóng/Back bỏ lựa chọn chưa áp dụng. `/ui` có ví dụ bảng dài và footer.
`SearchField.submitLabel` biến icon tìm thành nút có tên khi có onSubmitEditing.
`TextField.accessibilityLabel` cho tên đầy đủ trong nhóm ô có nhãn ngắn (Từ/Đến);
không dùng placeholder làm nhãn. Các trường không truyền vẫn lấy tên từ label.
`ActionRow` dùng ở tài khoản; mẫu tương tác nằm trong nhóm Hộp thoại của `/ui`.

Thanh điều hướng ba đích thuộc `features/navigation`, không thuộc UI library:
nó biết route/session, chỉ gắn trên kệ, account/login và danh sách sách. Không gắn
trong editor để không bỏ qua dirty guard. Không có tab ví/chat/giao dịch giả.

Kệ công khai dùng `SearchField.onSubmitEditing` để tìm bằng phím Search/Enter và
`maxLength` để giới hạn đầu vào; feature vẫn kiểm tra độ dài Unicode theo contract.
`BookCover` hỗ trợ `cachePolicy` và `onError`; ảnh ký dùng `cachePolicy="none"`.
Feature quản lý hạn URL, refetch khi trở lại foreground, placeholder và nút thử lại;
component không tự ký URL hoặc xác định quyền. `/ui` có mẫu tìm kiếm và lỗi tải ảnh.

`ShelfGrid`, `BookPresentation` và `BookGallery` thuộc `features/shelf`, dùng chung
giữa kệ/chi tiết thật và `features/shelf-showcase`. Chúng nhận dữ liệu và callback;
không sở hữu session, query hoặc mutation. Ảnh ký hạn vẫn do `PublicPhoto` quản lý.
Fixture chỉ ở showcase; không thêm vào `src/core/ui`. Hai route xem mẫu cho phép
development hoặc cờ preview, có nhãn mẫu thường trực và không nằm trên thanh
điều hướng sản phẩm. Xem [vòng kệ/chi tiết](../handoff/SHELF_DETAIL_REVIEW.md).

Component mới cần một trường hợp dùng thật, API nhỏ, ví dụ tương tác trong `/ui`,
kiểm tra trạng thái liên quan và hướng dẫn. Không tạo provider/store toàn cục cho
mỗi thông báo. Hiện thông báo nhẹ có thể được dismiss tại chỗ; chưa có toast queue,
portal stack hoặc engine dựng form tổng quát vì các luồng hiện tại chưa cần chúng.

Font Lora static 600 nằm ở `assets/fonts/`, license OFL đi kèm. Be Vietnam Pro và
logo lấy từ brand package. Không tải font từ CDN. Hình sách mẫu chỉ nằm trong
feature/assets review, không thuộc module UI. Xem [bộ luật](UI_CODING_RULES.md)
và [quyết định kiến trúc](../adr/0004-react-native-ui-foundation.md).
Kết quả kiểm tra và giới hạn được ghi ở [báo cáo bàn giao](UI_FOUNDATION_REPORT.md).

Root layout đặt `StatusBar` kiểu `dark` để giờ/pin giữ tương phản trên nền giấy,
kể cả khi Android dùng chế độ tối. Đây là lựa chọn cho bảng màu sáng hiện tại;
nếu thêm dark theme, phải đổi đồng bộ màu nền và thanh trạng thái.
Kiểm tra bổ sung Android/web: [quality report](../ANDROID_QUALITY.md).
