# MongoDB — Android upload và phục hồi lỗi

29/09/2026, nhánh `codex/mongodb-native-upload`, base **1452927**. Codex thao tác
trên Android emulator; chưa có reviewer người. Gói này chỉ thêm bằng chứng/tài liệu,
không sửa runtime, UI, contract hoặc migration; không push/merge/deploy.

## Môi trường và cách ly

- Pixel_7, Android 15/API35, x86_64, emulator-5554, ảnh1080×2400, font OS1.0.
  APK debug hiện có SHA-256
  `62e7dfd687ff33dd1ba64b6c747cb70b9ea6b1c4b5e01c69ef81573eadcb390f`.
  Không build APK mới; Metro8081, preview=0, UI không đổi từ lượt Q01.
- API3002 và media worker chạy cùng API build của lane MongoDB; Node24.19.
  MongoDB QA57017 có auth/replica set, database UUID `_test`, migrate3, app user
  ít quyền. Supabase thật, bucket private QA mới, Sharp worker thật.
- Sao lưu `files`/`shared_prefs` của app trước QA; chỉ copy `users` và `auth_sessions`
  từ bản sao acceptance57117 sang QA để kiểm phiên hiện có. Không copy media keys,
  listings hoặc dữ liệu giao dịch; không chạy cleanup trên bucket nguồn.
  Refresh trong lượt QA chỉ rotate session ở database QA.
- Tạo bản nháp và chọn ảnh bằng UI thật. Ba file public-domain Alice từ asset có
  sẵn của repo; PNG chuyển định dạng, WebP dùng fixture Q01. Không gửi duyệt bài.
  SHA-256 và MIME đọc từ Mongo khớp file nguồn, không suy MIME từ tên file.

## Kết quả

| Ca | Kết quả và phạm vi |
|---|---|
| N09 | PASS: mở picker rồi hủy, vẫn0 ảnh; Mongo0 media/0 jobs; mở picker tiếp được. |
| N11 | PASS ba định dạng: PNG8.046.730 byte, WebP294.722 byte, JPEG1.319.776 byte; chọn bằng photo picker, upload Supabase thật, worker→Ready và preview. Lưu/mở lại giữ3 ảnh; DB có3 links/3 jobs đã xong. |
| N13 — lost ACK content | PASS: proxy nhận PUT200 từ API rồi đóng socket phía app5 lần. Trước retry thủ công: JPEG Pending/version2, đúng1 create receipt +1 content receipt, chưa finalize. Bấm retry sau gỡ fault→Ready/version4; tổng6 PUT, cùng1 key hash/1 body hash; đúng1 finalize receipt và1 job cho ảnh. Không tạo intent/ảnh trùng. |
| N14 — nền và lỗi preview | PASS phạm vi quan sát: sau lưu, Home→trở lại app vẫn dùng được. Khi GET private media/read trả503 có kiểm soát lúc mở lại form, preview bị ẩn, checkbox đã lưu vẫn checked và có “Tải lại ảnh”. Gỡ fault, bấm nút của một ảnh→preview trở lại. Cold start sau đó tải lại preview bình thường. Không thử hết hạn URL hoặc giết process giữa upload. |
| Khởi động lại | Force-stop/mở lại, refresh200, vào kệ không đứng splash; sách của tôi vẫn3 ảnh; mở lại bước ảnh thấy3/8, Ready, checked. |
| Đối soát | `checkIntegrity` bằng Mongo app user: `failures=[]`;3 media Ready,3 links,3 jobs,0 unfinished; mỗi media đúng1 receipt cho create/content/finalize. |

Proxy riêng loopback3102→API3002; ADB tạm3000→3102, Metro không đổi.
Chỉ cắt phản hồi PUT content của đúng nháp QA và GET read-preview của nháp đó.
Không ghi token, raw idempotency key, body hoặc signed URL. Lost ACK này là
**HTTP content PUT sau commit**, không phải lỗi Mongo commit, finalize hay submit.
Không chạy lại ca mid-PUT của Q01 trên Mongo trong lượt này.

Có một cảnh báo debug `ReactNativeJS: Error: undefined` lúc19:27:15 sau lượt
fault upload; không có thêm stack trong log hẹp đã đọc. App vẫn lưu/reopen/cold
start thành công. Chưa xác định nguồn cảnh báo; không khẳng định log sạch.

## Bằng chứng và tái kiểm

[JSON Mongo trước/sau retry và hash đường truyền](evidence/mongodb-native-upload-2026-09-29/database-and-faults.json)
chỉ có dữ liệu QA và metadata đã lọc secret. Ảnh cùng thư mục:

- [Hủy picker](evidence/mongodb-native-upload-2026-09-29/01-picker-cancel.png),
  [PNG Ready](evidence/mongodb-native-upload-2026-09-29/02-png-ready.png),
  [WebP Ready](evidence/mongodb-native-upload-2026-09-29/03-webp-ready.png).
- [Mất ACK](evidence/mongodb-native-upload-2026-09-29/04-lost-ack-retry.png),
  [JPEG phục hồi](evidence/mongodb-native-upload-2026-09-29/05-jpeg-recovered.png),
  [Nháp lưu3 ảnh](evidence/mongodb-native-upload-2026-09-29/06-saved-three-photos.png).
- [Preview lỗi](evidence/mongodb-native-upload-2026-09-29/07-preview-unavailable.png),
  [Preview phục hồi một ảnh](evidence/mongodb-native-upload-2026-09-29/08-preview-recovered.png),
  [Sau cold start](evidence/mongodb-native-upload-2026-09-29/09-cold-start-saved.png),
  [Mở lại ảnh](evidence/mongodb-native-upload-2026-09-29/10-cold-start-preview.png).

Launcher/fault harness/log ở `.tmp/mongodb-native/` ignored, không là dependency
runtime hoặc bộ kiểm tự động portable. Private config và backup app có thông tin
phiên: không in/commit. Khi tái kiểm, tạo DB/bucket mới, dùng app/session QA riêng
hoặc sao lưu/khôi phục có chủ đích; không tái dùng media keys của DB import.
HTTP/provider acceptance có script opt-in portable ở
[gói live media](MONGODB_LIVE_MEDIA_2026_09_29.md).

## Khôi phục và gate còn mở

Đã force-stop app, khôi phục backup, trả reverse3000→3000/8081→8081. API3000
refresh200 và đọc sách cũ200; bản nháp cũ Alice/1ảnh hiện lại đúng. Dừng API3002,
worker QA và proxy3102; xóa đúng DB UUID và bucket QA tạo trong lượt này. Lần cleanup
đầu lỗi chưa xác định stage; lần hai thành công cả bucket/DB. Không sửa `.env`,
SQL5433, DB acceptance57117 hoặc bucket nguồn. API3000/Metro8081 vẫn chạy như trước;
không bật worker cleanup trên bản sao acceptance.

Không chạy lại493E2E/build/lint vì không sửa code sản phẩm; các số đó giữ evidence
ở ec4a9c9. Lượt này kiểm native/DB read-only, kiểm JSON/hash/count, contract check
và diff-check. Full native/TalkBack/N20 còn thiếu tổ hợp, ARM/iOS, live packaging,
human review tiền/quyền và CI remote cho commit mới vẫn mở. Chưa cutover DB chính.
Bước tiếp: N21 với TalkBack thật khi có dịch vụ và audio quan sát được; nếu chưa
có điều kiện, tiếp gói live packaging QA riêng, không tự ký human-review gate.
