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

Mở `http://127.0.0.1:8082/ui`. Các nhóm: nút, nhập liệu, phản hồi, hộp thoại,
sách, chữ và điều hướng; có chế độ chữ 135%. `/design` dùng cùng bộ UI trong ba màn hình mẫu.
Cả hai route chuyển về `/` khi flag không bằng `1`; flag đóng vào bundle khi build,
không phải biện pháp bảo mật. Auth/profile ở `/account` dùng cùng bộ UI ở cấu hình thường.

Khi đổi cờ preview, khởi động Expo với `--clear`. Các script `export:web` và
`export:all` luôn xóa bundler cache: đã phát hiện bundle client giữ giá trị cờ cũ
khi export liên tiếp hai cấu hình mà không xóa cache. Không chạy hai bản export
khác cờ song song. Với bản xuất sẵn, từ root chạy `node scripts/preview-react-native.mjs`
để phục vụ `dist` tại 127.0.0.1:8082 (không tự build, không có hot reload).

## Thành phần và hợp đồng

| API             | Trách nhiệm                                                                                   | Chủ màn hình cần cung cấp                                                         |
| --------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `BrandProvider` | Load font một lần, màn hình chờ/lỗi và retry font                                             | Đặt dưới SafeAreaProvider, trên các màn hình                                      |
| `BrandLogo`     | Logo gốc, tỷ lệ và nhãn                                                                       | Không tự gõ lại wordmark                                                          |
| `AppText`       | Các vai trò title/heading/card/body/bold/small/label/price                                    | Nội dung và role header nếu là tiêu đề                                            |
| `Button`        | Primary/secondary/destructive, pressed/focus/disabled/busy                                    | `title`, `onPress`, `busy`; xử lý mutation ngoài UI                               |
| `BackAction`    | Quay lại: mũi tên + nhãn, vùng chạm tối thiểu 44, xuống dòng/focus/disabled                   | `title`, `onPress`, `disabled`; screen quyết định router và dirty guard           |
| `ActionRow`     | Lối vào một mục: icon, tên, mô tả, mũi tên; vùng chạm và focus                                | `title`, `description`, `icon`, `onPress`; không tự điều hướng                    |
| `IconButton`    | Vùng chạm 44, tên, selected/disabled/focus                                                    | `name`, `label`, `onPress`                                                        |
| `Chip`          | Bộ chọn ngắn, selected và disabled tùy chọn; mặc định vẫn tương tác                           | `title`, `selected`, `onPress`, `disabled`                                        |
| `TextField`     | Label, hint/error, focus, multiline, readonly                                                 | `value`, `onChangeText`, các props TextInput cần thiết                            |
| `SearchField`   | Tìm kiếm có icon và xóa từ khóa                                                               | Label có nghĩa, query và handler                                                  |
| `Checkbox`      | Checked/disabled và nhãn xuống dòng                                                           | State/handler bên ngoài                                                           |
| `Notice`        | info/success/warning/error, live region, dismiss tùy chọn                                     | Nội dung đã kiểm soát; thời điểm hiện/ẩn                                          |
| `StatePanel`    | Loading, rỗng, lỗi vùng nội dung                                                              | Title/message/icon, action có label/handler/busy                                  |
| `Sheet`         | Modal có tên, safe area, scroll, close, Back/Escape, tránh bàn phím                           | Visible, onClose, children; `dismissible`, `backdropDismiss`, `footer` không cuộn |
| `ConfirmDialog` | Câu hỏi có hậu quả, quay lại/confirm, lỗi tại chỗ                                             | Handler, visible/busy/error; không tự đóng khi handler chạy                       |
| `Screen`        | Safe area, keyboard avoidance, scroll, max width, footer                                      | Nội dung; không lồng trong một Screen khác                                        |
| `ActionBar`     | Nhóm hành động trong `Screen.footer`: chia đều, phụ trái/chính phải, dòng trạng thái tùy chọn | Các `Button` có `key`; feature quyết định busy/disabled và mutation               |
| `BookCover`     | Contain, ảnh thiếu/lỗi, phục hồi khi đổi nguồn                                                | Source + nhãn; không có fixture, request hoặc quyền trong component               |
| `BookCondition` | Nhãn tình trạng và hình thức                                                                  | Chuỗi nghiệp vụ đã ánh xạ                                                         |
| `BookPrice`     | Giá bán và giá trị đổi tách biệt, Be Vietnam Pro                                              | Số tiền nguyên không âm; kiểm tra giới hạn nghiệp vụ ở feature/API                |

