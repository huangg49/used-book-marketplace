---
name: Lật lại — Member web and incumbent React Native
description: Built Member web bookstore world; React Native retains its separately scoped green system.
colors:
  shop-wine: "#5c0202"
  shop-cream: "#fcf8db"
  shop-paper: "#fffcf5"
  shop-ink: "#281914"
  shop-muted: "#716157"
  shop-line: "#d9cbbd"
  shop-control: "#8e7564"
  shop-orange: "#f68b51"
  shop-yellow: "#f4cb67"
  shop-mint: "#b6dac5"
  shop-wine-hover: "#7c2320"
  shop-error: "#912b0e"
  shop-shelf: "#f4eddf"
  shop-exchange-ink: "#254337"
  cover-sand: "#f0e2ca"
  cover-sage: "#d9e7dc"
  cover-peach: "#f6d4bd"
  cover-lilac: "#e6dced"
  detail-ground: "#efe3cf"
  rn-forest: "#214B40"
  rn-paper: "#F5EFDF"
  rn-surface: "#FFFCF4"
  rn-shelf-canvas: "#F6F8F3"
  rn-ink: "#202C27"
  rn-muted: "#58685E"
  rn-rust-text: "#963F28"
  rn-border: "#788477"
  rn-rule: "#D5D8C8"
  rn-success-surface: "#E8EFDF"
