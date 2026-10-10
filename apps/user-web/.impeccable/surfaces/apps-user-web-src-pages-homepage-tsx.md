---
version: 1
slug: "apps-user-web-src-pages-homepage-tsx"
primary_target: "apps/user-web/src/pages/HomePage.tsx"
related_targets: ["apps/user-web/src/pages/HomePage.module.css", "apps/user-web/src/components/BookCard.tsx", "apps/user-web/src/components/BookCard.module.css", "apps/user-web/src/components/HomeBookCard.tsx", "apps/user-web/src/services/home-shelves.ts"]
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
heads and task text, Anton only for the budget/exchange/posting display moments.
Complete actual listing photographs and unboxed metadata stay authoritative.

STORY: Four colored penguin shortcut tiles for buying, exchange, budget and posting. Explore actual
categories in the currently loaded shelf; switch server-backed buy/exchange/price
groups; show more locally loaded copies; open the full catalog with supported
filters. Two budget banners lead to Sale max50000/100000. A separate exchange
shelf and posting CTA continue the journey. No new API/session/backend behavior.

FIRST VIEWPORT: Approved hero JSX/assets/motion/search/layout unchanged. Below:
four colored penguin shortcut tiles, category section, new-listing shelf with four pressed
filter buttons, up to ten compact BookCards in five laptop/six wide-desktop columns. Budget
banner pair follows, then mint exchange section with a left introduction and
four compact cards, then wine posting band. Content max1200px, desktop outer40px,
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
no additional continuous animation. No invented discounts or totals.

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

Preview notice and each card label illustrative price/condition/mode; no fake
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

## Owner-approved penguin shortcut tiles — 10/10/2026

Owner-approved Home shortcuts use four full clickable colored tiles in buy/exchange/budget/post order. Grounds reuse cover palette #f0e2ca/#d9e7dc/#f6d4bd/#e6dced with wine text. Original generated penguin illustrations at public/illustrations/penguins are decorative (empty alt),72px desktop/56px mobile. Tile minimum112px/padding16px,12px corners,14px bold wrapping labels and16px arrows; four columns with16px gaps, two columns at1000px. At600px tiles stack image above label/arrow, minimum132px/padding12px/gap12px. Transparent1px border reserves hover space; fine-pointer hover lifts2px and shows wine border over200ms, focus wine3px/offset3px, reduced motion removes lift/transition. No shadow, nested badge, subtitle, new action or altered URL/session semantics. Images256px PNG preserve alpha; four together202026bytes. Penguin is supporting illustration, existing owl logo remains.

The owner explicitly approves four colored clickable boxes and the cute penguin
family from the generated sample. This overrides the earlier unboxed-link
recipe. Code-led local extension; no new identity roll/comp or replacement logo.
Finish: desktop/mobile/narrow captures, keyboard focus and four navigation
checks; generated image provenance/alpha, build/lint, independent review.