`ActionButton` và `ErrorNotice` là alias/adapter tương thích cho code cũ, không
phải implementation thứ hai. `Notice error` cũng là adapter; code mới ưu tiên
`tone="error"`. `layout` là các style chung; `colors`, `colorRoles`, `space`,
`radius`, `metrics`, `typography` là token. `TextScale` chỉ phục vụ stress test;
không dùng để vô hiệu hóa font scaling của hệ điều hành.

10/10/2026: role chữ RN dùng Be Vietnam Pro400/700 từ file có sẵn; không còn load
Lora. `searchTitle`28/36 là tiêu đề tác vụ tìm sách. Target chung48dp, control52dp;
`NavigationBar` dùng nền sáng và selected tonal xanh. `/ui` nhóm Chữ/Điều hướng
hiển thị chính các token này. Logo giữ artwork gốc.

`Screen appearance="browse"` là nền sáng với status bar tối; header/footer vẫn
nằm ngoài vùng cuộn và safe area do Screen quản lý. `ShelfSearchHeader` dùng
SearchField/Button có nhãn nhìn thấy. `ShelfResults` giữ nguyên thứ tự API,
mặc định danh sách ảnh cạnh nội dung; giá bán và giá trị đổi không cắt dòng.
`PublicPhoto result` giữ khung ảnh2:3, contain, signed-read/retry/callback hiện có.
Phương án grid chỉ dùng trên showcase để đối chiếu, không là lựa chọn sản phẩm.
`Notice` dùng nền/ngữ nghĩa màu và thông điệp, bỏ viền bên dày; error giữ role
alert/live region và recovery. BrandProvider mở splash sau khi font sẵn sàng hoặc
có lỗi để người dùng thấy được control tải lại font.

Chi tiết Android10/10: [recipe hiện hành](ANDROID_BOOK_DETAIL.md) thay bố cục
UI-1 dưới đây. Tên/tác giả dùng toàn chiều ngang; `BookPresentation.gallery(summary)`
ghép ảnh contain với `BookPrice reading`: hai giá xếp dọc, nhãn14/21 và giá20/28
màu ink. Không còn footer giá cố định hay phiếu đóng dấu. Ảnh thường rộng40%; khi
width<360dp và effective scale>=1.29, BookGallery xếp dọc với khung ảnh rộng132dp và
summary toàn chiều ngang. Có số ảnh và nút “Xem ảnh lớn” có chữ. Chip ảnh hỗ trợ
disabled khi refresh lỗi; mặc định false, giữ selected/disabled accessibilityState
và opacity0.5 khi khóa;
`/ui` nhóm Phản hồi có ví dụ khóa. BookPresentation giữ đủ tình trạng/thiếu trang,
mô tả, metadata mở rộng với expanded accessibilityState và giao nhận;
query/media/action do screen sở hữu.
Showcase dùng cùng recipe và giữ banner dữ liệu mẫu. BookTradeBar/BookCondition
stamp vẫn là primitive hợp lệ cho consumer khác, không là recipe chi tiết mới.
[Evidence/giới hạn](../ui/ANDROID_BOOK_DETAIL_REDESIGN.md).

