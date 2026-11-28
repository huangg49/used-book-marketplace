---
target: SellBookPage wizard steps 1-4
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\WDP\\used-book-marketplace\\apps\\user-web\\src\\pages\\SellBookPage.tsx"
target_fingerprint: "sha256:d4b9495c0f6f8becdbd86238e3c74e9c786b6c123de197c1698869816010c689"
target_path: "D:\\WDP\\used-book-marketplace\\apps\\user-web\\src\\pages\\SellBookPage.tsx"
timestamp: 2026-11-28T03-22-37Z
slug: apps-user-web-src-pages-sellbookpage-tsx
---
⚠️ DEGRADED: single-context (sub-agents not requested by user; /sell needs sign-in on hosted demo API, so screenshots supplied by user used as visual evidence)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Step state shown 3-4 times (stepper, % bar, "Bước x/5" badge, h2) |
| 2 | Match System / Real World | 3 | Clear Vietnamese copy; "Khung dọc 3:4", "Phiếu" metaphor only a badge |
| 3 | User Control and Freedom | 2 | No draft save across 5 steps; "Bản nháp chưa tự lưu" warns without remedy |
| 4 | Consistency and Standards | 2 | Same tan panel = choice, helper, required field, info; counters 0/7 vs 0/8 |
| 5 | Error Prevention | 3 | Ranges/min length shown up front |
| 6 | Recognition Rather Than Recall | 3 | Condition hints, shot-angle chips |
| 7 | Flexibility and Efficiency | 2 | 5 free-text areas; must type "Không có" |
| 8 | Aesthetic and Minimalist Design | 2 | Repeated chrome, posting-limit accordion on every step, empty panes |
| 9 | Error Recovery | 3 | Data kept on retry, locked attempt messaging |
| 10 | Help and Documentation | 3 | Inline help everywhere, sometimes too much |
| Total | | 26/40 | Solid base, high friction |

## Priority Issues
- [P1] Step chrome repeated 4x before content (stepper + progress row + slip badge/"Bản nháp" + h2 + help, plus posting-limit + footer note). Fix: one header row (stepper with thin progress, step question as h2, draft state in action bar); posting limit once (step 5 or preview aside). Cmd: distill.
- [P1] Step 1 has 4 competing entry paths (Điền nhanh từ ảnh panel, Tìm sách tab, Tự nhập tab, "Không thấy sách?" link). Fix: search-first input with camera button (scan cover/ISBN → autofill + keep as cover); manual entry only as empty-result fallback; Sách lẻ/Bộ sách as two labelled options. Cmd: distill/layout.
- [P1] Photo step split into two unequal panes with empty area, hint chips not actionable, double counters, "Bấm ảnh để thay" before any photo. Fix: one grid: large Bìa trước slot + labelled empty slots (Bìa sau, Gáy, Trang ruột, Vết lỗi); one counter; constraints in one muted line. Cmd: layout.
- [P2] Condition step typing burden: 5 textareas, "Không có" typed by hand, redundant "Còn tốt" pill. Fix: quick-phrase chips per field inserting editable text, one-tap "Không có"; drop the pill. Cmd: clarify/distill.
- [P2] Price step: suggestion below the input, fee abstract, required "Nơi gửi sách" styled like optional helper. Fix: suggestion beside input, live "Bạn nhận khoảng …" estimate, required origin as a marked form row. Cmd: layout/clarify.

## Persona Red Flags
- First-time seller on phone: meets 3 ways to start, then a second photo picker in step 2 (already chose photos for quick fill).
- Power seller listing many books: types the same "Không có" / condition phrases every listing; no draft save.
