# Nghiệm thu React Native tại mốc bàn giao

Ngày chuẩn bị: 28/09/2026. **Chưa chạy các ca native dưới đây.** Đây là hướng dẫn
và phiếu ghi kết quả, không phải báo cáo PASS. Phạm vi sản phẩm giữ F2h/0.20.0;
không kiểm checkout/ví/Order bằng UI vì các màn đó chưa triển khai.

## Mốc nguồn và điều kiện thực thi

- Nguồn ứng dụng cần kiểm: `76230ca09e94df69157845717e4d89d49b4641a0`
  (bao gồm checkpoint F2h và sửa operations). Các thay đổi sau trong nhánh
  `codex/handoff-acceptance-pack` chỉ bổ sung tài liệu.
- APK debug x86_64 hiện có từ vòng build 28/09; SHA-256 kiểm lại khớp:
  `6CBE6646C80013B27D8F06E3799855EA2CC6E9664BE337E7CF12B8FEA945A039`.
  APK không đóng gói JS độc lập: phải ghi cả commit bundle Metro đang phục vụ.
  APK này không dùng cho điện thoại ARM. Nếu build lại, ghi hash mới.
- Preflight đọc lại 28/09: cấu hình, Node, PostgreSQL, **17 checksum migration**,
  private bucket và API readiness PASS; không có job ảnh quá hạn. Kết quả không
  chứng minh worker đang chạy hoặc upload mới đã thành công.
- RN env đang trỏ localhost: còn WARN đường tới API từ thiết bị.
  `adb devices -l` hiện không có thiết bị. Chưa khởi động emulator/Metro trong lượt này.
- Metro trước đó bị automatic approval review chặn (`blocked by policy`). Agent
  không khởi động lại bằng lệnh/port/cơ chế khác để né chặn. Người vận hành thực hiện
  trong môi trường được phép theo [Android quality](../ANDROID_QUALITY.md).

Đọc [START_HERE](START_HERE.md), [hướng dẫn Android](../ANDROID_QUALITY.md) và
[quy tắc UI](../design/UI_CODING_RULES.md). Ghi máy/OS/thiết bị trước khi thao tác.
Mốc x86_64 chỉ được nghiệm thu cho AVD đã ghi; không tự suy ra ARM hoặc iOS.

## Chuẩn bị dữ liệu và phiên chạy

1. Dùng môi trường QA/local riêng, không dùng dữ liệu người dùng thật. API và worker
   ảnh cùng nguồn/migration. `pnpm doctor:local` phải hết FAIL; xử lý WARN URL.
   Không chạy E2E xóa fixture trên database app/demo dùng chung.
2. Member ACTIVE và Admin/Staff độc lập đăng nhập được. Seed có một Member;
   không tạo vai trò hoặc đổi mật khẩu bằng SQL. Tránh quá 5 lần login/account/IP
   trong 15 phút; không tắt limiter để làm nghiệm thu qua.
3. Chuẩn bị ảnh sách có quyền sử dụng: JPEG/PNG/WebP hợp lệ, một ảnh >10.000.000 byte,
   một file HEIC nếu thiết bị giữ định dạng đó. Ghi loại **picker thực sự trả về**:
   nếu OS chuyển HEIC thành JPEG thì không tính là đã kiểm ca từ chối HEIC.
4. Dùng Supabase bucket private đã cấu hình cho ca upload thật; ghi provider và
   môi trường, không ghi URL ký tạm, khóa, mật khẩu hoặc token vào báo cáo.
   Dữ liệu QA được tạo qua UI/API hợp lệ; không gán Approved bằng SQL.
5. Làm theo bảng URL trong REACT_NATIVE_START: emulator dùng 10.0.2.2 hoặc reverse
   được cấu hình rõ; điện thoại dùng LAN tin cậy. Không đổi `.env` đang dùng của
   người khác. `/ui` cần cờ design preview trong bundle; không coi cờ là phân quyền.
6. Mở bàn phím **docked**; ghi cỡ chữ OS mặc định và mức lớn thực tế (ví dụ 1.3/2.0
   nếu OS hỗ trợ). Không dùng riêng chế độ 135% của `/ui` thay cho cỡ chữ OS.

