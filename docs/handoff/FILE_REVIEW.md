# Kiểm tra bộ file trước checkpoint

28/09/2026, nhánh `codex/f2h-handoff-audit`. Đây là kiểm tra nội dung bàn giao,
không phải chứng nhận code không chứa mọi loại bí mật hoặc đã được reviewer độc lập duyệt.

- Duyệt danh sách Git tracked + untracked không ignored: không có `.env` thực,
  `node_modules`, `.tmp`, dist, test-results, Prisma sinh ra hoặc database cục bộ.
- Quét text candidates theo chữ ký private key/GitHub/provider keys; đối chiếu
  giá trị credential hiện tại trong `.env` với text candidates mà không in giá trị.
  Hai kết quả khớp đều là `DEV_SEED_PASSWORD` mẫu đã công khai trong `.env.example`
  và hướng dẫn demo. Không phải Supabase/service key; không đổi mật khẩu seed
  của dữ liệu đã có. Không phát hiện credential provider thực theo các phép kiểm này.
- Binary không được coi là đã quét secrets từ nội dung. Đã rà danh sách: font,
  ảnh thiết kế/brand, ảnh bằng chứng fixture và deliverable v1.0. File ảnh lớn nhất
  cần lưu ý là `assets/design/oz.jpg` (~2,88 MB): ảnh gốc của prototype opt-in có
  attribution và nguồn trong `assets/design/README.md`/`sources.json`; giữ nguyên nguồn.
- Lora/Be Vietnam Pro có nguồn và SIL OFL trong `packages/brand/fonts/`;
  instance Lora RN có OFL và hướng dẫn tạo lại. Đợt này kiểm hồ sơ attribution
  trong repo, không thẩm định lại tình trạng bản quyền từ bên ngoài.
- Icon mới xuất từ logo SVG gốc bằng script; không lấy hình mới từ Internet,
  không sửa logo hoặc thay font. PNG native được đưa vào nguồn cùng cách tái tạo.
- `docs/deliverables/` v1.0 không có diff; không sửa bản SRS lưu trữ để giả lịch sử.
  SRS v1.1 và contract-generated types được giữ cùng implementation.

Phần lớn backend/client từ các increment trước vẫn chưa được commit khi bắt đầu
đợt audit. Checkpoint phải bao gồm chúng để người clone có code chạy được; một
commit chỉ chứa báo cáo sẽ không đủ. Commit nguồn không đồng nghĩa final release,
không đóng các gate native và không thay hai reviewer cho money/permissions.