Luồng lưu10/10: `WishlistButton` là feature control, không là primitive `/ui`.
“Đã lưu sách” là status, “Bỏ lưu sách” là hành động; read/mutation errors dùng
Notice và read retry, loading/busy khóa ghi. Membership theo mọi cursor cần thiết,
không lấy page đầu làm toàn bộ danh sách. Login từ detail giữ UUID returnBook,
quay lại đúng sách và không tự lưu. [Evidence/pilot](../ui/ANDROID_SAVE_USABILITY.md).

Lịch sử UI-1: màn chi tiết sách thử các role `bookTitle`, `bookHeading`, `reading`,
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
Ở vòng01, kệ thật dùng `PublicPhoto compact`; showcase dùng cùng khung2:3 nền giấy. Bỏ
banner khẩu hiệu/ảnh trang trí để sách lên sớm hơn. Không đổi query/filter/cursor,
navigation hoặc thêm chuyển động. Chủ dự án đã từ chối bố cục vòng01.

Kệ vòng02: `ShelfGrid` trở lại hai cột ở chữ thường, một cột khi width<360dp hoặc
fontScale×TextScale>=1.29. Ở một cột, bìa38% cạnh tên/tình trạng, giá tách thành
hàng đủ chiều rộng bên dưới; vùng giá mở cùng chi tiết, không là nút mua.
`PublicPhoto shelf` chỉ chọn khung180dp/nền giấy, giữ query/expiry/retry; ảnh thật
và showcase cùng contain, không crop. `BookOffer` là bản tóm tắt giá dùng ở kệ:
nhãn Bán/Đổi sát số tiền (shelfPrice18/25), `horizontal` cho hàng rộng; wrap khi
thiếu chỗ. Không thay `BookPrice`/footer chi tiết. `/ui` nhóm Sách có ví dụ.
Ở vòng02, tên/tác giả giữ nguyên; người bán chuyển khỏi phần nhìn thấy của kệ, vẫn có ở
nhãn accessible và chi tiết. Kệ dùng compactFooter hiện có, gom đầu màn để bìa
lên sớm; không có animation mới.

Lượt căn hàng sau vòng02: `ShelfGrid` giới hạn tên ba dòng, tác giả một dòng bằng
`AppText numberOfLines`/`ellipsizeMode="tail"`; nhãn accessible giữ nguyên dữ liệu.
Chiều cao tối thiểu của các vùng chữ tính từ typography và fontScale×TextScale.
Hai cột stretch theo hàng; vùng giá dành tối thiểu hai dòng, không thêm giá giả
cho listing chỉ có một giá. Nội dung giá vẫn được wrap/tăng chiều cao. Một cột
ở chữ130%/màn hẹp vẫn có vùng giá riêng, không khóa chiều cao toàn thẻ.
Chủ dự án đã chọn ba dòng ngày01/10 sau ảnh Android hai/ba dòng, cùng dữ liệu.
Không đổi AppText/BookOffer toàn cục hoặc áp ellipsis vào màn chi tiết.

Lượt cửa hàng01/10 (bố cục cũ, thay bằng hướng B bên dưới): `shelfTitle` BeBold16/23, màu mực; nền surface/padding8px
nhóm bản sách, bìa shelf cùng nền surface, contain180dp. Giá giữ18/25 và đủ nhãn.
`ShelfGrid.afterFirstPair` nhận slot trình bày, chỉ chèn sau mục thứ hai. Caller
quyết định điều kiện: kệ mặc định/trang đầu/không lỗi, không thêm truy vấn hay state.
`BookshopNote` là lời biên tập cố định trên nền forest, minh họa SVG trang trí
ẩn với accessibility; bỏ minh họa ở130% hoặc width<360dp để chữ có đủ chỗ.
Không khóa chiều cao, không CTA giả/animation. `/ui` nhóm Sách có ví dụ mới.

