# Impeccable trong Lật lại

Chủ dự án duyệt09/10/2026: tích hợp vào repo, cập nhật brief và đánh giá ba màn
tìm sách/chi tiết/đăng sách. Không có thay đổi màn hình/runtime trong gói tích hợp.

Lượt đầu: [critique09/10](../../.impeccable/critique/2026-10-09T16-30-59Z__apps-user-web-src-pages.md).
Hai agent được duyệt nhưng đều lỗi usage limit trước kết luận; parent hoàn tất
theo chế độ DEGRADED, không nhận là dual-agent PASS. Thứ tự sửa đề xuất: search
đúng API/control/state, câu chữ/font/detail, rồi form/recovery. Đây là backlog
cụ thể, chưa phải các thay đổi UI đã thực hiện.

## Nguồn và version

Skill thật được vendored ở [.agents/skills/impeccable](../../.agents/skills/impeccable/SKILL.md),
upstream `pbakaus/impeccable`, revision `d631a8827f99414d2b6daba4ef08b7f8701751d7`,
skill4.5.2, engine0.1.14. [Lock](../../.agents/skills/impeccable/upstream.lock.json)
ghi SHA256 từng source và release asset; giữ [LICENSE](../../.agents/skills/impeccable/LICENSE)
và [NOTICE](../../.agents/skills/impeccable/NOTICE.md). SKILL patch là frontmatter
phù hợp checker/adapter và preamble dẫn quy tắc Lật lại; body SKILL giữ nguyên.
Ba reference `extract/harden/optimize` chỉ trim whitespace cuối dòng/file để qua
diff check; giữ hash upstream và thêm hash bản chuẩn hóa trong lock, không đổi
nội dung/hướng dẫn. Các file còn lại kiểm đúng hash upstream sau chuẩn LF.

Clone/pull đem theo source, không cần submodule/symlink hoặc install global.
Claude dùng [adapter](../../.claude/skills/impeccable/SKILL.md) dẫn cùng nguồn với Codex.
Phiên mới có thể nạp skill; nếu chưa thấy, mở lại phiên/kiểm catalog. Link được
checker kiểm không chứng minh mọi AI host tự discover.

## Chạy engine cố định

Node/pnpm theo repo. Từ root:

```sh
pnpm ui:design --verify-vendor
pnpm ui:design engine-probe
pnpm ui:design context --target apps/user-web/src/pages/BookSearchPage.tsx
pnpm ui:design detect --json apps/user-web/src/pages/BookSearchPage.tsx
```

[Wrapper](../../scripts/impeccable.mjs) kiểm vendor trước chạy, tải đúng binary
release vào `.tmp/impeccable/engine/` khi thiếu và đối chiếu digest **trong lock**.
Không dùng binary global/PATH; không thay dependency/lockfile sản phẩm. Lần đầu
cần mạng, các lần sau chạy cache đã xác minh. Exit2 của detect nghĩa có findings;
exit1/127 là lỗi, không được gọi là sạch. Windows ARM64 có thể dùng x64 qua
emulation theo upstream; native ARM asset0.1.14 chưa có. Chỉ Windows x64 đã được
chạy ở gói này; Linux/macOS hashes đã khóa, chưa thực thi trên các OS đó.

Giữ cwd root và `--target` cụ thể. Trong skill/playbook, thay lời gọi launcher
trực tiếp bằng wrapper này để giữ pin. Context chỉ load một lần cho target trong
session; đổi platform/target cần xác nhận context phù hợp, không đọc lại vô ích.
`PRODUCT.md` child ở RN/Flutter ngăn engine mặc định web cho native.

## Cửa vào và ưu tiên

1. SRS/ADR/OpenAPI và quyền gói quyết định nghiệp vụ/hành vi.
2. [PRODUCT](../../PRODUCT.md) chứa audience/tác vụ/platform và sự thật sản phẩm.
3. [DESIGN](../../DESIGN.md) là brief UI mới; `docs/DESIGN.md` giữ UI-1 lịch sử.
4. [latlai-ui](../../.agents/skills/latlai-ui/SKILL.md) giữ conventions/consumer/QA.
5. Impeccable bổ sung phương pháp thiết kế; Taste là reference, chưa cài bộ cạnh tranh.

