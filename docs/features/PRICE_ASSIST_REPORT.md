# Trợ lý gợi ý giá — báo cáo triển khai

05/10/2026 · nhánh `codex/bao-listing-price-assist` từ `main` `efc6f09` · thiết kế
[ADR 0028](../adr/0028-listing-price-assistant.md) (Proposed). Giao việc gốc: gói
“Bảo — Đăng sách và AI gợi ý giá”.

## Trạng thái ngắn

| Hạng mục | Trạng thái |
| --- | --- |
| API, contract 0.22.0, migration 0005, import nguồn giá | Xong, test thực chạy PASS |
| UI RN/Expo web ở bước giá | Xong, kiểm trên Expo web với API thật + provider giả |
| Ghi quyết định giá của người bán | Xong, cùng transaction với lưu nháp/revision |
| Chạy provider thật + chấm eval | **BLOCKED** — máy này chưa có `PRICE_ASSIST_API_KEY` |
| Nguồn giá thật + khoảng kỳ vọng do người kiểm | **CHƯA CÓ** — 34 ca hiện là bản nháp chưa review |
| Android native 100%/130%, mất mạng, video | **NOT RUN** — máy này không có AVD/thiết bị (`adb devices` rỗng) |
| Duyệt SRS mở rộng, nguồn/model/ngân sách | **Chờ chủ dự án** (ADR §7) |

Không bật trợ lý cho demo khi hai dòng BLOCKED/CHƯA CÓ ở trên còn mở. Không thay kết
quả thật bằng dữ liệu dựng sẵn.

## Hành vi

- `POST /listings/{listingId}/price-suggestions` (chủ listing, ACTIVE; Draft/Rejected
  hoặc Approved+Available). Trả `Suggested` (khoảng, lý do có trích nguồn, nguồn có
  ngày), `NeedsMoreData` hoặc `Refused` kèm rule id và phần còn thiếu. 429 hạn mức,
  503 khi tắt/hết ngân sách/timeout/output sai — client luôn để nhập tay.
- Panel “GỢI Ý GIÁ BÁN” dưới ô giá. Chọn mức giá có xác nhận nếu ô đã có giá khác.
  Đổi đầu sách/tình trạng → gợi ý cũ hết hiệu lực. Không tự lưu, không chặn rời màn.
- Lưu nháp/gửi bản sửa kèm `priceAssist` khi gợi ý còn hiệu lực; server ghi
  `applied`, giá đã chọn, có nằm trong khoảng không.

## Kiểm tra đã chạy (05/10/2026, máy Windows này)

| Lệnh | Kết quả |
| --- | --- |
| API `vitest run src/modules/price-assist` | 20/20 PASS — luật, loại nguồn, POL-16, lọc liên hệ, fingerprint, 11 ca output sai |
| API E2E `test/price-assist.e2e-spec.ts` (QA replica set, DB `_test`, provider giả) | 8/8 PASS — 404 người khác/403 STAFF/403 RESTRICTED/422 sách; luật không gọi model; cache; đổi input gọi lại; prompt không chứa email/id/số điện thoại; 503 invalid/timeout ghi `Failed`; 429 hạn mức người dùng không rò tăng đếm; 503 hết ngân sách; hai request song song cùng người → 200 + 429, đúng 1 lần gọi model; ghi quyết định + replay cùng key + 422 id của người khác không đổi listing; 409 listing không sửa được |
| API mongo `schema.mongo-spec.ts` | 16/16 PASS |
| API E2E hồi quy `catalog-drafts`, `listing-review`, `listing-schema` | 103/103 PASS |
| API lint, typecheck, build; `contract:check`; `contract:routes` (79 ops/17 controllers) | PASS |
| RN `vitest run src/features/drafts` | 54/54 PASS (gồm 7 ca mới: input, stale, phản hồi muộn, applied, điểm giá, thông báo lỗi, body cố định khi retry) |
| RN typecheck; lint | PASS; lint 0 lỗi, 8 cảnh báo có sẵn ở wishlist/khác, không ở drafts |
| `pnpm --filter @used-books/api eval:price --fake` | 34/34 status đúng luật — **chỉ kiểm harness**, không là evidence chất lượng |
| `eval:price --live` | BLOCKED, thoát mã 2: thiếu `PRICE_ASSIST_API_KEY` |
| Expo web + API fixture (DB `price_ui_*_test` đã xóa, provider giả có nhãn) | Đăng nhập → Sách tôi → bước 3 → gợi ý 35.000–50.000 đ, nguồn có ngày; chọn 43.000 đ hiện hộp xác nhận thay 120.000 đ; lưu nháp → `outcome.applied=true, withinRange=true`; đổi tình trạng → thông báo hết hiệu lực, giá đã nhập giữ nguyên |