**Phân biệt offline:** debug APK cần Metro để nạp JS. Chặn riêng đường tới API
trong môi trường QA, giữ Metro truy cập được để kiểm restore khi API mất kết nối.
Nếu tắt Wi-Fi khiến JS chưa nạp được, ghi BLOCKED ở ca cold start; đó chưa phải lỗi
session và cũng chưa phải PASS. Offline hoàn toàn khi khởi động cần artifact có JS
đóng gói và một lượt nghiệm thu riêng; không tự mở rộng sang release build ở đây.

## Ca kiểm tra theo thứ tự

Tất cả ca khởi đầu **NOT_RUN**. PASS cần quan sát kết quả trên thiết bị, không chỉ
thấy request 200. BLOCKED ghi điều kiện thiếu; FAIL ghi bước tái hiện và lỗi.
Không biến NOT_RUN/BLOCKED thành N/A để đóng gate. N/A cần lý do theo nền tảng,
người phụ trách phạm vi xác nhận và ghi rõ giới hạn bàn giao.

| ID | Thao tác | Kết quả cần thấy |
|---|---|---|
| N01 | Mở app từ launcher; mở lại sau khi tắt app | Tên/icon/splash Lật lại đúng, không còn Expo mẫu; vào kệ, không văng app |
| N02 | Guest tìm/lọc, mở sách tên dài, xem ảnh lớn; Back | Hai giá có nhãn, ảnh contain; Back đóng ảnh trước, nội dung không bị cắt |
| N03 | Một lần nhập sai rồi đăng nhập Member đúng | Lỗi dễ hiểu; profile từ API, không hiện token; không lặp login làm vướng limiter |
| N04 | Đăng nhập xong, force-stop rồi mở lại, không xóa app data | Refresh từ SecureStore khôi phục đúng Member; không lộ dữ liệu tài khoản khác |
| N05 | Khi đã có phiên, làm API mất kết nối; mở lại; khôi phục mạng và retry | Có trạng thái phục hồi, giữ refresh token khi lỗi mạng; khôi phục đúng phiên; phân biệt Metro như trên |
| N06 | Đăng xuất, đóng/mở app | Vẫn đăng xuất; màn riêng và ảnh riêng cũ không còn hiển thị |
| N07 | Tài khoản → địa chỉ: tạo với dữ liệu thiếu rồi nhập đủ; sửa/default | Field error đúng ô, giữ dữ liệu; bàn phím docked không che ô/nút; DEMO-A/B có nhãn mô phỏng |
| N08 | Tạo nháp → chọn/request đầu sách; Back khi sheet đang mở | Đóng sheet đúng thứ tự, giữ nội dung đang nhập; catalog chưa xác nhận không bị trình bày thành đã xác nhận |
| N09 | Trong form ảnh, mở picker rồi hủy | Không tạo ảnh/rác mới, form không đổi, nút thoát busy và dùng được tiếp |
| N10 | Picker quyền truy cập hạn chế/từ chối theo OS; quay lại rồi cho phép/chọn ảnh | Không văng hoặc busy vô hạn; có cách thử lại; không mặc định phải có prompt nếu OS dùng photo picker không cần quyền thư viện toàn phần |
| N11 | Chọn JPEG/PNG/WebP thật; chờ worker; lưu và mở lại nháp | Pending/Processing → Ready; preview đúng chiều; lựa chọn ảnh được lưu, upload thật có bằng chứng provider |
| N12 | Chọn ảnh quá 10 MB hoặc MIME không hỗ trợ do picker trả về | Báo lỗi đọc được, giữ form, không thêm ảnh Ready giả; ghi trường hợp OS tự chuyển định dạng |
| N13 | Trong cùng phiên app, ngắt đường API khi đang upload rồi nối lại và retry | Thử lại yêu cầu đang giữ; không tạo ảnh trùng/submit hai lần. Bằng chứng byte/key qua test tự động bổ sung, không suy ra chỉ từ UI |
| N14 | Sau Ready đưa app xuống nền rồi trở lại; thử khi preview không tải được | Không giữ ảnh riêng hiển thị khi nguồn không hợp lệ; có retry; khi mạng phục hồi tải lại được, không gửi lại bài |
| N15 | Điền tình trạng, giá, nơi gửi và xác nhận; thử gửi khi thiếu trường | Đến lỗi đầu tiên/hướng dẫn rõ, giữ nội dung qua các bước; không submit thiếu thông tin |
| N16 | Sửa form rồi Back phần cứng/gesture; hủy rời màn; thử lần nữa và đồng ý | Hủy giữ dữ liệu; đồng ý mới bỏ phần chưa lưu. Khi bàn phím mở, kiểm Back đóng bàn phím trước |
| N17 | Lưu/gửi duyệt; reviewer độc lập từ chối; Member sửa/gửi lại; reviewer duyệt | Pending chỉ đọc, lý do từ chối rõ, revision mới; chỉ bài đủ điều kiện mới xuất hiện trên kệ |
| N18 | Approved: sửa chưa gửi rồi hủy; ẩn/mở lại; archive một bài QA riêng | Bản công khai không đổi khi chỉ sửa local; các xác nhận nêu hậu quả; kết quả đúng trạng thái |
| N19 | Địa chỉ nơi gửi đã chọn bị sửa/xóa qua phiên hợp lệ khác; quay lại listing | Không âm thầm nhận snapshot mới; yêu cầu chọn/cập nhật nơi gửi theo trạng thái API |
| N20 | Chạy lại form dài, sheet, lỗi, checkbox và BackAction với chữ OS lớn + docked keyboard | Đọc/scroll/tap được, nút không bị bàn phím/safe area che; không mất nội dung do phóng chữ |
| N21 | TalkBack: đi từ kệ → profile → form → checkbox → dialog; đọc lỗi | Nhãn, thứ tự đọc, checked/disabled đúng; focus dialog/đóng/hủy dùng được. iOS dùng VoiceOver, ghi riêng |