Thẩm mỹ defaults không tự cho phép thêm framework/UI library, thay session,
claim/rating, fake API hay bỏ gate. Grid/card/font quen thuộc có thể đúng tác vụ.
Native tham khảo nền tảng nhưng sửa trong component hiện có; không chuyển Expo
sang Compose/SwiftUI hoặc áp yêu cầu font OS đè brief đã duyệt.

## Dùng trong chat

```text
$latlai-ui và $impeccable critique apps/user-web/src/pages/BookSearchPage.tsx.
Người dùng cần tìm/lọc và mở đúng sách. Đọc PRODUCT.md/DESIGN.md.
Đánh giá source + màn thật; chưa sửa code. Giữ API/query/session hiện có.
```

Claude dùng `/latlai-ui` và `/impeccable ...`. Chọn playbook theo vấn đề:
critique (UX), clarify (câu chữ), typeset (font), layout/distill (bố cục),
adapt (thiết bị), audit (kỹ thuật), polish (hoàn thiện sau thay đổi).
Lệnh chat không phải lệnh shell; engine hỗ trợ context/detect/storage/helper.

Critique có hai đánh giá độc lập khi công cụ và quyền delegation cho phép.
Không hỏi lại quyền đã được người dùng giao trong session. Nếu một agent, ghi
degraded và lý do. Điểm0–4 là heuristic AI, không là usability test/human PASS.
Detector JSON hỗ trợ review; đọc false positives, không chạy đua điểm0 findings.
Chỉ hỏi quyết định thật còn thiếu; ưu tiên/scope đã duyệt không cần questionnaire mới.

Không bật hook tự động hoặc live injector trong gói này. Review bằng browser
API được cấp; thiếu mutable injection thì ghi overlay NOT RUN và dùng screenshot/
DOM/source, không bịa overlay. Browser narrow viewport không là native acceptance.
Live config và workflow buildPath chưa đặt; màn Operate đi theo code hiện có.

## Cập nhật có chủ đích

Nâng version là nhiệm vụ riêng: chọn SHA, review upstream diff/license/playbooks,
download bằng skill-installer tới staging mới, kiểm file/body và release checksums,
cập nhật lock/source cùng commit, chạy vendor check/docs check và engine smoke.
Không `npx ... latest`, ghi đè bộ skill đang dùng hoặc sửa lock chỉ để che drift.
Giữ .env/config của teammate; chia sẻ context/skill qua Git theo ENV_HANDOFF.

## Kiểm chứng gói09/10

Node24.19.0/pnpm11.19.0 trên Windows x64: vendor64 file PASS, engine-probe0.1.14
PASS từ cache; cache cố ý hỏng bị từ chối trước execution rồi phục hồi/probe PASS.
Context web đã nạp; RN target resolve `adaptive` và nhận Android/iOS references.
Skill validator chạy Python `-X utf8` PASS (mặc định cp932 lỗi decode; không sửa
file để né lỗi). `docs:check` kiểm bốn adapter/cửa vào và local links; không kiểm
host tự discover. Catalog của phiên này đã hiện skill `impeccable` sau cập nhật.

Detector ba TSX exit0,0 findings; browser/source vẫn tìm thấy lỗi UX/API. Không
rerun detector để tăng số evidence. API build chạy để dựng QA, không được cộng
thành test API PASS. Browser QA có real API/Mongo `*_test`, storage fake; native,
live Supabase, human UX/review và remote CI NOT RUN. READINESS giữ nguyên.

QA-only Vite/API/image service đã dừng; hai database fixture cùng users/roles
đã xóa và xác nhận0 còn lại; chỉ dừng Mongo QA khởi động cho lượt này. Browser tab
đã đóng, viewport reset. Windows Ctrl+C không chạy fixture cleanup, nên đã dọn
đúng hai DB QA bằng tên xác nhận; không tác động DB/process của người dùng.
Không bật hook/live overlay/config global. Runtime cache và evidence local giữ
trong `.tmp` bị ignore; runner/routes/body tạm đã dọn sau lưu snapshot.