Chưa chạy: full `test:api:e2e`/`test:api:mongo` toàn bộ (chỉ suite liên quan), public
browser runner, CI. Web emulation mobile trong browser pane không nhận gõ phím nên phần
kiểm web chạy ở viewport desktop; không thay kiểm Android.

## Đánh giá (eval)

`apps/api/eval/price-assist/cases.json`: 34 ca — 6 thông thường, 6 ấn bản, 4 sách cũ
nhiều, 6 thiếu dữ liệu, 4 giá ngoại lệ, 4 từ chối, 1 chỉ giá rao, 1 chèn chỉ dẫn vào ghi
chú, 2 lỗi provider (timeout, output sai — injector cục bộ). **Toàn bộ số tiền/nhãn nguồn
và khoảng kỳ vọng là bản nháp do AI viết, chưa phải giá đã kiểm.**

Việc cần làm trước khi chấm:

1. Người kiểm thay từng nguồn bằng giá thật có nhãn, URL, ngày (giá bìa in trên sách
   hoặc trang NXB/nhà sách; giá biên tập có người chịu trách nhiệm), xác nhận khoảng kỳ
   vọng, điền `review.reviewedBy/reviewedAt` từng ca.
2. Đặt key vào `apps/api/.env` theo [ENV_HANDOFF](../handoff/ENV_HANDOFF.md), chạy
   `pnpm --filter @used-books/api eval:price --live --max-usd 1`. Kết quả lưu
   `apps/api/eval/price-assist/results/<thời điểm>.json` (commit bản live).
3. Báo: số ca đúng status, coverage, số ca từ chối/thiếu dữ liệu, `midInExpected`,
   sai lệch %, p50/p95, token, chi phí USD thực. So với ngưỡng ADR §7.4.

## Nạp nguồn giá

```bash
pnpm --filter @used-books/api price-refs:import path/to/refs.json
```

Mặc định chạy thử; thêm `--apply` để ghi. Dùng `MONGODB_MIGRATOR_URL`. Mỗi mục:
`bookId` hoặc `isbn` (đã xác nhận), `kind` CoverPrice|EditorialReference|CompletedSale,
`amount`, `condition` (tùy chọn), `sourceLabel`, `sourceUrl` https (tùy chọn),
`observedAt` YYYY-MM-DD, `enteredBy`, `rightsNote`. Lỗi bất kỳ mục nào → không ghi gì.
Chạy lại không tạo trùng. Chỉ commit file nguồn khi chủ dự án xác nhận quyền sử dụng.

## Cho web (Đại)

Expo web dùng cùng component `price-suggestion-panel.tsx`; không cần API riêng. Việc
còn lại phía web: bố cục rộng, focus/keyboard qua chip giá và hộp xác nhận, viewport nhỏ.
Contract: `PriceSuggestionRequest`, `PriceSuggestion`, `PriceAssistDecision` trong
`packages/api-contract/openapi.yaml`. Lỗi: 409 listing không sửa được, 422 đầu sách
không dùng được, 429 hạn mức/đang có yêu cầu, 503 trợ lý không dùng được.

## Giới hạn đã biết

- Không có giá giao dịch hoàn tất; “giá rao” không phải giá đã bán.
- Nhãn nguồn dùng để đếm nguồn độc lập; hai nhãn khác nhau cùng một nơi sẽ bị đếm hai.
- Giá rao nội bộ không lọc theo tình trạng tài khoản người bán khác (kệ có lọc).
- Mất app (process death) trên Android vẫn mất form chưa lưu — có từ trước, chưa sửa.
- `price_suggestions` chưa có chính sách xóa.