Hướng B02/10: `Screen appearance="shelf"` chọn nền `shelfCanvas`, safe area đầu
forest và status bar sáng; mặc định paper giữ nguyên. `ShelfHeader inverse` dùng
`BrandLogo inverse` (asset trắng gốc), nền forest và chữ địa bàn màu giấy.
`ShelfRails` dùng chung kệ thật/showcase: chia tối đa3cuốn liên tiếp theo API,
không sở hữu query/session. Mỗi cuốn160dp; ở130% tăng224dp, giới hạn theo viewport.
Bìa contain196dp/nền kệ, tên ba dòng/tác giả một dòng, stamp và `BookOffer`
không cắt tình trạng/giá. Chiều cao chữ dự trữ theo fontScale×TextScale, các cuốn
stretch cùng hàng; nhóm giá ở đáy thông tin, nội dung dài tự tăng chiều cao.
`PublicPhoto rail` chỉ đổi khung/nền; `onCoverFocus` cho rail đưa cuốn được focus
vào vùng nhìn thấy, không đổi expiry/cache/query/retry. Showcase dùng cùng callback.
Nút trước/tiếp dùng `IconButton`44px, cuộn native có animation khi OS cho phép;
focus/reset luôn chuyển ngay. Vị trí lưu trong
ref, state chỉ đổi ở biên nên không render lại toàn hàng mỗi frame cuộn. Caller
key theo query/cursor để reset khi tìm/lọc/trang, giữ vị trí Back/refetch khi nhóm/
thứ tự sách không đổi. Không cam kết giữ vị trí khi API làm thay nhóm sách.
Không dùng `ShelfGrid`/banner cũ trong kệ thật/showcase; component cũ còn để đọc
lịch sử và ví dụ `BookshopNote` riêng, không là định hướng kệ hiện hành.

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

`NavigationBar` trong UI library là component trình bày: nhận `destinations`
(key/title/icon, accessibilityLabel tùy chọn), `current` và `onSelect`; không đọc session hoặc tự điều hướng.
Nền xanh rừng được cấp bởi `Screen footerAppearance="navigation"`, nằm ngoài
ScrollView. Mục chọn có nền surface/bo8, icon và nhãn rừng; mục còn lại màu giấy.
Nhãn `navigationLabel` BeBold12/18 được xuống dòng; “Sách tôi” giữ tên accessible
“Sách của tôi”, đệm ngang4px giúp ba nhãn gọn ở130%. Không ép font nhỏ/cắt nhãn.
Các vùng chạm chia đều theo
số đích thật, không khóa chiều cao hoặc cắt nhãn. Focus dùng viền rừng trên nền
kem, lá non trên nền xanh. `/ui` nhóm Điều hướng có mẫu đổi chọn và thử chữ lớn.

`MemberNavigation` thuộc `features/navigation`, giữ route/session/filter quyền
và `router.navigate` hiện có. Nó compose primitive trên kệ, account/login, ví
chỉ đọc và danh sách sách; không gắn trong editor để bỏ qua dirty guard hoặc
thêm tab ví/chat/giao dịch giả. Screen mặc định giữ footer giấy cho form/giao dịch.
SafeAreaView sở hữu inset một lần; navbar không tự cộng bottom padding. Vùng nút
Android giữ nền sáng và nằm dưới footer app, kiểm cả gesture/ba nút hệ thống.
`expo-navigation-bar` SDK57 ở root dùng alias `SystemNavigationBar`, khác primitive
navbar của app. Plugin `enforceContrast:false/style:dark` và root `style="dark"`
đặt nút Android tối trên safe area sáng; cần binary có module/config mới. Giữ
font scaling, gesture và visibility hệ thống. Không thêm padding/paint nền inset
hoặc đổi theme điện thoại. Dark theme sau này cần đổi đồng bộ nền và màu nút.

Kệ công khai dùng `SearchField.onSubmitEditing` để tìm bằng phím Search/Enter và
`maxLength` để giới hạn đầu vào; feature vẫn kiểm tra độ dài Unicode theo contract.
`BookCover` hỗ trợ `cachePolicy`, `onError`, `onLoad`, `loading` và opt-in `fadeIn`;
ảnh ký dùng `cachePolicy="none"`. `PublicPhoto` bật fade160ms, phản hồi tải URL/
bytes nằm trong khung bìa, không thêm dòng làm thay chiều cao. Child theo source
gỡ ngay khi ảnh không khả dụng; bỏ callback sau unmount để lỗi request cũ không
làm hỏng lần thử mới. Các consumer không bật `fadeIn` giữ trình bày mặc định.
Feature quản lý hạn URL, refetch khi trở lại foreground, placeholder và nút thử lại;
component không tự ký URL hoặc xác định quyền. `/ui` có mẫu tìm kiếm và lỗi tải ảnh.