N13 không tự chứng minh lost-ack sau commit. Ca mất ack chính xác đã có trong
browser/transport suite; nếu môi trường thiết bị không điều khiển được điểm cắt,
ghi rõ chỉ kiểm mất mạng, giữ phần lost-ack native chưa kiểm. Intent upload chỉ giữ
trong bộ nhớ; không kỳ vọng sống qua force-stop hoặc đổi tài khoản.

LOCKED/RESTRICTED có bằng chứng browser/API; nếu kiểm thêm native, phải có tài khoản
fixture được chuẩn bị hợp lệ trong QA. Admin lock/unlock UI chưa có; không hướng dẫn
người thử sửa database app để dựng trạng thái. Ghi riêng ca chưa có fixture.

## Phiếu kết quả cần điền

Sao chép phần này vào một file evidence mới; không sửa template thành PASS hàng loạt.
Một lần chạy chỉ kết luận cho commit, thiết bị và cấu hình đã ghi.

```text
Người thực hiện / ngày giờ / người review:
Commit app / commit API-worker / working tree sạch hay diff đính kèm:
Thiết bị / AVD / ABI / OS / bàn phím / cỡ chữ / TalkBack hoặc VoiceOver:
Artifact APK hash / loại debug-release / commit JS Metro:
Môi trường dữ liệu / storage thật hay fixture / API reachability (không credentials):
Preflight / process worker / điều kiện offline đã mô phỏng:
N01..N21: mỗi ID một dòng STATUS | quan sát thực tế | ảnh/video | issue (nếu có)
Ca bổ sung LOCKED/RESTRICTED, ảnh lỗi, nền tảng khác:
Lỗi chưa xử lý / BLOCKED / NOT_RUN / giới hạn nền tảng:
Kết luận người thực hiện / người reviewer / phạm vi được nghiệm thu:
```

Ảnh chỉ chứa dữ liệu QA; không chụp mật khẩu, network Authorization, SecureStore
hoặc signed media URL. Dùng request ID hợp lệ khi báo lỗi; không nộp nguyên log
request/response. Giữ nguyên dữ liệu tái hiện cho tới khi đối chiếu, sau đó dọn qua
luồng hợp lệ trong môi trường QA, không reset database dùng chung.

**Điều kiện đóng gate:** các ca áp dụng có bằng chứng và đã xử lý lỗi chặn; không
còn BLOCKED/NOT_RUN bị bỏ qua; reviewer xác nhận đúng phạm vi thiết bị. Update
[READINESS](READINESS.md) với đường dẫn báo cáo thực thi. Viết checklist này chưa
đóng gate native, và không thay [review độc lập](INDEPENDENT_REVIEW.md).
