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
  navigation:
    backgroundColor: "{colors.shop-wine}"
    textColor: "{colors.shop-cream}"
    padding: "16px 40px"
  condition-label:
    backgroundColor: "{colors.detail-ground}"
    textColor: "#5b3428"
    rounded: "{rounded.badge}"
    padding: "7px 12px"
  cover-panel:
    backgroundColor: "{colors.cover-sand}"
    rounded: "{rounded.panel}"
    padding: "26px"
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

The implemented web slice is Home, Search, Detail, Login, shared Header/BookCard/ConfirmDialog and MainLayout/AuthLayout. Existing posting and other forms, auction, chat, profile and registration retain legacy page recipes even where the shared shell changes. React Native retains its separate green Be Vietnam Pro system; its source/tests were not changed by this web build. Flutter remains scaffold. These tokens describe implementation, not human acceptance or a closed release gate.

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

- **Bookshop orange / shelf yellow / mint** (`shop-orange`, `shop-yellow`, `shop-mint`): search action and discovery grounds; yellow also emphasizes hero words and search hover.
- **Sand / sage / peach / lilac** (`cover-*`): the four recurring card cover grounds. They alternate by position, not listing condition, seller trust or availability.
- **Error rust** (`shop-error`): validation/error text and the dialog's danger variant.

### Neutral

- **Web paper / ink / muted** (`shop-paper`, `shop-ink`, `shop-muted`): canvas, reading text and secondary metadata. Shelf panels use `shop-shelf`; the gallery and descriptive condition labels use `detail-ground`.
- **Divider / control boundary** (`shop-line`, `shop-control`): quiet grouping versus the stronger Login, price-input, sort and radio boundary treatments.
- **Incumbent RN colors** (`rn-*`): forest action/heading, paper canvas, surface navigation, shelf canvas, ink, muted, rust condition text, input border, divider and selected-navigation surface. These are preserved from [RN theme](apps/mobile-react-native/src/core/ui/theme.ts) and [brand identity](packages/brand/v1.1/identity.tokens.json), not applied to the new web slice.

**The Ground Is Not Status Rule.** Colored cover grounds are decorative; communicate condition, prices and reservation state in real text from the listing.

## Typography

**Display Font:** Anton, sans-serif (400).
**Body Font:** Be Vietnam Pro, sans-serif (400/700).

Both families are self-hosted in web `public/fonts`, with OFL files and [source notes](apps/user-web/public/fonts/WEB-SOURCES.md). Anton gives discovery headlines a tall, compact voice; task text and actual book titles use Be Vietnam Pro.

### Hierarchy

- **Home headline:** owner-supplied `Hero text final.png`, delivered as a transparent1313×655 PNG with only blank outer margins removed. Exact lettering/copy/illustration retained: SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI. H1 contains equivalent visually hidden text; its image is decorative to assistive technology. Width is min(100%,36rem), min(100%,28rem) below850px; height follows the original ratio. This artwork is a pinned Home exception to the Anton display token. It scales as a whole image rather than wrapping or scaling each glyph as live text.
- **Headline:** shelf and posting section headings. Search has its own Anton `clamp(2rem, 3.4vw, 3rem)` / 1.28 heading; Login uses `clamp(2rem, 5vw, 3rem)` / 1.35.
- **Detail title / card title:** bold Be Vietnam Pro; narrow sizes are 1.65rem and 0.92rem respectively. Long titles wrap rather than truncate.
- **Body / label:** regular reading copy and bold controls. Supporting text is mostly 0.75–0.9rem with 1.6–1.9 line height; disclosure captions are smaller. Description text preserves line breaks; task explanations cap around 60–65ch.
- **Price:** Detail uses 1.5rem, reducing to 1.3rem on narrow layouts; card prices use 1rem then 0.9rem. Both use tabular numerals and separate sale/exchange labels.
- **RN:** one Be Vietnam Pro family with actual regular/bold faces, including the preserved `rn-*` roles. CSS units in this interchange map to RN logical pixels and retain system text scaling; web display type does not replace the RN type system.

**The Two Voices Rule.** Anton carries discovery headings; Be Vietnam Pro carries book titles, prices, forms and consequential actions. Use the bundled weights.

## Layout