`Sheet motion="photo"` là opt-in cho ảnh lớn: scrim và body hiện nhẹ160ms,
translate12dp; header/nút đóng không chuyển động. Đóng ngay, không giữ Modal hoặc
ảnh để fade-out. Sheet khác/ConfirmDialog mặc định không animation. `/ui` nhóm
Hộp thoại có ví dụ xem ảnh từ asset catalog hiện có.

`useReducedMotion` dùng một subscription OS chung, cập nhật nóng; chưa đọc được
preference hoặc SSR thì coi là bật. Tắt fade/translate và cuộn bằng nút có
animation; focus/reset vẫn tức thì. Token `motion` chung là160ms/12dp, không đổi
timing request/timeout. Không thêm dependency hoặc engine gesture.

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

## Member web — CategoryDiscovery

12/10/2026, React/Vite `apps/user-web` only. Source:
[CategoryDiscovery.tsx](../../apps/user-web/src/components/CategoryDiscovery.tsx)
and [scoped styles](../../apps/user-web/src/components/CategoryDiscovery.module.css).
Home's real/preview latest-shelf composition is the current consumer; this DOM
component does not inherit RN primitives or imply a native `/ui` example.

API: `preview: boolean`. A named section/nav displays eight shared registry roots
initially, then every17 root through Tất cả danh mục/Thu gọn with aria-expanded/
controls and unique useId labels. Root links use categoryId and explicit
data=preview/live. The component owns only expansion; no fetch, session, listing
mutation, result count or loaded-page inventory claim. Empty roots still link
to Search's normal empty state. Registry is release-controlled catalog-v2,
17 roots/72 nodes/25 facets; runtime Admin taxonomy CRUD is separate work.

Links wrap at12px gaps (8px below600px), use44px minimum height,8px corners,
quiet shop-line borders,14px task text (13px narrow) and a15px wine arrow.
Hover reuses shelf ground/wine edge over150ms under the owner motion policy;
2px wine focus at3px offset remains visible. Disclosure is a44px underlined
wine action. Existing Home category heading/container styles supply placement;
the component adds no new palette, font, asset or design world.

The [Home surface record](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-homepage-tsx.md)
and [v2 evidence](../../.impeccable/review/catalog-v2/README.md) document source,
expanded-directory capture, AI ship verdict and remaining gates. The118-preview
edition covers are existing sourced remote URLs, separate from listing photos;
all-node stock/native/human acceptance is not implied.

## Member web — OwnerListingRow

12/10/2026, React/Vite `apps/user-web` only. This DOM component is separate from
the React Native foundation above. Source:
[OwnerListingRow.tsx](../../apps/user-web/src/components/OwnerListingRow.tsx),
with styles in [MyBooksPage.module.css](../../apps/user-web/src/pages/MyBooksPage.module.css).
The actual examples are `/my-books` (full row) and `/account` (compact preview);
no RN `/ui` example or native acceptance is implied.

```tsx
<ul>
  {items.map((item) => <OwnerListingRow key={item.id} item={item} compact />)}
</ul>
```

API: `item: MyListing`, `compact?: boolean` (default false). The component emits
one `li`; the consumer supplies its list, loading/empty/error shell, filtering
and pagination. It owns the existing owner identity/photo reads through the
shared SessionClient/query cache; it does not perform listing mutations or
decide server permissions. Identity keys include owner/book/catalog status;
photo keys include owner/listing/revision/first media id. Confirmed identity
uses public catalog, other statuses use the owner's catalog request. Photo
and identity errors have independent retry; missing photos remain placeholders.

