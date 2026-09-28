# Điểm lưu để tiếp tục — 28/09/2026

## Đọc ngay

Chủ dự án yêu cầu lưu tiến trình, push an toàn và giao kế hoạch dài cho bạn tiếp
nhận dùng Claude. **Chỉ bàn giao nguồn; chưa chứng nhận release hay mua sách hoàn chỉnh.**
Kế hoạch: [CONTINUATION_PLAN](CONTINUATION_PLAN.md). Prompt:
[NEXT_SESSION_PROMPT](NEXT_SESSION_PROMPT.md). Setup: [START_HERE](START_HERE.md).

- Nhánh bàn giao: `codex/handoff-roadmap` trên remote
  `https://github.com/huangg49/used-book-marketplace.git`.
- Mốc code UI mới nhất: `7211236`; báo cáo lỗi mở lại cuối: `3808b57`.
- Baseline nguồn F2h: `beea372`; checkpoint cũ
  `checkpoint/f2h-handoff-2026-09-28` được giữ nguyên.
- Commit của tài liệu bàn giao: lấy bằng `git log -1`; xác minh SHA nhánh remote
  theo lệnh dưới. Không suy ra đã push chỉ từ việc file này tồn tại.
- Không merge/main, force push, sửa tag cũ hoặc xuất `.env`/DB/APK cho người nhận.

```sh
git ls-remote origin refs/heads/codex/handoff-roadmap
git rev-parse HEAD
```

## Phần đã xong

| Phạm vi | Hiện trạng / bằng chứng |
|---|---|
| Backend | F2h/OpenAPI 0.20.0, 17 migration; auth/listing/media/address/quote/Order/ví mô phỏng đến InTransit và review quá hạn. [START_HERE](START_HERE.md) phân biệt từng API/UI |
| Baseline QA | Clone sạch baseline: 127 unit, 480 API E2E, hai suite browser; [REBUILD](REBUILD.md). Đây là kết quả ở mốc đã ghi, không phải vừa chạy lại mọi test |
| Media native | Sửa launcher worker bằng Nest; JPEG qua Supabase thật trên Android đã có bằng chứng; không đồng nghĩa mọi ca native đều qua |
| Mobile vòng 1 | Thanh điều hướng, account/login, kệ và bộ lọc với footer cố định; [MOBILE_EXPERIENCE](MOBILE_EXPERIENCE.md) |
| Mobile vòng 2 | Kệ/chi tiết dùng chung presentation, ảnh dễ mở, thông tin gọn, mẫu riêng có attribution; [SHELF_DETAIL_REVIEW](SHELF_DETAIL_REVIEW.md) |
| QA vòng UI mới nhất | 61 RN unit/9 file, RN lint/typecheck, contract check, preview/normal export và RN browser regression qua; gate route mẫu qua |
| Native vòng UI mới nhất | Pixel_7/Android 15 x86_64: kệ, detail, modal/Back, chữ OS 130%; font đã trả về 1.0. JS qua Metro trên APK sẵn có, không build APK mới |
| Operations | Queue/detail, nhãn giá, retry/conflict/focus đã có evidence; không cần làm lại nếu không đổi code liên quan |

## Phần dở phải xử lý trước

**A00 — Android dừng splash sau lượt export cuối.** Trước đó cùng code đã chạy
và có ảnh QA. Sau force-stop/mở lại bằng `mobilereactnative:///showcase`, app đứng
ở logo. Metro port 8081 trả running; `adb reverse` 8081/3000 đúng. Log được đọc
không có ReactNativeJS/AndroidRuntime error; chưa biết nguyên nhân.

Một lệnh tiếp theo mở lại MainActivity và đọc bundle HTTP bị bộ duyệt tự động
chặn với lý do chung “blocked by policy”. Không thực thi và không lách chặn.
Người tiếp nhận kiểm môi trường/quyền của mình trước khi tiếp tục; không coi việc
đổi công cụ là cách vượt một chặn còn hiệu lực. Nếu vẫn bị chặn, ghi blocker và
chuyển sang công việc không phụ thuộc thao tác đó; không đánh dấu A00 hoàn thành.

Thông tin máy trước chỉ để chẩn đoán, **không hard-code khi chuyển máy**:

- Repo Windows: `C:\Users\ASUS\Documents\LaiLai\used-book-marketplace`.
- Android package: `com.huangg49.mobilereactnative`; AVD Pixel_7, emulator-5554.
- API 3000, Metro 8081; QA API 3009/media 3010/web 8087; Postgres test 55434.
- Metro/API/worker là process local đang có. Khảo sát lại owner/command trước khi
  dừng/restart; PID trong chat cũ không còn là căn cứ. Không giết toàn bộ node/java.
- Secret nằm ở `.env` local, không gửi trong chat/Git. Máy mới tạo `.env` từ setup
  và nhập key riêng qua kênh an toàn; chưa có key thì ghi rõ media test bị giới hạn.

## Chưa làm / không được hiểu nhầm

- Form đăng sách và địa chỉ vẫn cần chỉnh nhịp mobile; chưa hoàn tất thẩm mỹ toàn app.
- Native N01–N21 còn ca chưa chạy, TalkBack/iOS/ARM và independent R01–R09 còn mở.
- Chưa có wallet/checkout/Order/shipment/report UI; backend có không nghĩa là UI có.
- Chưa Delivered/Buyer receipt/inspection 72h, xử lý claim/review, trả sách,
  quyết toán Seller, rút tiền, reconciliation hằng ngày hay account lock/unlock UI.
- Chưa workflow Exchange/ViaPoint/auction; DEMO-A/B là mã vùng mẫu, không là hai điểm.
- Chưa đăng ký/email verification/password recovery hoàn chỉnh; không demo login
  bằng tài khoản seed như đã có onboarding người dùng mới.
- Kệ `/` có thể rỗng đúng dữ liệu. `/showcase` là ảnh tư liệu và dữ liệu mẫu có nhãn,
  không phải hàng đang bán; đừng publish các ảnh này để lấp kệ.

## Quy trình cập nhật điểm lưu

Sau mỗi gói: ghi ID, commit, file chính, test đã chạy/kết quả, bằng chứng native
nếu có, lỗi còn mở và đúng một bước tiếp theo. Không ghi test chưa chạy là PASS.
Không lặp full suite để tiêu thời gian; chỉ lặp gate khi có thay đổi/rủi ro liên quan.
Trước khi kết thúc phiên: `git status`, commit việc đã hoàn chỉnh và push nhánh đã
được chủ dự án cho phép; đối chiếu remote SHA. Việc chưa xong ghi rõ working tree.
