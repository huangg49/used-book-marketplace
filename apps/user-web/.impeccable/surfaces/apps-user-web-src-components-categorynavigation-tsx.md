# Member category navigation

Mode: Operate. Ordinary extension of the existing wine/cream Header; owner approved
a category disclosure beside the logo while keeping the separate Tìm sách link.
Primary target: apps/user-web/src/components/CategoryNavigation.tsx.
Related: CategoryNavigation.module.css, Header.tsx, MainLayout.module.css.

## Direction contract

THESIS: Browse by a known shelf before searching; the menu is a legible directory,
not another campaign or set of illustrated cards.

OWN-WORLD: Existing wine navbar and original logo; cream paper directory with wine
links, existing Be Vietnam Pro, thin rules, one soft offset shadow. Lucide four-square
icon and chevron; no new raster, typography or global token.

STORY: Click Danh mục, choose a shared category or child, arrive at /books with the
selected categoryId visible in its filter and URL. Manual Tìm sách stays unchanged.
All links use shared catalog-v1 vocabulary; no facet shortcuts or invented categories.

FIRST VIEWPORT: Keep the 76px Header/64px floating recipe and hero. Logo and 44px
category trigger share the left cluster. Directory below Header spans at most 1200px,
three readable columns and an all-books action. Mobile uses a disclosure within
the existing menu, with full-length labels and scroll bounded to the viewport.

FORM: Code-led ordinary extension, owner-pinned directory/disclosure; no concept
roll or decision comp. Signature interaction: click expands the cream directory;
Escape restores trigger focus, outside click/Tab exit/route change close it. Motion
is finite and respects reduced motion without altering the existing navbar morph.

FINISH: Independent source/six-capture finish review returned SHIP after replacing
the stale-size desktop capture; no material scoped fixes remained at that pass.
Documenter then found missing local hover/current color bindings; they were bound
to existing values, rebuilt and browser-checked. Narrow follow-up scored that fix
resolved/SHIP; the original full-review disposition remains, without a new broad review.
DESIGN.md Navigation and schema-v2 sidecar record the built category recipe and
source bindings, retaining the incumbent world and token primitives. No shipping
raster was added; six original CUA JPEG captures are review evidence.

## Built recipe and evidence

The directory reads catalog-v1's 11 parents and 18 children. Its fresh categoryId
URL retains only explicit data=live/preview and clears prior search/filter criteria.
Header's ref/location.key effect returns same-tab arrivals to scroll0 and focuses
Search's tabIndex−1 heading; modifier clicks keep native Link behavior. The desktop
three-column panel scrolls within calc(100dvh - 120px); compact1001–1279px shows
icons only. At1000px and below, native details exposes vertical full-length labels
inside the existing bounded mobile menu. Existing wine-hover/shelf values bind
locally on both category wrappers. Panel entry180ms and trigger/chevron transitions
respect reduced motion, independent from the existing Header morph exception.

Parent-reported build including TypeScript/34unit PASS, lint0errors/5existing
warnings, diff check PASS; one detector pass returned []. Guest IAB configured at
1366×768,1535×735,1024×700,390×844 and320×700; parent viewed all six settled captures
including Japanese category arrival. Evidence at
`.impeccable/review/navbar-categories/{desktop,user-1535,compact-1024,mobile-390,mobile-320,selected-japanese}.jpg`.
Actual raster sizes respectively1351×760,1520×728,1009×690,375×812,305×667,1351×760;
the content capture crops browser/scrollbar area. Initial .png labels were renamed
to .jpg without changing bytes after review. All six paths were refreshed after
the binding fix and viewed by the parent; opened-trigger background resolved to
rgb(124,35,32), current Japanese link to rgb(244,237,223). No approved decision comp exists.

Authenticated/populated-live/200% zoom or text/native/human acceptance NOT RUN.
READINESS unchanged.
