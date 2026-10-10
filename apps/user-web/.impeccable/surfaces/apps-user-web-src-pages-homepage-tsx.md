---
version: 1
slug: "apps-user-web-src-pages-homepage-tsx"
primary_target: "apps/user-web/src/pages/HomePage.tsx"
related_targets: ["apps/user-web/src/pages/home-motion.ts", "apps/user-web/src/pages/HomePage.module.css", "apps/user-web/src/components/BookCard.tsx", "apps/user-web/src/components/BookCard.module.css", "apps/user-web/src/components/HomeBookCard.tsx", "apps/user-web/src/services/home-shelves.ts"]
---

# Home — discovery below the approved hero

Mode: operate. Owner says the hero is approved and explicitly requests redesign
only below it, referencing https://www.fahasa.com/. Confirmed answer: combine
categories, buy/exchange and price. Inherit Lật lại's wine/cream identity;
code-led local extension, no new identity roll, comp or whole-page tournament.
Reference inspected10/10/2026: clear category entry, grouped product shelves,
price-led discovery and denser catalog rhythm. Do not import Fahasa branding,
retail promotions, ratings, sales counts, coupons or commercial claims.

## Direction contract

THESIS: After the expressive hero, browsing feels like a usable secondhand-book
shop: choose how to read, scan actual copies, then inspect condition and price.

OWN-WORLD: Existing wine/cream/yellow/mint palette and original assets; warm
secondary paper field, quiet cream shelf grounds, Be Vietnam Pro24px bold section
heads and task text, Anton only for the budget/exchange display moments.
Complete actual listing photographs and unboxed metadata stay authoritative.

STORY: Four paper bookmark shortcuts for buying, exchange, auction and posting. Explore actual
categories in the currently loaded shelf; switch server-backed buy/exchange/price
groups; show more locally loaded copies; open the full catalog with supported
filters. Two budget banners lead to Sale max50000/100000. A separate exchange
shelf and a layered autumn scene containing the posting CTA close the journey. No new API/session/backend behavior.

FIRST VIEWPORT: Approved hero assets/motion/search remain; bottom padding32px
leaves20px caption clearance above the bookmarks. Below:
four paper bookmark shortcuts, category section, new-listing shelf with four pressed
filter buttons, up to ten compact BookCards in five laptop/six wide-desktop columns. Budget
banner pair follows, then mint exchange section with a left introduction and
four compact cards, then a full-width autumn closing with the wine posting card on the left and foreground fox on the right; on narrow screens the card sits above the fox. Content max1200px, desktop outer40px,
section padding28px/gaps24–32px. Catalog/topic cards become four columns at1100px, three at850px, two at600px. <=1000px quick navigation becomes two columns,
banner pair stacks; <=600px outer16px and sections20px16px. Enlarged text wraps
and the document grows naturally. Shared Search/Detail cards retain default size.

FORM: Owner-pinned extension to the existing surface, no seed required. Main
shelf requests latest24 with server mode/maxSalePrice filters; shows10 then adds10
per click. Categories derive verbatim from that response; no category endpoint
exists. Category filtering is local to those24 and is explicitly labeled; the
full-catalog link omits category and says it searches all books. Group changes
clear category/reset visible10. Loading/empty/error/retry and pending flags remain
truthful; request failures hide stale cards. Listing cards never use decorative
covers as fallback. Banner covers are reused owner-supplied illustrations with
a visible illustration/price disclaimer. All buttons/links keyboard-operable;
no continuous animation in shelf content. Guarded canopy/margin motion is now approved below. No invented discounts or totals.

FINISH: Bounded desktop/mobile/large-text/state evidence, one final detector,
fresh independent finish reviewer and canonical documentation; local commit
only. API-real/native/human acceptance not implied by response-fixture captures.

## Owner-authorized catalog preview extension — 10/10/2026

Owner requests plentiful API-sourced books for UX/UI, especially manga/light
novel, with a real demo DB prepared later. Do not reuse hero books below it.
This is a data-source extension preserving the approved layout and identity.

Explicit dev-only mode: env VITE_CATALOG_PREVIEW=true or data=preview; data=live
overrides env, production always disables preview. Home alone uses91 cached
Open Library editions across eight categories, English metadata
and complete remote covers tied to edition IDs. API snapshot includes source,
query and date; no DB writes. Budget artwork now uses four separate catalog
covers in both modes. Hero art/layout/motion stays unchanged; its search and
caption reflect preview mode. Preview search, group/price links and filters stay
inside Home, with navigation resetting category/visible10. Show-more adds10 and
full shelf shows all matches. No new category API is implied.