Web shelves, catalog, header/footer and Detail use centered containers up to 1280px; inner hero/posting content reaches 1200px. Typical desktop side padding is 40px, then 24px, then 20px on narrow screens. Reused gaps follow the frontmatter steps, with surface-specific 22px/28px/36px gaps where source uses them.

Home and Search have four cover columns, reducing to two at 850px and 800px respectively. Home discovery tiles go from three columns to one at 600px. Search filters go from three columns to two at 1000px, then one at 600px; the radios have explicit all-mode/all-condition choices. Search action wraps below the field at 600px. Detail pairs photograph and content with a 72px gap, reducing at 1000px and stacking at 720px. Login's centered form container is at most 520px wide.

At 800px the header uses an expandable menu while retaining both owl and lettering; the posting shortcut leaves the header at 600px and remains in the menu. Home uses eight decorative covers: two staggered 2×2 flanks around the headline above1100px; at1100px and below all eight move below search in a single row, becoming a 4×2 grid at800px. The same collection is rendered once, with complete contained images and user-supplied cover provenance. Dialog width is `calc(100% - 32px)`, capped at 480px, with scrollable height and stacked actions at 420px. These are implemented surface breakpoints, not one universal device taxonomy.

Wide, short laptop viewports (`min-width:1101px` and `max-height:850px`) use a compact Home stage: headline-art width `min(100%,clamp(20rem,66vh,32.5rem))`, cover height `clamp(116px,18vh,152px)`, hero padding28px/12px and row gap36px. The two cover clusters keep their2×2 structure with24px row gaps and16px stagger; page artwork scales to310×456px. The first real shelf starts28px below the hero. This adapts to available height without browser zoom, fixed section height, hidden content or smaller touch targets. Larger text can grow naturally; mobile and tall desktop retain their existing layout structure.

RN retains content width 480dp, page padding 20dp, targets at least 48dp and controls at least 52dp. Search owns its fixed header and 32%-width cover beside metadata; below 360dp with effective text scale at least 1.29 it stacks vertically. Screens own safe area. This is RN implementation context, not a web recipe or proof that every RN screen has been redesigned.

## Elevation & Depth

Web uses tonal grounds and restrained photographic shadows. Metadata remains unboxed. Shadow belongs to covers, the hero search surface and the modal rather than every card. The one-time Home cover settle lasts 0.8s; card-image hover lifts 4px over 0.3s. Global reduced-motion handling suppresses animation and transition. RN retains tonal grouping and dividers without decorative shadows; its sheet scrim is `rgba(20,36,28,.45)`.

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

Solid wine with cream text for primary tasks; orange with dark text for search. Detail's main action is full-width, at least 50px tall; search is at least 48px on desktop and 44px narrow. Login uses 50px; dialog uses 46px. Secondary pagination is transparent with a wine border and inverts on hover. Disabled primary/dialog actions reduce opacity. Keyboard focus is a 3px outline offset 4px; header and footer controls use a cream outline against wine.

### Cards / Containers

BookCard combines a rounded 4:5 colored ground, contained listing photograph, condition text, title, author and separately labelled prices. Cover padding is 26px then 16px at 600px. Metadata is unboxed. Hover lifts the image; title and view links underline. Held-state text is a cream strip, not a trust badge. Load/empty/error panels use the warm shelf ground and a concrete next action.

### Inputs / Fields

Search sits inside a paper shell with a transparent borderless inner field and an explicit label. Login uses outlined 50px fields; numeric price fields are at least 42px and sort is 44px. Mode and condition use native single-selection radios with explicit all choices. Labels and invalid-price explanation remain visible; focus and caret use the wine identity. Preserve entered values on errors.

### Navigation

Wine shell, cream links, underline for desktop hover/current page. Narrow menus expand beneath the header, close on navigation/Escape and return focus on Escape. The skip link appears on focus. The logo displays windows onto the exact original PNG for owl and lettering, including on mobile; it is not redrawn.

### Condition labels and confirmation

Detail condition/mode labels are descriptive, softly filled rectangles rather than verification. ConfirmDialog uses a paper surface, readable task explanation, wine confirmation and outlined cancel, with modal backdrop and a narrow stacked action layout. Purchase wording explains a 24-hour reservation/chat without payment; visual styling must not turn that into a purchase-success promise.

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
