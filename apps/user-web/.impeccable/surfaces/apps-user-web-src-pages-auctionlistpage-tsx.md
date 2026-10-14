---
version: 1
slug: "apps-user-web-src-pages-auctionlistpage-tsx"
primary_target: "apps/user-web/src/pages/AuctionListPage.tsx"
related_targets: ["apps/user-web/src/pages/AuctionListPage.module.css", "apps/user-web/src/components/AuctionHero.tsx", "apps/user-web/src/components/AuctionHero.module.css", "apps/user-web/src/components/AuctionEntrance.tsx", "apps/user-web/src/components/AuctionEntrance.module.css", "apps/user-web/src/lib/auction-entrance.ts", "apps/user-web/src/lib/auction-hero.ts", "apps/user-web/src/components/AuctionCard/index.tsx", "apps/user-web/src/components/AuctionGallery.tsx", "apps/user-web/src/components/AuctionGrid.tsx", "apps/user-web/src/components/AuctionPrice.tsx", "apps/user-web/src/hooks/useAuctionMotion.ts", "apps/user-web/src/lib/auction-motion.ts"]
---

# Đấu giá — sân khấu và danh sách phiên, 13/10/2026

Mode: Operate. Owner approved the layered2D artwork and continuous motion on
13/10/2026 after hem recovery and ornament attachment corrections. This recipe
supersedes the older velvet Hero-only entrance; Hero layout/factual content stay.
THESIS: Each actual visit to the auction list opens a full-viewport theater and
then removes its frame, leaving the normal browsing page.
OWN-WORLD: Approved wine/cream/gold2D PNG layers, Anton and Be Vietnam Pro,
existing books/podiums/penguin/ticket after the finite entrance.
STORY: Top leads the hem, pull decelerates into local recovery, fabric settles,
then the entire frame fades. Hanging details retain their supporting attachment.
FIRST VIEWPORT: Body portal below the header; no new copy, controls or dummy data
in production. Mobile swags/tassels stay shallow rather than stretching vertically.
SIGNATURE: Mount-only entrance, no filter/query replay. Focus or pointer immediately
releases the artwork so navigation and auction actions remain available.

## Layout and material

- Hero inner padding is 32px top/36px bottom with 24–48px responsive sides;
  copy/stage columns are .65fr/1.45fr with a 36px gap. Stage scene/ticket columns
  are 1.5fr/.9fr with a 24px gap. Books and stage are 380px high.
- Three contained, bottom-aligned covers occupy separate low oval plinths with
  visible wine gaps. Focal/left/right cover heights are 224/172/164px; plinths
  are 28/22/22px high, positioned 50/76/88px above the scene bottom. Focal width
  is 38% at left 31%; companions are 26% at left 2%/right 1%. Rotations are −2°/−5°/+5°.
- Cream elliptical tops (12px high) sit on shallow sand bodies (50% / 8px radius).
  A wine oval floor and local warm light support the books; directional ink
  shadows use #28191466. These are scene details, not new shared tokens.
- The reused standalone `penguins/auction.png` occupies the right foreground,
  width 150px/max 38%, bottom 4px; it is separate from the photographed books.
- Desktop Anton heading is clamp 32–52px/1.13, yellow continuation 1.15em;
  body 14px/1.8. The paper ticket has 4px corners, padding 18px, complete wrapping
  title 16px/1.5, price 28px/1.3, tabular numerals and one 44px Xem phiên action.
- At 1100px, copy/stage becomes .6fr/1.4fr with gap 24px, ticket padding 16px and
  price 24px. At 800px, copy stacks above a stage capped 680px; heading 40px and
  inner vertical padding 24px. Both companions remain visible when available.
- At 600px, sides 20px, heading 30px/1.2 with continuation 27px, body 13px;
  books cap 340px wide/300px high and sit above ticket with gap 12px. Cover heights
  are 170/130/124px, bases 24/18/20px, bottom positions 46/68/78px; penguin 122px.
  Ticket padding 12px, title 13px and price 22px preserve wrapping and the action.
- Above 800px with viewport height≤700px, inner vertical padding 20px, heading
  caps 40px, scene 312px; covers 190/140/134px, bases 24/18/20px, bottom 44/64/74px,
  penguin 136px. Existing fit-aware navigation remains; no new sticky layer.
- Shelf content retains max 1248px and 20–40px sides. Guide is a closed native
  details disclosure with three columns, becoming one below 700px. Book grid is
  four/three/two columns at desktop/1000px/700px; metadata stays unboxed.

## Real data and browsing

- Hero shares the public list/photo cache. Eligible leaders are photographed
  Active sessions with nonempty title and valid end time; retain the primary ID
  across snapshots, replace it when ineligible/absent; up to two companions are
  decorative. Selection compares parsed ISO times.