Owner hides the full-width preview notice/live-data link on10/10 for a cleaner
hero-to-shortcut transition. Hero caption, shelf heading and each card still
label illustrative price/condition/mode; data=live remains available. No fake
seller, media, version or transaction state. Preview cards open Open Library
source tabs, never listing detail or purchase. Cover errors have retry and never
substitute hero art. Real mode keeps listings/media/session/error behavior and
never falls back to preview. Header/Search/Detail remain real API surfaces.

Finish includes preview category/search/price/expansion/empty/remote-image-error,
live-error isolation, desktop/mobile/large-text evidence and build/unit/lint;
does not certify MongoDB demo, backend integration or native acceptance.

Owner expansion: add substantial non-manga subjects and expose them on Home.
Opening ten interleave literature, skills, business, science, history, children,
manga and LN. Three preview-only shelves after the budget pair show ten books
each: literature/children, science/history, skills/business.
Reuse paper shelf, heading, card and responsive five/six-to-two-column grid; new group spacing
32px above/24px between. Skip the opening ten to avoid immediate repetitions.
Topic links filter the main preview shelf; mode/price changes retain the topic,
and a visible return clears it. Budget art uses Gatsby/Atomic Habits/Brief History
of Time/Matilda. No new world, tokens, animation, API or real-mode subject claim.

## Owner-approved density refinement — 10/10/2026

Owner approves smaller cards like the supplied Fahasa reference: five per laptop
row, six at1600px, two on mobile. Cover stages200/180/160px with12/8px padding,
full contain fitting; metadata gaps tighten while title/price type stays legible.
Titles show two lines with full DOM/accessibility/tooltip text; source actions
remain44px and failure stages grow for retry content. Main shelf starts/adds10;
topic shelves show10 each, exchange remains4 beside its introduction. Hero,
Search defaults, actual API/session and preview/source/sample boundaries stay
unchanged. This owner-pinned refinement supersedes earlier density counts.

## Owner-approved penguin bookmark shortcuts — 10/10/2026

