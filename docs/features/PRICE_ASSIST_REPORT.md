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
| Provider Gemini (adapter + cấu hình) | Xong 05/10; mặc định `gemini-3.8-flash` (Google trả 404 cho `gemini-2.5-flash` với người dùng API mới); lỗi provider ghi log WARN kèm mã/thông điệp ngắn của Google |
| Chạy provider thật + chấm eval | **Một lần gọi thật PASS** 05/10 (mục Kiểm tra); **eval 34 ca live CHƯA CHẠY** — cần nguồn giá thật đã review |
| Nguồn giá thật + khoảng kỳ vọng do người kiểm | **CHƯA CÓ** — 34 ca hiện là bản nháp chưa review |
| Android native 100%/130%, mất mạng, video | **Đã chạy 05/10** trên emulator (xem mục Android) với API thật + provider giả; video chưa đưa vào Git |
| Duyệt SRS mở rộng, nguồn/model/ngân sách | **Chờ chủ dự án** (ADR §7) |
| v2: băng theo tình trạng, cần ảnh, giá rao chỉ tham khảo, kiểm gợi ý khi lưu, Staff thấy gợi ý | Xong 06/10 ([ADR 0028 §8](../adr/0028-listing-price-assistant.md)); test thực chạy PASS |
| v2: tra giá sách mới trực tuyến ([ADR 0029](../adr/0029-online-price-lookup.md)) | Code + test (fake search/trang) PASS; **chạy thật BLOCKED**: key Gemini hiện tại bị Google trả `429 RESOURCE_EXHAUSTED` cho Google Search grounding — cần bật billing/hạn mức |

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
| API full unit `pnpm --filter @used-books/api test` (sau sửa CI PR18: thiếu `Idempotency-Key`) | 64/64 PASS |
| API E2E `test/price-assist.e2e-spec.ts` sau sửa | 9/9 PASS — thêm replay cùng key, 409 key dùng cho body khác, key theo thành viên, thiếu key → 400, lỗi được replay |
| API E2E `test/price-assist.e2e-spec.ts` (QA replica set, DB `_test`, provider giả) | 8/8 PASS — 404 người khác/403 STAFF/403 RESTRICTED/422 sách; luật không gọi model; cache; đổi input gọi lại; prompt không chứa email/id/số điện thoại; 503 invalid/timeout ghi `Failed`; 429 hạn mức người dùng không rò tăng đếm; 503 hết ngân sách; hai request song song cùng người → 200 + 429, đúng 1 lần gọi model; ghi quyết định + replay cùng key + 422 id của người khác không đổi listing; 409 listing không sửa được |
| API mongo `schema.mongo-spec.ts` | 16/16 PASS |
| API E2E hồi quy `catalog-drafts`, `listing-review`, `listing-schema` | 103/103 PASS |
| API lint, typecheck, build; `contract:check`; `contract:routes` (79 ops/17 controllers) | PASS |
| RN `vitest run src/features/drafts` (sau sửa giữ gợi ý khi lỗi) | 55/55 PASS |
| RN `vitest run src/features/drafts` (bản đầu) | 54/54 PASS (gồm 7 ca mới: input, stale, phản hồi muộn, applied, điểm giá, thông báo lỗi, body cố định khi retry) |
| RN typecheck; lint | PASS; lint 0 lỗi, 8 cảnh báo có sẵn ở wishlist/khác, không ở drafts |
| `pnpm --filter @used-books/api eval:price --fake` | 34/34 status đúng luật — **chỉ kiểm harness**, không là evidence chất lượng |
| v2 06/10: API unit / price-assist e2e / listing+catalog+media e2e / admin / RN drafts | 83/83, 11/11, 116/116, 15/15, 55/55 PASS; Mongo schema 16/16; eval harness 34/34 status đúng luật; typecheck, lint, `contract:check`, `contract:routes` |
| v2 06/10: tra giá trực tuyến với Gemini thật (DB `price_ui_*_test`, sách “Dế Mèn phiêu lưu ký”) | Lần 1 trả `R-LOOKUP-PENDING`; Google trả `429 RESOURCE_EXHAUSTED` (quota/billing của key) cho request có Google Search; lookup ghi `Failed`, thử lại sau 24 giờ; lần sau trả `R-NEED-SOURCES`, người bán vẫn nhập tay. **Chưa có evidence giá trực tuyến thật** |
| v2 06/10: Android emulator + admin web với Gemini thật (`gemini-3.8-flash`, DB `price_ui_*_test`, nguồn giá giả lập có nhãn: giá bìa 60.000 đ, biên tập 38.000 đ) | Ảnh chưa Ready → nút tắt, gợi ý “Thêm ít nhất 1 ảnh…”, 0 request. Có ảnh → 29.000–35.000 đ (trong băng Tốt 24–36k), `R-BAND-GOOD` + `R-STRONG`, 3 lý do tiếng Việt trích nguồn, 762/785 token, 3,9 s. Chọn 32.000 đ → hộp xác nhận → lưu: `outcome.applied=true, withinRange=true`, `input` khớp. Admin (nộp bản giả lập trong DB) hiện khối “Gợi ý giá của trợ lý” với khoảng, tình trạng khai, nguồn. Tra trực tuyến: Google 429 RESOURCE_EXHAUSTED; gợi ý vẫn chạy từ giá nhân viên nhập. Link “Mở trang” chưa thấy trên thiết bị (không có giá trực tuyến thật) |
| `eval:price --live` | CHƯA CHẠY: 34 ca còn là bản nháp chưa review, chấm trên đó không có ý nghĩa |
| Gemini thật trên Android emulator (05/10, DB `price_ui_*_test`, nguồn giá **giả lập có nhãn**) | `gemini-2.5-flash` → 404 NOT_FOUND (đã đổi model); `gemini-3.8-flash` lần 1 → 503 UNAVAILABLE "high demand" (app hiện lỗi, giữ nhập tay); lần 2 → 25.000–38.000 đ, `Limited`, 2 lý do tiếng Việt trích nguồn; 753/588 token, ~4,9 s, ghi 5.540 micro-USD theo giá 2027; chọn 32.000 đ → `outcome.applied=true, withinRange=true`. Chỉ chứng minh kết nối, không chứng minh độ đúng giá |
| API `vitest run src/modules/price-assist` sau khi thêm Gemini | 29/29 PASS (thêm 6 ca adapter: header key, schema, token suy nghĩ, HTTP lỗi, chặn an toàn, MAX_TOKENS, không phải JSON, timeout, chọn provider) |
| Expo web + API fixture (DB `price_ui_*_test` đã xóa, provider giả có nhãn) | Đăng nhập → Sách tôi → bước 3 → gợi ý 35.000–50.000 đ, nguồn có ngày; chọn 43.000 đ hiện hộp xác nhận thay 120.000 đ; lưu nháp → `outcome.applied=true, withinRange=true`; đổi tình trạng → thông báo hết hiệu lực, giá đã nhập giữ nguyên |

