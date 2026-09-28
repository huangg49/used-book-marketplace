# Ma trận nghiệm thu listing 0.1

Đọc cùng [đặc tả](LISTING_SLICE.md). Đây là ma trận đích, **chưa nghiệm thu toàn bộ**.
Đối chiếu từng ca và giới hạn bằng chứng ở [báo cáo nghiệm thu](LISTING_ACCEPTANCE_REPORT.md).
Các phần API có bằng chứng ở [catalog/nháp](CATALOG_DRAFT_API_REPORT.md),
[media](MEDIA_UPLOAD_REPORT.md), [submit/review](LISTING_REVIEW_API_REPORT.md);
[public shelf](PUBLIC_SHELF_REPORT.md) và [lifecycle](LISTING_LIFECYCLE_REPORT.md)
bổ sung API/UI; native còn giới hạn ghi riêng. Mã LS-AC độc
lập với AC trong SRS để không ghi đè ma trận gốc.

Baseline nay là [SRS1.1](../SRS_V1_1.md). Các ca ở đây kiểm tra lát cắt listing;
point/auction/custody cần thêm [38 nhóm ca](LOCAL_TRANSACTION_ACCEPTANCE.md), không
được đánh Passed nhờ tests nháp/catalog. Duyệt thông tin không được sinh badge kiểm
tra hiện vật hoặc chính hãng. Fulfillment/geographic/commitment fields chưa có ở API0.8.

## Bộ dữ liệu tối thiểu

- M1/M2: MEMBER ACTIVE, đã xác minh; MR: MEMBER RESTRICTED.
- S1/S2: STAFF ACTIVE; SM: MEMBER + STAFF ACTIVE; A1/A2: ADMIN ACTIVE.
- T1: TEST_OPERATOR không có STAFF/ADMIN; Guest không token.
- B1: catalog Confirmed; B2: Pending do M1 đề nghị; B3: Rejected.
- Ảnh hợp lệ, sai MIME/đuôi, hỏng, EXIF vị trí, quá dung lượng/pixel,
  Pending/Failed và ảnh thuộc M2; chỉ dùng dữ liệu demo có quyền sử dụng.
- Listing ở từng moderation/visibility; fixture Reserved/Sold/Exchanged/
  ClosedUnavailable chỉ tạo qua test factory, không thêm endpoint thay state.

E2E dùng DB riêng có tên kết thúc `_test`. Không reset DB dev/chung, không sửa
mật khẩu seed. Object storage test có namespace riêng; cleanup đúng object do
run tạo, không xóa bucket dùng chung.

## Ca kiểm thử