Owner-approved Home shortcuts are four soft paper bookmarks in buy/exchange/auction/post order. The880px row overlaps the hero boundary12px, with32px gaps and28px below; four columns, two at1000px with max440px/gap16px; at600px gap12px and24px below. Whole anchors remain unclipped with wine3px outline/offset3px. An aria-hidden pointer-inert SVG supplies8px upper corners, a40px-wide/19.5px-deep central V and non-scaling1px warm border at50% alpha. Existing ivory-paper.webp is reused inside unique useId clip paths, at20% opacity/multiply; no SVG noise or new asset. A168px wine stitching line at35% alpha runs along the top inset16px, with2px/5px round-ended dashes. Exchange/post cream #fffaf0; buy/auction share butter-gold #f6e0a8. Images88px desktop/mobile shift up2px above short15/14px bold wine labels. Minimum heights144/152px, padding4px12px24px or4px10px28px,4px gap; labels can wrap and links grow. Fine-pointer hover raises the paper5px/rotates−1deg with a0 9px 10px #28191426 silhouette shadow, raises the label5px and the penguin8px/rotates−5deg/scales1.08. Entry280ms, return180ms, active press100ms at1px with the penguin at−1px/scale.98. Keyboard focus shares the raised state and retains its outline. Original buy/exchange/post and auction PNGs, hero bottom32px/caption clearance20px, hero art/navbar/logo/catalog/API/session/routes remain. Mua sách→Sale, Đổi sách→Exchange, Đấu giá→/auctions, Đăng sách→/sell. No repeated arrows, badges or extra copy; owner-authorized paper/thread/hover treatment supersedes the previous flat bookmark recipe. A separate aria-hidden pointer-inert backing SVG repeats the same silhouette in shop-wine, translated2px right/3px down at z-index−2. The backing and anchor stay fixed; only the top paper, character and label move on fine-pointer hover or keyboard focus. Per the owner’s earlier explicit preference, these finite interaction transitions stay visible with OS reduced motion, using scoped duration overrides; other surfaces retain their existing preferences. No autoplay or loop is added. This owner-approved thin red paper layer is geometry, not an offset box shadow. The shortcut row retains its flow-root band and−12px overlap/28px desktop or24px mobile gap. Step1 of the owner’s autumn background uses plain #ffefcb across the Home marketplace, sampled from the center of the supplied1920×1080 Background demo.png. The separate shortcut paper/page-mask backdrop is removed. Hero, bookmark texture/hover/size, catalog panel surfaces, footer content remain. The owner now approves sparse autumn ornament: twenty-four individually placed motifs using one3×2 transparent768×512/55946-byte ImageGen atlas (maple, oval, oak, twig, acorn, paired seed). Motifs vary30–66px/rotation/spacing and appear only in the two outer margins at30% opacity; mobile caps them at30px/22% opacity. CSS sprite cells never tile. An aria-hidden/pointer-inert clipped decorative layer sits at z0; actual content and bookmarks at z1, with no focus clipping. marketplace establishes a flow-root to preserve the−12px hero overlap. Six selected margin leaves now drift with viewport/visibility guards, including OS reduction by owner request. New asset provenance and full prompt live beside motifs.webp.  Two owner-approved asymmetrical autumn canopies now hang from the hero-to-marketplace boundary. One transparent1200×800 WebP atlas (76574bytes) is addressed as two half-width CSS cells: each span is clamp(220px,26vw,400px) wide with3:4 aspect ratio/background-size200%100%; left/right edges anchored at0. A separate aria-hidden/pointer-inert z0 layer clips only artwork with height clamp(240px,32vw,400px). At600px and below, cells are145px and the clipped layer180px. Full-color maple/oval/oak leaves follow the supplied Background demo palette, behind z1 bookmarks/content. Canopies now have a guarded12s breeze, including OS reduction by owner request; geometry, content, routes and API remain.  Owner-approved layered autumn closing contains the existing wine posting invitation. After marketInner, an accessible full-bleed wrapper isolates hills at z0, the wine card at z1 and a transparent fox at z2, with a slight overlap at the card edge. The wrapper itself is not aria-hidden or pointer-inert: only landscape/fox artwork has empty alt, aria-hidden and pointer-events:none; both images remain lazy/async. Copy stays “Đọc xong rồi? Để sách đi tiếp.”, “Chụp ảnh, ghi rõ tình trạng và đăng sách để bán hoặc đổi.”, “Đăng sách của bạn” → /sell, and “Mỗi bản sách có ảnh và mô tả riêng.” Desktop closing margin32px -40px -56px/padding72px40px100px, inner max1200px; card width calc(100% - 260px), padding32px96px32px36px/gap32px/radius12px; fox340×380px right0/bottom−100px, contain/bottom. At1100px card width calc(100% - 210px) wraps and fox290×350px. At850px closing margins−24px/−40px and padding40px24px24px; card becomes full-width block with28px24px48px padding, action full-width/margin-top20px, inner bottom reservation200px and fox220×240px/bottom−24px. At600px closing margin24px -16px -32px/padding-inline16px; posting heading32px. The48px cream action retains hover-yellow and cream focus. Hills are bottom-centered, width100%/minimum960px, with a72px alpha-mask transition at the top. hills-background.webp is ImageGen output1600×900/80992bytes; fox-foreground.webp is alpha ImageGen output600×750/53050bytes, both derived from the supplied Background demo.png; full prompts/source/delivery hashes are adjacent. Runtime HTML ratio attributes1920×1080 and400×500 match the deliveries. Previous fox-landscape.webp remains a preserved unused variant. Home footer stays flush; hero, bookmarks, canopies,24 motifs, shelves, footer content, routes and API behavior remain.

Owner approves implementing the bookmark concept with simpler web materials,
keeping the penguin family and routes. Code-led local refinement; no new
identity roll, replacement logo or raster screenshot used as runtime UI.
Finish: desktop/mobile/narrow captures, keyboard focus and four navigation
checks; generated image provenance/alpha, build/lint, independent review.

## Approved Home animation extension —10/10/2026

Home motion approved10/10: eight covers gather from their own flank over600ms with0/60/180/100ms delays, Alice/Dược sư last; independent sway and hover remain. Home-only card hover/focus lifts5px/scales1.025 over240ms, metadata stays still. Controls use150ms color/120ms press; budget covers fan over320ms. Committed filter results fade.72→1 over180ms (also under OS reduction), interrupted animations cancel. Added visible books beyond page10 enter over220ms with at most144ms stagger; existing keyed cards remain still, offscreen additions do not replay on scroll. Two canopies sway12s/±.45deg; six of24 margin motifs drift40px over16/19s with a resting interval. Each region pauses outside viewport/document hidden. Owner now explicitly requests all Home motion under OS reduction too; Home-only duration overrides retain the same motion while all viewport/visibility guards remain. Global preferences elsewhere are unchanged. Fox settles12px/−2deg once over650ms on first visible entry, also under reduced motion by owner request. Layout/assets/routes/data unchanged; no motion dependency added. Static canonical sample records CSS/recipe; observers and WAAPI live in HomePage.tsx/home-motion.ts.
