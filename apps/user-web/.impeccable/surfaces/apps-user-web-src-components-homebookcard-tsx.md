# Shared Home / Search book-card motion

22/10/2026 reference refinement supersedes the earlier two-column title/price
recipe: paper cards have a1px shop-line border,20px corners and10px compact
padding. The180px desktop cover stage has14px corners and reuses archival-desk
art behind the real contained cover; phones use220px. Mint condition/mode stays
bottom-left, availability top-left and the44px wishlist heart top-right. Full
title spans the card; author/actual region share two equal columns below.
Sale/exchange prices have their own pale shelf panel with labels and tag icon;
the full-width wine action stays44px. No fabricated backdrop is listing media.
Owner follow-up compacts the fixed card to464px desktop/tablet and504px phones,
including Single/Both price modes and loading/error/preview states. A52px facts
row and76px price panel reserve stable space, with8px gaps and10px meta inset.
Both prices use inline label/amount rows without repeated icons; a single price
keeps its tag icon and normal amount type. `CardFitText` measures its fixed
slot, keeps the largest font that fits and refits on content/resize/font events.
Title/amount floors are0.75rem; author/region0.6875rem. Extreme text clamps only
at that floor; full text stays accessible and in native tooltips/detail links.
No amount is ellipsized in supported price ranges. Row height never follows text.
Main Home/Search shelves show four columns on desktop; smaller screens adapt and
phones keep one card per row. The secondary Exchange shelf retains its280px
auto-fill minimum inside its narrower content area. Keep current motion and image
retry. `fulfillment.locality.label` is the only actual zone label; missing/legacy
origins show “Chưa có khu vực”, and preview books explicitly have no physical zone.
No fabricated prices, rating, region or location inferred from fulfillment.name.
Wishlist reads all pages through the existing Member API, is owner-keyed, and
updates only after server acknowledgment. Unknown results retry the same desired
PUT/DELETE; cache cancellation protects against stale reads, and session checks
protect owner changes. Guests go to login with the book return URL; non-Members
cannot use the heart. Preview cards retain external source links and no heart.

Current motion is the shared240ms vertical hover/focus elevation in
`BookCardMotion`, including under reduced-motion preference per owner policy.
The deeper tilt notes below are historical verification of earlier versions.

Mode: Operate. Refinement of the existing compact book-card recipe; the owner
approved Aceternity-inspired pointer tilt with both cover and text raised.

Motion thesis: inspecting one physical book separates its cover, title and facts
into shallow depth layers; the shelf remains still. Bounded pointer feedback,
not a page entrance or perpetual floating animation.

The stationary BookCardMotion hit area owns perspective; its existing article
tilts by at most 12 degrees per axis. Cover 72px, title 56px, price 40px, source/detail
action 32px and condition/author 24px depths reveal one hierarchy. No new surface,
copy, imagery, typography, size, route or API behavior. HomeBookCard wraps both
preview and real BookCard content, shared by Home and Search.

Budget: one requestAnimationFrame at most while pointer moves, no React render
per move; cached untransformed bounds and active-only listeners. Leave, cancel,
scroll, resize, blur, visibility and unmount stop the interaction. Mouse/fine
hover only above 600px; narrow/coarse-pointer screens remain static. Keyboard
focus raises layers without rotation on the desktop motion recipe.

Owner's existing request to keep motion visible on their reduced-motion laptop
applies: retain up to 10 degrees and 80% depth with 150ms settling. The owner
subsequently requested visibly stronger 3D: perspective is now 720px, with a
pointer-directed cast shadow plus contact shadow on the active cover. No loop.

Initial verification 11/10/2026: build/TypeScript and 34 unit tests in 7 files PASS;
lint 0 errors / 5 existing warnings. One detector pass returned []. IAB guest
Home 1535×735 and Search 1280×720: pointer changes tilt direction, layered cover
and text, fixed hit bounds, exit reset, original link keyboard focus PASS.
The browser reported reduced-motion=true: cover 18px/title 13px depths were
observed. Home/Search 390×844 and Search 320×700: static cards, no horizontal
overflow. Six JPEG captures are in .impeccable/review/card-depth/ at repo root.
Normal OS-motion runtime, hardware touch, populated live listing flow, FPS,
200% zoom, native and human review NOT RUN. No API/DB/dependency change.

Strength refinement from 58a1075: CSS only, build/TypeScript PASS (existing large
chunk warning). IAB reduced-motion=true: Home 1535×735/Search 1280×720 show
cover 57.6px/title 44.8px depth, tilted text and stronger directional shadow;
Search exit resets both variables. Search 390×844 remains static with no
horizontal overflow. Viewed home-strong.jpg, search-strong.jpg and
search-strong-mobile.jpg. No unit rerun for CSS-only tuning; initial 34 tests
remain earlier evidence. Other NOT RUN limits above remain.