| Mã | Tình huống | Kết quả bắt buộc | Mức / nguồn |
|---|---|---|---|
| LS-AC01 | Tạo nháp thiếu ảnh/giá, lưu, mở lại sau restart | Dữ liệu server còn đúng; Guest/M2 không đọc được; chưa lên kệ | API + RN / FR-L01, LS-D02 |
| LS-AC02 | M1 gửi đủ dữ liệu với B1, S1 duyệt, Guest tìm/detail | Đúng một listing/revision được duyệt, ảnh đúng hiện vật, giá đúng chế độ | E2E / UC-02 |
| LS-AC03 | Sale/Exchange/Both: giá thiếu, null sai chế độ, âm/lẻ/chuỗi | 10.000 và 1.000.000 đạt; 9.999 và 1.000.001 không đạt; sai kiểu bị chặn | Unit + API / POL-16 |
| LS-AC04 | Mô tả 29/30/5.000/5.001 ký tự sau trim; tiếng Việt/emoji/HTML | Biên thống nhất client/server; giữ dấu; HTML hiện thành text | Unit + API + UI / SRS §11.3 |
| LS-AC05 | Thiếu chi tiết tình trạng, unreadable hoặc missingEssentialContent | Không gửi; thiếu trang không trọng yếu phải mô tả và vẫn qua review | API + RN / FR-L02 |
| LS-AC06 | Không ISBN, ISBN-10/13 đúng/sai checksum, trùng sau normalize | Không ISBN hợp lệ; sai bị chặn; trùng không tạo catalog thứ hai | Unit + DB / FR-C01 |
| LS-AC07 | Listing với B2; S1 approve trước/sau khi A1 xác nhận B2 | Pending chưa public; trước xác nhận 409; sau đó duyệt đúng version được | API + operations / FR-C02, LS-D03 |
| LS-AC08 | Catalog bị từ chối, sửa/gửi lại; Admin tự duyệt yêu cầu của mình | Listing vẫn chờ; lịch sử/lý do còn; tự duyệt bị chặn | API / LS-D09 |
| LS-AC09 | 0/1/8/9 ảnh, chưa Ready, ảnh của M2 hoặc listing khác | Chỉ 1–8 ảnh Ready đúng owner/listing được gửi; không lộ asset riêng qua lỗi | API + storage / FR-L01 |
| LS-AC10 | File hợp lệ, giả/hỏng/nhiều frame/>10 MB/>40 MP | Kiểm tra nội dung thật; file sai không Ready; không treo xử lý | Storage / SRS §11.3, spec §8 |
| LS-AC11 | EXIF xoay/vị trí; HEIC trên thiết bị; URL ký hết hạn | Ảnh đúng hướng, bản hiển thị bỏ vị trí; HEIC chuyển đổi hoặc báo rõ; URL hết hạn bị chặn | Storage + native / spec §8 |
| LS-AC12 | Đổi listingId/mediaId sang M2; Guest ghi; T1 review | 404 đối tượng riêng; 401 không token; 403 thiếu role; dữ liệu không đổi | API negative / NFR-07 |
| LS-AC13 | SM duyệt/gỡ listing của mình; STAFF không MEMBER thử đăng | Bị chặn; role Staff không mặc nhiên có quyền Member | API negative / SRS §2.5, §4 |
| LS-AC14 | MR tạo/sửa/gửi/mở lại; MR đọc và ẩn/xóa listing hợp lệ của mình | Chặn nhóm đầu; cho nhóm sau theo bảng; kiểm tra server | API + RN / spec §6 |
| LS-AC15 | Reject thiếu/quá ngắn lý do; reject hợp lệ rồi chủ sửa | Lý do sai bị chặn; lý do đúng hiện cho chủ; revision cũ và quyết định còn | API + UI / FR-L03 |
| LS-AC16 | Đổi từng book/ảnh/mô tả/tình trạng/giá/chế độ sau Approved | PendingReview nguyên tử, ngừng public; bản cũ bất biến | API + DB / FR-L04 |
| LS-AC17 | Sửa Approved với dữ liệu sai; sửa trực tiếp PendingReview | Không đổi state/version/nội dung; không thay nội dung đang review | API / LS-D04–05 |
| LS-AC18 | Ẩn/mở Approved; mở khi Pending/Rejected hoặc chủ Restricted | Chỉ đủ điều kiện mới mở; không tự Approved | API + RN / FR-L06 |
| LS-AC19 | Xóa mềm; Staff gỡ; chủ mở/sửa lại Removed | Public 404; giữ revision/ảnh/audit; chủ không vượt quyết định gỡ | API + DB / FR-L06–07 |
| LS-AC20 | List/detail mọi tổ hợp moderation/visibility/trade/status chủ | Chỉ predicate đủ điều kiện được trả; không email/địa chỉ/lý do/ảnh nháp | API contract / FR-C05, AC-05 |
| LS-AC21 | Link public cũ sau sửa/gỡ/hạn chế chủ; URL ảnh đã cấp | Không cấp dữ liệu mới; UI báo không còn khả dụng; URL cũ chỉ còn tối đa TTL đã công bố | API + web / spec §5, §8 |
| LS-AC22 | Tìm tiếng Việt/tác giả/ISBN; filter/sort giá; phân trang giá trùng | Đúng tập, tie-break ID ổn định; null không thành 0; eligibility ở mọi trang | API + RN / FR-C04 |
| LS-AC23 | Hai Staff approve/reject cùng version | Một thắng, một 409; một quyết định/audit/outbox; state nhất quán | DB concurrency / FR-L03 |
| LS-AC24 | Approve cạnh tranh xóa/gỡ; hai phiên cùng sửa | Một thay đổi theo version thắng; không publish bản xóa/gỡ, không mất chỉnh sửa âm thầm | DB concurrency / FR-L04–07 |
| LS-AC25 | Restrict chủ/thu hồi role cạnh tranh submit/approve | Thứ tự commit được bảo vệ; sau restrict không public; không dùng status cũ commit sau | DB concurrency / BR-02 |
| LS-AC26 | Cùng key/payload đồng thời; khác payload; timeout sau commit rồi retry | Một hiệu ứng/receipt; khác payload 409; replay không lỗi chỉ vì version đã tăng | API + DB concurrency / spec §7 |
| LS-AC27 | Crash trước commit/sau commit trước response hoặc dispatch | Trước commit rollback cả audit/outbox/receipt; sau commit replay đúng, không mất event | Fault injection / NFR-09 |
| LS-AC28 | Reserved/Sold/Exchanged/ClosedUnavailable gọi sửa/ẩn/xóa | Chặn; không đổi trade/custody hay giải phóng reservation | API negative / FR-L05, BR-08 |
| LS-AC29 | Upload/finalize lặp, storage thành công DB lỗi, cleanup lặp | Không nhân đôi ảnh Ready; dọn đúng orphan; không xóa object có revision | Storage + fault / spec §8 |
| LS-AC30 | Mất mạng lưu/gửi; 401/403/409/422/429; rời form chưa lưu | Giữ nội dung phiên; không tự gửi key mới/báo thành công giả/ghi đè conflict | RN / UI rules |
| LS-AC31 | Native ảnh thật, bàn phím, Back, safe area, chữ lớn, screen reader | Dùng được điều khiển; đọc được lỗi; không mất nút/nhập liệu; ghi thiết bị/build thật | Native manual / NFR-11 |
| LS-AC32 | Sau gửi/reject/approve, đổi màn hoặc mở app lại | Chủ/Staff thấy trạng thái server hiện tại, không phụ thuộc fixture hoặc push | E2E / UC-02 |