Full mode preserves condition/mode, pending explanation and update date. Compact
mode omits those secondary fields, while retaining title/author, separate
moderation/visibility/trade labels, rejection/removal reasons when returned,
sale price and exchange value (including zero). Only Approved/Visible rows link
to public detail; Reserved, Hidden, Removed and Exchanged keep their own labels.

Rows use fine rules, wrapping text, wine emphasis and contain-fitted owner
photographs. Full desktop layout has108px cover/150px price columns; compact
uses a64px cover column and moves wrapped prices beneath metadata. Compact
cover ground has96px minimum height with52×84px image at its base rule; responsive
image widths also follow the shared shelf media rules. Full shelf breakpoints
at1100/760/360px retain its existing two-column narrow layout. This is a shared
owner task row, not the public animated BookCard.

The [overview surface record](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-accountoverviewpage-tsx.md)
links final source/capture comparison, isolated browser checks and limitations.
Fake storage evidence does not establish real Supabase or native acceptance.

## Member web — PurchaseDialog / PurchaseAddressFields

17/10/2026, React/Vite `apps/user-web` only. Sources:
[PurchaseDialog.tsx](../../apps/user-web/src/components/PurchaseDialog.tsx),
[dialog styles](../../apps/user-web/src/components/PurchaseDialog.module.css),
[PurchaseAddressFields.tsx](../../apps/user-web/src/components/PurchaseAddressFields.tsx)
and [PurchaseFlow.module.css](../../apps/user-web/src/pages/PurchaseFlow.module.css).
Real examples are `/buy-now/:listingId` (address and order confirmation),
`/checkout/:listingId?conversationId=…` (negotiated buyer quote),
`/chat/:roomId` (seller order creation) and `/sell` (origin address).
There is no Member web `/ui` showcase; RN `/ui` is unchanged.

`PurchaseDialog` takes `open`, `onClose`, `title`, `children`, optional
`description`, `busy` (default false) and `className`. Its native DOM `dialog`
is portalled to `document.body`: opening locks body scroll, focuses the title
and contains Tab/Shift+Tab; closing/unmount restores scroll and the connected
trigger's focus. Title changes focus the heading and reset dialog scroll.
Escape, the labelled close button and a pointer outside the dialog bounds call
`onClose` unless busy. The consumer controls visibility and must disable its
form fields/actions while a command is pending; `busy` guards dismissal only.

```tsx
<PurchaseDialog open={open} onClose={close} title="Địa chỉ nhận sách"
  busy={busy} className={flow.flow}>
  <form onSubmit={submit}>
    <fieldset disabled={busy}>
      <PurchaseAddressFields addresses={addresses} selected={selected}
        onSelect={setSelected} form={form} onChange={setForm}
        localities={localities} />
      <button type="submit" className={flow.primary}>Xem phí giao hàng</button>
    </fieldset>
  </form>
</PurchaseDialog>
```

`PurchaseAddressForm` contains string `recipientName`, `phone`, `localityCode`
and `detail`. Fields take `addresses: (PurchaseAddressForm & { id: string;
isDefault: boolean })[]`, `selected: string`, `onSelect(id)`, `form`,
`onChange(form)` and `localities: { code: string; label: string }[]`.
A matching saved ID shows radio selection; any unmatched value (callers use
`"new"`) shows editable fields. Native required/length/phone constraints and
visible labels apply; API validation remains authoritative. Both components
leave fetching, draft state, saving, quotes, versions and command replay to
the consumer. Checkout selects a confirmed saved ID before requesting its quote,
so a definite quote rejection can retry without saving the same address again.

