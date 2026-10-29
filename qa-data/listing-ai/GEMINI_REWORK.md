# Gemini: sửa gói dữ liệu sau review Codex

Đọc toàn bộ `qa-data/listing-ai/REVIEW_2026_10_29.md`, evidence JSON được dẫn và
`GEMINI_PROMPT.md` ban đầu. Chỉ ghi trong:

```text
C:\Users\DESKTOP\Documents\WDP391\used-book-marketplace\qa-data\listing-ai\incoming
```

Gói hiện **NEEDS_REWORK**, không nghiệm thu theo số16PASS/exit0 cũ. Không làm lại
từ đầu/xóa ảnh đã có. Lưu bản gốc các JSON/HANDOFF/script/report của bạn dưới
incoming/revisions/before-rework/ trước khi sửa. Không ghi đè file review, sửa
source app, env, DB, GHN, chạy importer/app/provider hoặc commit/push. Không đổi
branch. Human review/real-camera vẫn false/NOT_RUN theo nhiệm vụ ban đầu.

## 1. Sửa script trước và chứng minh nó bắt lỗi

- JSON/ID duy nhất/reference/fieldEvidence đủ; paths photos lẫn manifest phải
  tồn tại trong incoming (realpath), không đọc file ngoài thư mục.
- Ảnh decode thực, hash/size/dimensions khớp. Kiểm magic bytes riêng không đủ.
- Giá nguyên dương, ngày hợp lệ/không tương lai, source/edition/seller/availability
  có evidence. Không mặc định tất cả in-stock. Missing field không được coi như
  đã false/verified.
- Ngưỡng dữ liệu hai nguồn vẫn là mục tiêu15, không hạ thành14. Chỉ đếm ready+
  exact+có căn cứ nhóm độc lập, không đếm likely, blocked hoặc giá của volume khác.
  Nếu chưa đủ thì PARTIAL/FAIL theo check, không nói đạt15.
- Real-camera và import-candidates phải được assert theo nội dung thực; không
  hardcode NOT_RUN/PASS. Review flags tất cả lane phải false khi chưa có người ký.
- Error counts, git HEAD và số liệu được tính/đọc thật. Hỏng check bắt buộc phải
  exit khác0, dù vẫn lưu report. Blocked/thiếu mục tiêu phải thể hiện overall
  PARTIAL/NEEDS_REWORK, không biến thành overall PASS.
- Chạy negative tests trên **bản sao**, không phá data thật: ISBN sai checksum;
  giá âm/ngày tương lai; ảnh case thiếu; ảnh hỏng; ID trùng; source thiếu;
  reviewed=true trong real-camera; import-candidates không hợp lệ. Ghi input
  mutation/expected/actual/exit code. Bản gốc không thay đổi do test.

## 2. Sửa nguồn/edition và metadata

- Ghi timestamp vào lúc fetch thật, URL cuối/product ID/variant/SKU/seller nếu
  có. Sửa lịch sử thời gian không nhất quán bằng ghi chú trung thực và lượt đọc
  mới; không bịa ngày truy cập quá khứ. HANDOFF cũ03:30UTC mâu thuẫn với29nguồn
  sau mốc đó; không lấp bằng cách chỉ chỉnh end time.
- Đối chiếu lại hai URL Tiki redirect (Dế Mèn và Mắt biếc nhỏ) bằng trang sản
  phẩm canonical công khai. Không có price evidence thì blocked/unknown.
- Chiến binh cầu vồng: tách title2025/field2022 bên Nhã Nam với titleTB2020 bên
  Tiki. Chưa giải quyết ấn bản thì không exact; không tự giải thích chênh4trang.
- Refresh Nhà giả kim79k và Đắc nhân tâm108k: Codex đọc mới thấy OutOfStock;
  cập nhật đúng quan sát/giờ đọc. Không coi snapshot mới chứng minh lịch sử cũ.
- Hai observations likely (Dế Mèn/Tiki, Nhà giả kim/Tiki) không được tính exact.
  Tiki cần ghi seller thật, không gọi mọi listing là Tiki Trading.
- Năm Dế Mèn mềm đang “ước tính”; Kính vạn hoa đang suy từ tênfile. Không có
  chứng cứ năm thì null. Publisher Nhà giả kim có xung đột thì unknown hoặc dẫn
  nguồn/ảnh đúng, không chọn bằng trí nhớ.
- ISBN không thấy trên web: dùng unknown, không not-present cho sách. Expected
  ISBN=null khi không thấy trên ảnh vẫn giữ độc lập với catalog facts.
- Sửa Trương Quang→Trương Qua khi chứng cứ ảnh/nguồn xác nhận; kiểm dịch giả
  Lê Huy Bắc trên bìa Ông già và biển cả. Ghi locator/sourceId cho việc sửa.
- Doraemon: không diễn giải45chương thành45tập. Kính vạn hoa: chọn đúng tập1 /
  variant2025 hoặc2026 / SKU nếu có; không gắn giá của trang tổng vào record2019.
- Bổ sung fieldEvidence cho trường đã điền. Codex đếm76field thiếu (25language,
  19edition,15year,9authors,6publisher,1illustrator,1translator). Không tạo locator
  giả chỉ để đủ trường: không xác minh được thì bỏ/null và partial.

## 3. Ảnh và độ phủ

- Giữ hai raw record Nhà giả kim để truy vết, nhưng dedup/quarantine corpus khi
  chưa chứng minh25ấn bản/ảnh độc lập. Không sửa pixels để làm khác hash. Nếu
  thay bằng cuốn khác thì cập nhật tất cả reference, counts và manifest rõ ràng.
- Cần ít nhất một case nhiều tác giả có nguồn thật; có thể thay record mơ hồ,
  giữ mục tiêu25. Không đưa người dịch vào authors để đáp ứng coverage.
- Kiểm ground truth trực tiếp trên ảnh, riêng title/volume và author. Không
  chép ISBN/năm từ web vào expected nếu ảnh không có. Không thêm người ký giả.
- Quyền dùng ảnh unknown giữ unknown/local ignored; không tự gán license.

## 4. Bàn giao lại

Tạo incoming/REWORK_CHANGELOG.md: từng finding đã sửa/chưa sửa, file/ID bị ảnh
hưởng, nguồn mới, evidence và negative test. Cập nhật HANDOFF.md/report.json từ
file thực tế. Giữ original snapshot để Codex so diff. Nêu đúng số ready/partial/
blocked, ảnh/hash độc lập, ISBN, số cuốn2nguồn exact và phần chưa thể xác minh.

Không cần gửi lại lời khẳng định “đã hoàn tất” nếu chưa đủ. Bàn giao PARTIAL có
bằng chứng còn hữu ích hơn tăng số PASS. Không tự đóng ADR0048/READINESS. Kết quả
chính là các file đã sửa đúng folder; cuối cùng báo đường dẫn HANDOFF và changelog.