- Ticket uses starting/current price, server-aligned countdown and optional
  buy-now price. Stale data is labelled; reaching zero waits for server state
  rather than establishing a winner. Artwork proves no custody or inspection.
- `point`, `buyNow` and `sort` persist in the URL. They operate on the loaded
  public set of up to 50 sessions; show the limit notice at 50. Hero is independent
  of shelf criteria, with visible scope text when filtered. No private per-card
  participation read, invented totals, public automatic ceilings or fake covers.
- Shared FilterSelect is searchable desktop combobox/native select at 900px;
  below 700px controls stack full width, checkbox last. Live updates retain a
  30-second REST fallback. Cards distinguish prices, bidders, end time and point.
- Initial loading uses four skeletons and an honest hero fallback; mobile pending
  reserves 544px. Empty hero offers book search; read failure points to shelf retry.
  Known read failure retains URL choices; transient refresh failure retains cache
  with stale-price warning/retry. Image failure retains focal-photo retry.
- Labelled controls/group, native disclosure/checkbox, status/alerts, shared focus
  and 44px actions remain; hero shelf link scrolls/focuses results. Decorative art
  has empty alt, aria-hidden and no pointer. Simulation and TP.HCM remain visible.

## Motion and cancellation

- Body portal fixed below the reserved navbar row/z50, aria-hidden and pointer-inert; primer wine before
  decoded textures, bounded1200ms load deadline. Closed mesh covers the content viewport; navbar remains visible above it.
- Approved rig from art checkpoint8c0afdb; opening model0–2540 runs2×; fade2540–3000 runs4×; same textures/renderer and timing, no pose swaps. Recovery12–54design pixels, top settles before hem.
  Five ornaments inherit diềm translation/point-of-rotation; rope/tassels share
  outer mesh socket. Whole frame fades1524–1500ms and detaches render resources.
- Owner requested slimmer sides: runtime SIDE_WIDTH0.8 narrows settled/pulled
  inner edges and outer cloth20%; closed overlap unchanged. Tie accessories share
  x/width compression and mesh socket displacement. No new images or diềm changes.
- Owner requested a shallower top: valanceHeight0.8075 reduces y/height/translation
  of all three swags and their five attached ornaments together by19.25% (15% then another5%). Layer
  overlap/attachment relations remain; side cloth/ties and navbar do not change.
- Navbar reserve is measured via data-member-header-slot (76px desktop/72px
  mobile); a taller actual header also reserves room. ResizeObserver watches the
  slot/header/stage and cleans up together. Stable reserved height avoids chasing
  existing navbar transform animation; its z60 remains above curtain z50.
- Portrait: body meshes map to content viewport; DOM ornaments cap vertical scale at1.5×
  horizontal scale. Pendant y/height/translation scale together; tassel origin
  stays on rope knot. Resize preserves time instead of replaying.
- One requestAnimationFrame timeline survives StrictMode by disposing first setup.
  Each normal mount (Home→Back included) starts once; filters/cache/photo changes do not.
  Owner13/10 exception: successful Login return to this route uses only its paper
  transition. PaperArrivalContext identifies the committed destination; entrance
  snapshots it for that mount, creates no portal/renderer/art requests and stays
  skipped after paper finishes. Later navbar visits/Back/reload use the normal curtain.
  Full authored motion remains under reduced preference per owner11/10 policy.
- Focus, keydown, pointerdown, intentional scroll>24px after first tick, hidden
  document, pagehide and unmount release immediately. No scroll lock/inert/focus
  trap. Artwork is decorative; screen reader content remains available.
- Failed/late art cannot resurrect after deadline/unmount. Context loss rebuilds
  affected renderer as Canvas2D at current time; no Canvas reveals normal content.
- Hero has no separate curtain or scene arrival; existing cover hover/list/price/
  reorder feedback retained. No auction/query/session/business changes.

## Evidence and limits

[Integration evidence](../../../../.impeccable/review/auction-entrance/README.md)
records Chromium fixture desktop1440×900/mobile390×844/resize768×900, closed
coverage0pixel changed below navigation, navbar continuity, StrictMode/Back/query behavior, interruptions, fallbacks
and labelled synthetic books. Model geometry was checked separately in the art pack.
143 unit tests (134 existing +7 geometry/attachment checks +2 exit timing checks), lint/typecheck/build
PASS; build retains chunk>500kB warning. Detector one run,0findings. IAB page
opens on localhost5174; live API unavailable this session, so live book/price/photo
acceptance is NOT RUN. Physical phone/Safari/native/speech/FPS are NOT RUN.
Owner approved the art/motion; navbar continuity variant is the checkpoint waiting for
owner review. READINESS unchanged; no push/merge/deploy or API/DB writes.

[Login arrival regression](../../../../.impeccable/review/auth-auction-arrival/README.md)
adds desktop/mobile fixture evidence for the owner-approved paper-only handoff,
query/hash, restored focus/scroll, filters and subsequent navbar/reload entrance.