The recipe inherits wine/cream/paper, Be Vietnam Pro controls,8px control and
12px panel corners; Anton remains on purchase-page headings. This popup's
width is capped at600px, with bounded vertical scrolling and28px body insets;
at600px and below it uses20px insets,24px viewport clearance and bottom safe-area
padding. Form controls have48px minimum height and16px text; the two-field row
stacks below700px. Scoped input specificity preserves the `shop-control` border
over legacy global input CSS. The protected-focus entrance settles18px over260ms
with cubic-bezier(.16,1,.3,1), retained under either OS motion preference per
the owner's11/10 policy. This is a local recipe, not a replacement for other dialogs.

[Documentation comparison](../../.impeccable/review/purchase-popup/DOCUMENTATION.md)
records incumbent-system scope and drift. Browser evidence and AI review do not
establish human, native or live-provider acceptance; READINESS is unchanged.

## Member web — conversation guidance and Exchange ChatPanel

18/10/2026. Actual examples: `/chat/:roomId` and `/exchange/:id`.
There is no Member web `/ui` showcase. The purchase room's local guidance uses
the existing APIs; it does not grant transaction rights or infer payment from
chat text. A greeting suggestion only populates the draft. Order creation and
payment preserve their existing receipts and retry keys/bodies.

[ChatPanel](../../apps/user-web/src/components/exchange/ChatPanel/index.tsx)
takes actual `messages`, `partner`, `giveBooks`/`receiveBooks` title arrays,
`statusText`, `guidance`, `onSendMessage`, `onRetry`, optional `isLoading`,
`loadError`, `isRefreshing`, `isReadOnly` and `unavailable`.
Its `#exchange-chat` anchor pairs with the parent `#exchange-actions` section;
parent controls permissions, fetching, mutation and invalidation. Do not pass
live-user text as an authoritative system event. History errors show retry
without clearing cached messages, and send errors retain the input.
Both contexts use wine/cream, Be Vietnam Pro and44px controls with visible focus.
See the [chat surface record](../../apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-chatpage-tsx.md)
for scoped browser evidence and verification limits.

## Member web conversation workspace —19/10/2026

`components/conversation/AgreementTerms` renders real mode/price proposals and
retains uncertain command intents in memory. `ExchangeOffer` selects the current
member's available exchangeable books and saved address. `ConversationInbox`
combines purchase cards and unlinked Exchange history without fabricating unread
counts. Shared `Conversation.module.css` defines agreement/chat columns, card inbox
and mobile panel navigation. Exchange BookInfoCard/ProgressStepper accept compact
presentation for the agreement column; their lifecycle meanings are unchanged.
ADR0041 and the ChatPage surface brief define permission and replay behavior.
ChatPage's local book-dossier trial above960px puts real book identity in a wine
agreement header; the adjacent white chat has a partner-led header. Both retain
one spread and separate agreement-body/message scrolling.
The action area is outside the body rather than a sticky overlay. Narrow panels
keep mounted drafts and natural sheet flow. Shared scoped typography uses
400/700 weights and title/data/body/metadata roles. Accepted-price edits and
complete event history are disclosures; closing either leaves transaction data
intact. Shared styles still support standalone Exchange; route/history remain.
ChatPage opts into faint existing ivory-paper texture through
`--conversation-paper-texture`. The wine header replaces the small bookmark;
real cover is80px wide (max120px tall), title20px/1.3. Cover float within a flow-root
keeps text adjacent and lets long titles use the full width below the image,
without truncating the title. Below960px, shared book context
stays above both tabs, with64px/48px covers and20px title on phones. Shared
ListingPhoto retains loading/missing/error/retry, cream-on-wine fallback copy and
focus. White chat uses local `--conversation-chat-surface`. Active empty chat
uses the existing64px penguin with empty alt text, hidden
for history errors/expired rooms. Standalone Exchange keeps its existing surface.
AgreementTerms groups mode/request-to-exchange before a compact price summary and
price entry. Listing price leads until a price is accepted; fees stay visible.
ChatPage's keyboard-accessible “Cách giao dịch” disclosure contains routine help
and the phase trail, expanded for expired/missing-fulfillment/stale-quote guidance.
Pending proposals, stale accepted revisions and errors remain outside disclosure.