typography:
  display:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(3rem, 5.3vw, 5rem)"
    fontWeight: 400
    lineHeight: 1.16
    letterSpacing: "0"
  headline:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(1.8rem, 3vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.3
  detail-title:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "clamp(1.8rem, 3vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  card-title:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.5
  home-section:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.5
  home-section-narrow:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.5
  home-budget:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(1.75rem, 2.6vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.35
  home-exchange:
    fontFamily: "Anton, sans-serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.35
  home-posting:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(2rem, 3vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.35
  home-card-title:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 700
  price:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
  login-story:
    fontFamily: "Anton, sans-serif"
    fontSize: "clamp(3rem, 5.4vw, 5rem)"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0"
  login-title:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  login-story-copy:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.8
  login-description:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.8
  login-label:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
  login-action:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.8
  login-support:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.8
  login-credit:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.8
  login-note:
    fontFamily: "Be Vietnam Pro, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.8
  rn-search-title:
    fontFamily: "Be Vietnam Pro"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "36px"
  rn-shelf-title:
    fontFamily: "Be Vietnam Pro"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: "23px"
  rn-shelf-price:
    fontFamily: "Be Vietnam Pro"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "25px"
  rn-body:
    fontFamily: "Be Vietnam Pro"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
rounded:
  book: "2px"
  badge: "6px"
  control: "8px"
  panel: "12px"
  rn-sheet: "20px"
  rn-pill: "24px"
  web-floating-nav: "32px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  group: "24px"
  dialog: "28px"
  section: "32px"
  page: "40px"
  spacious: "48px"
  shelf: "68px"
components:
  button-primary:
    backgroundColor: "{colors.shop-wine}"
    textColor: "{colors.shop-cream}"
    rounded: "{rounded.control}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.shop-wine-hover}"
    textColor: "{colors.shop-cream}"
  button-search:
    backgroundColor: "{colors.shop-orange}"
    textColor: "#341509"
    rounded: "{rounded.control}"
    padding: "12px 24px"
  button-search-hover:
    backgroundColor: "{colors.shop-yellow}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.shop-wine}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  text-field:
    backgroundColor: "transparent"
    textColor: "{colors.shop-ink}"
    rounded: "{rounded.control}"
  login-text-field:
    backgroundColor: "#fff"
    textColor: "{colors.shop-ink}"
    rounded: "{rounded.control}"
    height: "52px"
  login-button-primary:
    backgroundColor: "{colors.shop-wine}"
    textColor: "{colors.shop-cream}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
    height: "52px"
  login-text-action:
    backgroundColor: "transparent"
    textColor: "{colors.shop-wine}"
    typography: "{typography.login-action}"
    padding: "8px 0"
    height: "44px"
  navigation:
    backgroundColor: "{colors.shop-wine}"
    textColor: "{colors.shop-cream}"
    padding: "12px 40px"
  condition-label:
    backgroundColor: "{colors.detail-ground}"
    textColor: "#5b3428"
    rounded: "{rounded.badge}"
    padding: "7px 12px"
  cover-panel:
    backgroundColor: "{colors.cover-sand}"
    rounded: "{rounded.panel}"
    padding: "26px"
  home-compact-cover-panel:
    backgroundColor: "{colors.cover-sand}"
    rounded: "{rounded.panel}"
    padding: "16px"
  home-category-selected:
    backgroundColor: "{colors.shop-cream}"
    textColor: "{colors.shop-wine}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  home-filter-selected:
    backgroundColor: "{colors.shop-wine}"
    textColor: "{colors.shop-cream}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  rn-button-primary:
    backgroundColor: "{colors.rn-forest}"
    textColor: "{colors.rn-paper}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  rn-text-field:
    backgroundColor: "{colors.rn-surface}"
    textColor: "{colors.rn-ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  rn-navigation-selected:
    backgroundColor: "{colors.rn-success-surface}"
    textColor: "{colors.rn-forest}"
    rounded: "{rounded.control}"
    padding: "8px 4px"
---

# Design System: Lật lại

## Overview

**Creative North Star: "Tiệm sách nhiều màu"**

Member web pairs the owner's wine-red owl and lettering with warm paper, tall display type and colored grounds for complete book covers. Discovery is lively; listing facts and task controls stay direct, readable and quieter than the covers. This records the world built after the owner's replacement decision on 10/10/2026, using the [surface contract](apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-booksearchpage-tsx.md) and [PRODUCT](PRODUCT.md), rather than the superseded green web sketches.

The implemented web slice is Home, Search, Detail, Login, shared Header/BookCard/ConfirmDialog and MainLayout/AuthLayout. Login owns its bookstore split with the original logo over the photograph, tactile ivory paper behind the form and a separate paper-side home action, apart from the shared Member Header; AuthLayout still serves the legacy registration scaffold. Existing posting and other forms, auction, chat, profile and registration retain legacy page recipes even where the shared shell changes. React Native retains its separate green Be Vietnam Pro system; its source/tests were not changed by this web build. Flutter remains scaffold. These tokens describe implementation, not human acceptance or a closed release gate.

**Key Characteristics:**

- Wine-and-cream identity with orange, yellow and mint discovery accents.
- Anton for expressive headings; Be Vietnam Pro for book facts and actions.
- Whole covers on colored grounds; unboxed metadata and separately labelled prices.
- Original owner logo and sourced decorative imagery, distinct from listing photographs.
- Responsive web recipes and a separately preserved React Native implementation.

## Colors

The web palette moves from a dark wine shell to warm paper shelves and soft cover grounds.

### Primary

- **Logo wine** (`shop-wine`): header, footer, primary actions, prices and selected photo controls.
- **Warm cream** (`shop-cream`): text and light actions against wine; focus outline on wine surfaces.
- **Wine hover** (`shop-wine-hover`): primary action hover on Detail, Login and the dialog.

### Secondary

- **Bookshop orange / shelf yellow / mint** (`shop-orange`, `shop-yellow`, `shop-mint`): search action and discovery grounds; yellow also emphasizes hero words and search hover. Home's budget pair uses shelf yellow and `cover-peach`; its exchange section uses the lighter `cover-sage` ground with scoped `shop-exchange-ink` introduction/link text.
- **Sand / sage / peach / lilac** (`cover-*`): the four recurring card cover grounds. They alternate by position, not listing condition, seller trust or availability.
- **Error rust** (`shop-error`): validation/error text and the dialog's danger variant.

### Neutral

- **Web paper / ink / muted** (`shop-paper`, `shop-ink`, `shop-muted`): canvas, reading text and secondary metadata. Home's discovery field and state panels use `shop-shelf`, with paper category/catalog panels; the gallery and descriptive condition labels use `detail-ground`.
- **Divider / control boundary** (`shop-line`, `shop-control`): quiet grouping versus the stronger Login, price-input, sort and radio boundary treatments.
- **Login scope:** the page binds the existing `shop-wine-hover`, `shop-error` and `shop-shelf` values locally because those roles are absent from global CSS. This restores the canonical hover, error and password-eye surface colors without adding a palette identity.
- **Incumbent RN colors** (`rn-*`): forest action/heading, paper canvas, surface navigation, shelf canvas, ink, muted, rust condition text, input border, divider and selected-navigation surface. These are preserved from [RN theme](apps/mobile-react-native/src/core/ui/theme.ts) and [brand identity](packages/brand/v1.1/identity.tokens.json), not applied to the new web slice.

**The Ground Is Not Status Rule.** Colored cover grounds are decorative; communicate condition, prices and reservation state in real text from the listing.

## Typography

**Display Font:** Anton, sans-serif (400).
**Body Font:** Be Vietnam Pro, sans-serif (400/700).

Both families are self-hosted in web `public/fonts`, with OFL files and [source notes](apps/user-web/public/fonts/WEB-SOURCES.md). Anton gives discovery headlines a tall, compact voice; task text and actual book titles use Be Vietnam Pro.

### Hierarchy

- **Home headline:** owner-supplied `Hero text final.png`, delivered as a transparent1313×655 PNG with only blank outer margins removed. Exact lettering/copy/illustration retained: SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI. H1 contains equivalent visually hidden text; its image is decorative to assistive technology. Width is min(100%,36rem), min(100%,28rem) below850px; height follows the original ratio. This artwork is a pinned Home exception to the Anton display token. It scales as a whole image rather than wrapping or scaling each glyph as live text.
- **Headline:** expressive discovery type outside the scoped Home task headings. Search has its own Anton `clamp(2rem, 3.4vw, 3rem)` / 1.28 heading.
- **Home discovery:** category and new-listing H2s use bold Be Vietnam Pro `home-section` (24px), reducing to `home-section-narrow` (20px) at600px. These are task headings, intentionally quieter than the approved hero. Anton is reserved for budget banners (`home-budget`,28–36px,28px at600px), exchange introduction (`home-exchange`,32px) and posting band (`home-posting`,32–40px,32px at600px), all with1.35 line height. These distinct roles explain the narrow H2/posting detector advisories; they are not global type replacements.
- **Login:** Anton `login-story` carries the two-line photograph story in cream/yellow; bold Be Vietnam Pro `login-title` carries the form greeting, reducing to 1.75rem below 440px. The greeting stays in one normal inline flow, fitting one line at desktop/390px/320px at default text size and wrapping naturally with large text. A 4px shelf-yellow underline with an 8px offset emphasizes “nhau rồi.” Story copy uses `login-story-copy`; the task description uses `login-description`. Labels use `login-label`; recovery and registration text buttons use `login-action`. Error, inline availability help, registration prompt and home-link text use the `login-support` size. Inputs and submit text are 1rem, with a bold submit label. The photo credit (`login-credit`) and bottom brand note (`login-note`) are intentionally smaller secondary text, not task instructions; the credit link retains at least 44px of height. These two explicit roles account for the detector's size advisories without shrinking the task copy.
- **Detail title / card title:** bold Be Vietnam Pro; narrow sizes are 1.65rem and 0.92rem respectively. Home's optional compact BookCard uses `home-card-title` (15px) above600px and the shared14.72px narrow title below it. Long titles wrap rather than truncate.
- **Body / label:** regular reading copy and bold controls. Supporting text is mostly 0.75–0.9rem with 1.6–1.9 line height; disclosure captions are smaller. Description text preserves line breaks; task explanations cap around 60–65ch.
- **Price:** Detail uses 1.5rem, reducing to 1.3rem on narrow layouts; card prices use 1rem then 0.9rem. Both use tabular numerals and separate sale/exchange labels.
- **RN:** one Be Vietnam Pro family with actual regular/bold faces, including the preserved `rn-*` roles. CSS units in this interchange map to RN logical pixels and retain system text scaling; web display type does not replace the RN type system.

**The Two Voices Rule.** Anton carries expressive discovery moments; Be Vietnam Pro carries Home category/catalog headings, book titles, prices, forms and consequential actions. Use the bundled weights.

## Layout

Web shelves, catalog, header/footer and Detail use centered containers up to 1280px; inner hero/posting content reaches 1200px. Typical desktop side padding is 40px, then 24px, then 20px on narrow screens. Reused gaps follow the frontmatter steps, with surface-specific 22px/28px/36px gaps where source uses them.

Home and Search have four cover columns, reducing to two at 850px and 800px respectively. Home discovery below the approved hero uses a1200px container,40px outer padding, four unboxed quick links, paper category/catalog panels and24–32px section gaps. Quick links become two columns and budget banners stack at850px; outer padding becomes24px there, then16px at600px with20px16px panel padding. Catalog cards use32px24px gaps; exchange cards use20px gaps; both use24px16px at600px. The exchange introduction sits beside four cards with a220px left column and32px gap, moves above them at1100px, then becomes a single text flow at600px. Posting actions wrap at850px and fill the band width at600px. Search filters go from three columns to two at 1000px, then one at 600px; the radios have explicit all-mode/all-condition choices. Search action wraps below the field at 600px. Detail pairs photograph and content with a 72px gap, reducing at 1000px and stacking at 720px.

Login uses a viewport-filling 45/55 split with `min-height:100dvh`, not a fixed-height lock. Its left scene uses an auto/1fr/auto grid: original Logo directly over the photograph, bottom-aligned story, then source credit. Logo padding is 32px vertically with clamp(32px,4vw,64px) sides; story padding is 64px on top and 20px below. The paper right column places a home action in a 64px utility row above a vertically centered form capped at 400px, with a quiet brand note below. Form padding is 16px vertically with clamp(24px,4vw,64px) sides; the note uses 8px 24px padding. At 900px and below the single-column layout retains a compact photographic logo area with 28px 24px padding, hides story/credit, and keeps home in its separate 56px paper-side utility row. At 440px and below form padding is 24px. Short viewports, large text, errors and help content grow the document naturally and may scroll. This Login composition follows its [surface contract](apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-loginpage-tsx.md); registration and the other shared-shell consumers keep their existing recipes.

At 800px the header uses an expandable menu while retaining both owl and lettering; the posting shortcut leaves the header at 600px and remains in the menu. Home uses eight decorative covers: two staggered 2×2 flanks around the headline above1100px; at1100px and below all eight move below search in a single row, becoming a 4×2 grid at800px. The same collection is rendered once, with complete contained images and user-supplied cover provenance. Dialog width is `calc(100% - 32px)`, capped at 480px, with scrollable height and stacked actions at 420px. These are implemented surface breakpoints, not one universal device taxonomy.

Wide, short laptop viewports (`min-width:1101px` and `max-height:850px`) use a compact Home stage: headline-art width `min(100%,clamp(20rem,66vh,32.5rem))`, cover height `clamp(116px,18vh,152px)`, hero padding28px/12px and row gap36px. The two cover clusters keep their2×2 structure with24px row gaps and16px stagger; page artwork scales to310×456px. The discovery quick-link row has28px vertical padding below the hero. This adapts to available height without browser zoom, fixed section height, hidden content or smaller touch targets. Larger text can grow naturally; mobile and tall desktop retain their existing layout structure.

RN retains content width 480dp, page padding 20dp, targets at least 48dp and controls at least 52dp. Search owns its fixed header and 32%-width cover beside metadata; below 360dp with effective text scale at least 1.29 it stacks vertically. Screens own safe area. This is RN implementation context, not a web recipe or proof that every RN screen has been redesigned.

## Elevation & Depth

Web uses tonal grounds and restrained photographic shadows. Metadata remains unboxed. Shadow belongs to covers, the hero search surface and the modal rather than every card. The one-time Home cover settle lasts 0.8s; card-image hover lifts 4px over 0.3s. Global reduced-motion handling suppresses animation and transition. RN retains tonal grouping and dividers without decorative shadows; its sheet scrim is `rgba(20,36,28,.45)`.

Login's photograph is static, with 2px CSS blur, a 1.025 scale to conceal blurred edges and a 64% wine tint (`#5c0202a3`). The sharp cream/yellow lettering sits above this atmospheric scene. A generated clean ivory-paper texture repeats at 512px and 85% opacity over the right column's paper ground; white controls remain crisp. One white light sweep crosses this paper on entry (2400ms, cubic-bezier(.16,1,.3,1)), fading 0→30%→0 and ending invisible. Both decorative layers sit behind content and ignore pointer input. Reduced motion omits the sweep entirely; grain and controls do not move. The submit background transition remains 160ms ease-out with global reduction. These material treatments are scoped to Login and do not crop or blur listing evidence.

### Shadow Vocabulary

- **Listing photograph:** `drop-shadow(0 12px 12px #28191424)`.
- **Hero cover:** layered filters `drop-shadow(-1px -1px 0.5px #fcf8db66) drop-shadow(1px 3px 2px #21000080) drop-shadow(8px 18px 16px #1d000099)` separate the paper edge, contact and cast shadow on wine. Compact mobile covers use cream edge `#fcf8db55`, contact `1px 2px 1px #21000080` and cast `4px 10px 10px #1d000080`. Fine-pointer hover enlarges1.12× and lifts8px over250ms, with edge `#fcf8db80`, contact `2px 5px 3px #21000099` and cast `12px 26px 22px #190000b3`, returning on exit. Owner explicitly requests hero entrance/hover/sway even when the OS asks for reduced motion; the exception is scoped to these covers; the owner subsequently requested removal of the pause control. Covers are decorative and add no tab stops or false click affordance.

Home's wine ground includes three original cream line illustrations: asymmetric page curls around the two cover clusters and an open book with a turning page at the lower right. They are static, aria-hidden and pointer-inert. The isolated artwork layer clips only its own edges, leaving cover elevation and controls free. At1100px the curls shrink to the outer margins; at600px the open book disappears and the curls recede to avoid the headline, search and source caption. These are Home decoration, not a replacement logo or listing content.

Owner-requested gentle Home sway uses a separate inner wrapper: ±3px vertical and ±1° rotation over6–7.5s, staggered by negative phase delays. The owner explicitly requested continuous sway during hover and removal of the pause/resume control. Hover image zoom stays independent; IntersectionObserver and visibilitychange still pause loops offscreen or in a hidden document. CSS restores normal duration/iteration even under OS reduced motion for these covers only. There is currently no visitor control to stop the loop; this is a known accessibility limitation, not an acceptance PASS. Description and search have more breathing room: desktop description top margin38px (compact32px), stage/search gap40px (compact36px), mobile description top margin28px. No other shelves animate continuously.
- **Hero search:** `box-shadow: 0 12px 28px #2f00002e`.
- **Modal:** `box-shadow: 0 18px 60px #28191440`; backdrop `#28191480`.

## Shapes

Web controls use gently rounded corners (`control`), cover grounds/search shells/panels/dialog use `panel`, and condition labels use `badge`. Complete photographs use contain fitting within a 4:5 ground; no decorative crop removes condition evidence. RN keeps its book, control, sheet and pill radii from the incumbent system.

## Components

### Buttons

Solid wine with cream text for primary tasks; orange with dark text for search. Detail's main action is full-width, at least 50px tall; search is at least 48px on desktop and 44px narrow. Login uses at least 52px with 12px 22px padding; dialog uses 46px. Secondary pagination is transparent with a wine border and inverts on hover. Disabled primary/dialog actions reduce opacity. Keyboard focus is a 3px outline offset 4px; header and footer controls use a cream outline against wine.

### Cards / Containers

BookCard combines a rounded 4:5 colored ground, contained listing photograph, condition text, title, author and separately labelled prices. Cover padding is 26px then 16px at 600px. Metadata is unboxed. Hover lifts the image; title and view links underline. Held-state text is a cream strip, not a trust badge. Load/empty/error panels use the warm shelf ground and a concrete next action.

The optional `compact` BookCard variant is used only by Home's two shelves:1:1.1 cover ground with16px padding,12px metadata gap,15px desktop title and12px author bottom margin. Narrow titles retain the shared0.92rem rule. Photo loading/retry, complete contain fitting, price labels and held-state semantics stay shared; Search retains the default4:5 recipe.

### Home discovery below the approved hero

Owner-authorized catalog preview (10/10/2026) preserves this composition. Dev-only
Home can explicitly show91 cached Open Library editions across eight categories,
with complete remote edition covers and source links. The opening eight span
literature, life skills, business, science, history, children, manga and light novel.
After the budget pair, three themed paper shelves reuse the catalog heading/card
recipe: literature/children, science/history and skills/business, four books each,
24px apart with32px above the group. Their source-only cards skip the opening
eight; topic links filter Home locally, retain topic on mode/price changes and
offer a return to all subjects. These shelves are preview-only. A task-status
notice and each card label sample price/condition/mode; no seller or transaction
is simulated. Preview cards reuse the compact recipe and open Open Library,
never real listing detail. Search, price/group links and local category/expansion
operate inside Home. Budget artwork uses distinct catalog covers in both modes;
hero art/layout/motion and shared Search cards remain unchanged. A wrapping
14px/1.8 status row with24px top padding and44px live-data link uses existing
ink/wine tokens. Explicit live mode shows API failures without sample fallback;
production disables preview. This is UI evidence, not a database or E2E demo.

The [Home surface contract](apps/user-web/.impeccable/surfaces/apps-user-web-src-pages-homepage-tsx.md) records this local extension. Four quiet direct links lead to buying, exchange, Sale up to100000 and posting. Category choices wrap with44px minimum targets; selection is cream with a wine boundary and text. Categories derive from the latest24 responses in the selected shelf and filter only those loaded records; visible scope text states this limit. The four shelf filters (all, buy, exchange, Sale up to100000) request server-backed groups; selected controls use wine/cream. Changing group clears category and resets visible items to8; show-more adds8 locally. The full-catalog link carries supported mode/price filters and omits local category. Loading/empty/error/retry remain visible and failed requests hide stale cards.

Two rounded budget banners follow, yellow and peach, linking to Sale up to50000/100000. Their rotated owner-supplied covers are illustrations, separately disclosed under the pair; they never stand in for listing photos or actual prices. The sage exchange section pairs a dark-green introduction with four compact cards requested with Exchange mode. Its note attributes exchange values to the poster. A wine band ends with an Anton cream/yellow invitation and48px cream posting action. These sections add no continuous animation. Their panel corners are12px; selected controls and actions use8px. Category/filter labels, long book names and prices wrap as text grows.

Final six named Home captures in `.impeccable/review/web-member/home-discovery-*.png` and their JSON sidecars are synthetic response-fixture evidence, visibly labeled in the captures. Build,16unit tests and lint with0errors/6legacy warnings passed; seven viewport/text-scale cases at100/130/200% passed. Real API, native and human acceptance were NOT RUN. The one final detector returned12advisories: the new exchange-ink occurrences and narrow section/posting sizes are intentional source-backed local roles recorded here; eight existing hero/shared-card advisories remain outside this diff and are not promoted into new system rules. No detector rescan is implied.

### Inputs / Fields

Search sits inside a paper shell with a transparent borderless inner field and an explicit label. Login uses white outlined fields at least 52px tall, an 8px radius and the stronger `shop-control` boundary. Each field group has an 8px internal gap; the second group begins 16px after the first. The password label/recovery row wraps and is at least 44px tall. Its password eye is a labelled 44×44px button with a 6px radius; hover uses wine text on the shelf ground. Numeric price fields are at least 42px and sort is 44px. Mode and condition use native single-selection radios with explicit all choices. Labels and invalid-price explanation remain visible; focus and caret use the wine identity. Preserve entered values on errors.

### Navigation

The shared Member web Header stays visible across MainLayout, legacy AuthLayout
registration, DashboardLayout and standalone posting. Login owns its photographic
Logo area and paper-side home action and does not render this scrolling Header. Wine/cream, original logo and desktop
current-page underline remain. At the top it spans the viewport,76px tall;
after48px of scrolling it becomes a64px floating bar,12px from the top,
max-width1280px with at least24px side clearance,32px radius and a soft
`0 12px 28px #28191433` shadow. It returns to the full-width form at16px or less.
The reserved slot stays76px, so the page does not jump during the change.
The360ms exponential transition changes only the fixed bar and its row; the
passive scroll listener updates React only at the two thresholds. On each actual
collapse, a pointer-inert1.5px cream inner edge fades0→65%→0 over the same360ms,
then animationend clears the transient state. Expanding interrupts the edge
immediately; loading an already-scrolled page does not replay it. The owner
explicitly requests visible shrinking on their reduced-motion laptop: the finite
navbar morph/edge retain360ms under that preference. This is a separate scoped
exception from hero sway; other UI still uses the global reduction.

At1000px and below, top height/slot is72px; the floating bar sits8px from the
top with10px side clearance. The original owl and lettering remain; at420px
their CSS windows scale to82% without changing source pixels, leaving room for
notification and menu controls. Interactive targets remain at least44px tall.
Narrow menus expand beneath the row, scroll within the available height, close
on navigation/Escape or resizing to desktop, and return focus on Escape.
The open floating menu uses24px corners. Notification panels fit within the
narrow viewport. The skip link appears on focus;96px scroll padding keeps
scrolled anchors/focus clear of the navbar. Legacy page content is not redesigned
by this shared navigation refinement; Android/admin remain separate.

### Condition labels and confirmation

Detail condition/mode labels are descriptive, softly filled rectangles rather than verification. ConfirmDialog uses a paper surface, readable task explanation, wine confirmation and outlined cancel, with modal backdrop and a narrow stacked action layout. Purchase wording explains a 24-hour reservation/chat without payment; visual styling must not turn that into a purchase-success promise.

### Login bookstore scene

The decorative local 3000×2818 JPEG is Davit Margaryan's Barcelona bookstore photograph from Unsplash, with [provenance](apps/user-web/public/photography/README.md). It uses cover fitting at 64% horizontal position and a desktop source link, without representing a Lật lại premises or an API listing. The original Logo's PNG and CSS crops are reused without regeneration. A Login-scoped SVG color matrix keys the original flat wine ground to alpha while retaining the original cream contours, so both owl and lettering sit directly over the scene; no shared Logo change or new Logo raster asset is introduced.

The right-side paper asset has [generation provenance](apps/user-web/public/login-art/README.md); no book illustration ships. The greeting has 16px below it and the description has 20px below it. Submit starts 24px after the field/error content. The centered registration row starts 20px below submit with 12px top padding and a single 1px `shop-line` rule. Recovery and registration are underlined wine text buttons with 44px minimum height, transparent ground and a `shop-control` underline that becomes currentColor on hover. Their inline `role="status"` messages explain that reset/registration are unavailable and suggest browsing; only one help message is open at a time. These buttons preserve both field values and send no requests or navigation. Email/password, password visibility, pending submit, distinct connection/credential errors and safe returnUrl retain the existing SessionClient behavior. This recipe adds affordances, without adding reset/registration endpoints or changing the legacy registration scaffold.

## Do's and Don'ts

### Do:

- **Do** preserve the owner's original logo pixels and the owl-plus-lettering identity on narrow screens.
- **Do** use complete API listing photographs and expose condition, sale price and exchange value with their real labels.
- **Do** keep archival and owner-supplied Home covers decorative and visibly captioned, with provenance in the asset READMEs/sidecars.
- **Do** use the scoped web tokens for this implemented slice and the incumbent RN tokens for unchanged native screens.
- **Do** retain error/empty/loading states, keyboard focus, wrapping titles and reduced-motion behavior.
- **Do** explain consequential actions in direct Vietnamese, including reservation without payment.

### Don't:

- **Don't** substitute stock or archival covers for real listing photographs or invent rating/trust claims.
- **Don't** treat alternating cover colors or descriptive condition labels as verification or transaction status.
- **Don't** infer that legacy web pages, Android, Flutter or release gates adopted this web redesign.
- **Don't** regenerate the supplied logo, imitate its lettering with a font, or treat a reference screenshot as licensed cover assets.
- **Don't** canonize legacy glyph-icon, display-font or animation recipes as part of this web world.

Source inventory: web global CSS, Home/Search/Detail/Login module CSS, BookCard, Header/MainLayout, AuthLayout and ConfirmDialog; RN theme/brand tokens preserve the previous implementation. [Brand provenance](apps/user-web/public/brand/README.md) and [illustration provenance](apps/user-web/public/illustrations/README.md) record the assets. Legacy Material Symbols import/old animation classes remain outside the documented web slice; this documentation pass does not repair or endorse them.
