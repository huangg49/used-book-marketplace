# Gemini: sửa đúng phần còn lại sau phúc tra v2

Codex đã tái lập9/9negative tests v2 và xác nhận nhiều sửa đổi đúng. **Không cần
thu thập lại toàn bộ data hoặc tăng số lượng cho đẹp.** Đọc phần “Phúc tra Rework
v2” trong REVIEW_2026_10_29.md và review-2026-10-29/rework-v2-evidence.json.

Chỉ ghi trong folder:

```text
C:\Users\DESKTOP\Documents\WDP391\used-book-marketplace\qa-data\listing-ai\incoming
```

Không switch branch/sửa source app/env/DB/GHN/commit/push/gọi provider. Giữ
before-rework và thêm snapshot trước lượt sửa này. Không sửa report review Codex.

1. **Giải mã ảnh thực:** thay parseJpegStrict tự viết bằng Sharp đã có trong
   dependency apps/api, resolve bằng createRequire nếu cần. Phải decode pixel
   (raw().toBuffer hoặc tương đương), không chỉ metadata/header. Không cài thư
   viện mới. Hash, byteSize, width, height sai phải check FAIL và exit1.
   Negative test JPEG SOI+SOF+EOI không có scan phải bị bắt dù hash/size metadata
   được cập nhật khớp file hỏng. Thêm test dimension/byteSize sai mà bytes đúng.
2. **Ranh giới path:** dùng realpath cho root/candidate rồi path.relative để từ
   chối .., đường tuyệt đối hoặc ../..., trước khi đọc file. Không chỉ startsWith.
   Negative test sibling incoming-escape trong sandbox phải FAIL; không đọc env
   hay file riêng để test. Kiểm mọi path của manifest và cases.
3. **Cách ly có tác dụng với runner hiện có:** giữ catalog/raw95k blocked nhưng
   đưa case95k ra ngoài active autofill/cover-scan/cases.json sang file quarantine
   riêng có lý do/hash. Runner hiện duyệt mọi file.cases, không đọc catalog.status.
   Không thêm cờ excluded mà runner không hiểu; không sửa runner trong gói data.
   Active corpus24case nếu chỉ bỏ case95k; raw catalog vẫn25. Assert không book
   blocked/quarantined nào xuất hiện trong active cases và không hash trùng active.
4. **Validation bắt buộc:** fieldEvidence.sourceIds phải tồn tại; sourceIds ảnh và
   case.bookKey phải tồn tại. Review flags bắt buộc là boolean false, thiếu không
   được PASS. Ngày phải có thật (2026-02-30 bị bắt), accessedAt nguồn hợp lệ/không
   tương lai. Kiểm tối thiểu1–3photos và schema case mà eval đang dùng. Không tự
   gán ngày cũ để qua check; nếu fetch lại, lấy giờ tại lần fetch thật và lưu trace.
5. **Dẫn chứng năm:** Lược sử nước Việt2024 chưa được tìm thấy trên nguồn đã dẫn.
   Có ảnh/trang chính sản phẩm thì dẫn locator và dữ kiện thực; nếu không thì
   publicationYear=null, edition bỏ năm. Giữ bookKey legacy để không phá reference.
   Rà các locator năm vừa bổ sung kiểu “Tái bản năm2022/2023...” tương tự; không
   lấp locator chỉ để đạt0missing. Không biến codeSKU/tênfile/copyright thành năm.

Giữ những phần Codex đã xác nhận: canonicalTiki mới, role tác giả lời/minh họa,
15ISBN có nguồn, cách đếm11/15exact, stock/ISBN unknown và flagsfalse hiện có.
Mục tiêu15hai nguồn có thể tiếp tục PARTIAL; không cần truy tìm thêm chỉ để sửa
validator. Rights unknown/human/real-camera chưa có vẫn ghi rõ chưa nghiệm thu.

Chạy9test cũ cùng các probe mới trên bản sao có guard thư mục xóa. Bộ mới phải
có baseline không có mandatoryFAIL, mỗi mutation bị bắt đúng check và exit1;
không chấp nhận crash bất kỳ là test “đúng”. Chứng minh test không đổi dữ liệu
gốc. Dừng các câu “100%proven” ngoài phạm vi test thực có.

Cập nhật HANDOFF/report/changelog: finding nào đạt, finding nào PARTIAL; phân
biệt số raw25 với active24, danh sách quarantine,0mandatoryFAIL nếu thực đạt.
Đừng ghi RESOLVED cho claim mới chỉ sửa nhãn. Bàn giao PARTIAL trung thực nếu
còn thiếu. Không import hay tự đóng ADR0048/READINESS.