## Bằng chứng và gate

Race test dùng hai connection độc lập, barrier để thật sự chồng lệnh và kiểm tra
bất biến trực tiếp trong DB; không chỉ chạy hai Promise có thể hoàn thành tuần
tự. Chạy cả thứ tự thắng có ý nghĩa. Failpoint chỉ trong test, không thêm endpoint
công khai. Kiểm tra số revision/decision/audit/receipt/outbox sau race.

Khi thực thi, ghi commit, môi trường, command, mã ca, kết quả, requestId đã lọc
secret và thiết bị/OS. Unit tests không thay E2E DB/storage. Export không thay
native build; bàn phím web không thay TalkBack/VoiceOver.

Gate lát cắt: LS-AC01–32 có bằng chứng theo mức; không còn lỗi quyền, rò rỉ nháp,
mất dữ liệu hoặc race. Android native là gate tích hợp đầu tiên; iOS cần bằng
chứng trước công bố hỗ trợ. Test session/UI hiện có không đánh dấu các ca này đạt.

Coverage SRS: FR-C01–02/C04/C05 thuộc lát cắt; FR-C06 mới có sách/người đăng,
chưa rating/topic; FR-C03/C07 để sau. FR-L01–06 thuộc lát cắt; FR-L07 mới gỡ khi
chưa giao dịch; FR-L08 mới chuẩn bị revision/ảnh bất biến, chưa snapshot giao kết.
AC-04–06 mới được bao phủ theo phần này, không đánh dấu toàn bộ SRS hoàn thành.
