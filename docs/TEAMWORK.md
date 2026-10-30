# Team workflow

## Ownership

Use [SRS1.1](SRS_V1_1.md) and [its normative annex](features/LOCAL_HANDOVER_AUCTION.md)
for new business work. RN is the first Member client; the Flutter lane consumes the
same API when needed. Current [state diagrams](features/LOCAL_TRANSACTION_DESIGN.md)
and [acceptance matrix](features/LOCAL_TRANSACTION_ACCEPTANCE.md) supersede v1.0-only
assumptions for point/auction flows. Do not treat mock UI or planned routes as working features.

Assign one primary and one backup owner to each area. Ownership means reviewing changes and maintaining documentation, not working alone.

| Area | Suggested responsibility |
|---|---|
| API and database | State transitions, transactions, migrations, OpenAPI |
| Flutter | Member flows, Riverpod architecture, Flutter tests |
| React Native | Member flows, Expo Router, React Native tests |
| Operations web | Staff/Admin permissions, queues, reporting |
| Quality and documentation | Acceptance tests, demo data, SRS traceability |

## Branches

- `main` is always reviewable and demo-ready.
- Work in branches such as `feat/42-exchange-acceptance`.
- Rebase or merge the latest `main` before requesting final review.
- Delete merged branches to keep the repository readable.

## Pull request rules

1. The author completes the checklist and attaches screenshots or API evidence.
2. An owner of the affected area reviews the implementation.
3. A second reviewer is required for wallet, settlement, permissions, and disputes.
4. CI must pass before merge.
5. Use squash merge so one pull request becomes one clear commit on `main`.

## Contract changes

`packages/api-contract/openapi.yaml` is the shared contract. Change it first, review it with both client owners, then implement the API and regenerate or update clients. Breaking changes require a versioned endpoint or an agreed migration window.

## Demo cadence

Keep weekly tags such as `review-1`, `review-2`, and `demo-2026-10-15`. Every tag must include compatible API, web, Flutter, React Native, migration, and demo-data revisions.

## Bàn giao một hành trình sử dụng

Chia người theo chức năng vẫn được; mỗi phần cần chỉ rõ cách nối vào sản phẩm.
Dùng [bản đồ luồng và checklist](ui/JOURNEY_CLARITY_2026_10_28.md) và
[workflow nối hành trình](../.agents/skills/latlai-journey-integration/SKILL.md)
khi bàn giao UI xuyên module. Mỗi issue/PR ghi vai trò → entry → điều kiện →
command/kết quả → bước tiếp; chốt người tích hợp ở các giao điểm:

- Ghi vai trò sử dụng và màn hình/nút đi vào, không chỉ URL của màn vừa viết.
- Ghi điều kiện, thông báo khi bị chặn, nơi xem kết quả và bước tiếp theo.
- Nếu đi qua module khác, phối hợp với người giữ module đó; giữ tên gọi/menu
  thống nhất. Member, Staff và Admin có entry khác nhau, không dùng role thay quyền API.
- Nhờ một người khác thử từ trang vào mà không hướng dẫn bấm từng nút. Ghi chỗ
  họ dừng hoặc hiểu sai; đây là evidence UX người thật, khác test tự động.
- Không dùng giao dịch, điểm uy tín hoặc tiến trình mẫu trên màn vận hành thật.
  Số liệu chưa tải phải có loading/error, không biến thành số0 hoặc thành công.
