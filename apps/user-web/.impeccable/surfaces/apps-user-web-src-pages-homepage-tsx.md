---
version: 1
slug: "apps-user-web-src-pages-homepage-tsx"
primary_target: "apps/user-web/src/pages/HomePage.tsx"
related_targets: ["apps/user-web/src/pages/HomePage.module.css", "apps/user-web/src/components/BookCard.tsx", "apps/user-web/src/components/BookCard.module.css"]
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

STORY: Four direct links for buying, exchange, budget and posting. Explore actual
categories in the currently loaded shelf; switch server-backed buy/exchange/price
groups; show more locally loaded copies; open the full catalog with supported
filters. Two budget banners lead to Sale max50000/100000. A separate exchange
shelf and posting CTA continue the journey. No new API/session/backend behavior.

FIRST VIEWPORT: Approved hero JSX/assets/motion/search/layout unchanged. Below:
four unboxed quick links, category section, new-listing shelf with four pressed
filter buttons, up to eight compact BookCards in four desktop columns. Budget
banner pair follows, then mint exchange section with a left introduction and
four compact cards, then wine posting band. Content max1200px, desktop outer40px,
section padding28px/gaps24–32px. <=850px navigation/cards become two columns,
banner pair stacks; <=600px outer16px and sections20px16px. Enlarged text wraps
and the document grows naturally. Shared Search/Detail cards retain default size.

FORM: Owner-pinned extension to the existing surface, no seed required. Main
shelf requests latest24 with server mode/maxSalePrice filters; shows8 then adds8
per click. Categories derive verbatim from that response; no category endpoint
exists. Category filtering is local to those24 and is explicitly labeled; the
full-catalog link omits category and says it searches all books. Group changes
clear category/reset visible8. Loading/empty/error/retry and pending flags remain
truthful; request failures hide stale cards. Listing cards never use decorative
covers as fallback. Banner covers are reused owner-supplied illustrations with
a visible illustration/price disclaimer. All buttons/links keyboard-operable;
no additional continuous animation. No invented discounts or totals.

FINISH: Bounded desktop/mobile/large-text/state evidence, one final detector,
fresh independent finish reviewer and canonical documentation; local commit
only. API-real/native/human acceptance not implied by response-fixture captures.