## Android (05/10/2026)

Emulator `sdk_gphone16k_x86_64`, Android 17, 1080×2340. APK debug dev-client mới
build bằng `pnpm build:android --emulator` (BUILD SUCCESSFUL 21m9s, 475 task) vì APK
28/09 thiếu native module `ExpoNavigationBar`. Metro từ working tree nhánh này; API là
fixture cô lập (DB `price_ui_*_test` đã xóa) với provider giả có nhãn “giả lập UI”.

| Ca | Kết quả | Ảnh |
| --- | --- | --- |
| Gợi ý ở bước giá, chữ 100% | PASS — khoảng, căn cứ, chip giá, lý do có nguồn, nguồn có ngày | [06](../ui/price-assist-evidence/android-06-suggested.png) |
| Bàn phím số trên ô giá | PASS — ô giá và thanh Lưu/Tiếp tục nằm trên bàn phím | [07](../ui/price-assist-evidence/android-07-keyboard.png) |
| Chọn giá khi đã có giá khác | PASS — hộp “Thay giá đang nhập?”; Back hủy, giá giữ 120000; xác nhận → 43000 | [08](../ui/price-assist-evidence/android-08-confirm.png) |
| Back khi có thay đổi chưa lưu | PASS — hộp “Rời bài đăng?” có sẵn vẫn chặn | [10](../ui/price-assist-evidence/android-10-leave-guard.png) |
| Mất mạng khi xin gợi ý | PASS — cảnh báo, giá nhập tay giữ nguyên, vẫn lưu được | [11](../ui/price-assist-evidence/android-11-offline.png) |
| Lưu khi mất mạng rồi thử lại | PASS — giữ yêu cầu; có mạng lại bấm thử lại: listing version 1→2, đúng 1 receipt `saveListingDraft`, giá 43000 | — |
| Chữ 130% | PASS — tiêu đề, chip, lý do, nguồn xuống dòng, không cắt chữ; ký hiệu đồng đúng font | [15](../ui/price-assist-evidence/android-15-130-suggested.png), [16](../ui/price-assist-evidence/android-16-130-sources.png) |
| Làm mới khi mất mạng sau khi đã có gợi ý | **Lỗi tìm thấy rồi sửa**: bản đầu xóa gợi ý cũ nên lần lưu sau không ghi quyết định. Sửa: giữ gợi ý cũ (và mức đã chọn) kèm cảnh báo. Kiểm lại trên emulator: PASS; lưu sau đó ghi `applied=true, chosenSalePrice=35000, withinRange=true`, version 2→3 | [17](../ui/price-assist-evidence/android-17-offline-keeps.png) |

Ghi nhận chưa sửa: hai lần, cú chạm đầu tiên vào “Xem lại gợi ý giá” ngay sau khi chạm
chip giá/ô giá không có tác dụng, chạm lần hai mới chạy (có thể do ô giá còn focus). Cần
người kiểm trên máy thật xác nhận. Video ghi màn hình 170 s (3,7 MB) được gửi riêng cho
người giao việc, không commit vào Git. Chưa kiểm TalkBack, máy ARM, máy thật.

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
2. Đặt key vào `apps/api/.env` theo [ENV_HANDOFF](../handoff/ENV_HANDOFF.md)
   (`PRICE_ASSIST_PROVIDER=gemini` cho key Google), chạy
   `pnpm --filter @used-books/api eval:price --live --max-usd 1`. Chi phí Gemini dùng
   bảng giá trong `price-model.ts` (`gemini-3.8-flash` tính theo giá niêm yết từ
   01/01/2027 là 1,5/7,5 USD mỗi triệu token, cao hơn giá đến hết 2026) hoặc
   `PRICE_ASSIST_INPUT/OUTPUT_USD_PER_MTOK`. Kết quả lưu
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
