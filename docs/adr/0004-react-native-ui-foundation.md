# ADR 0004: React Native UI foundation

Status: implemented for the first React Native UI increment, 2026-09-25.
Native device accessibility and keyboard validation remain release prerequisites.

## Decision

Consolidate the auth controls and brand screen-study primitives under
`apps/mobile-react-native/src/core/ui`. Brand 1.1 palette is the source; React
Native semantic roles, typography and layout tokens live in the UI theme. Load
fonts once through BrandProvider under SafeAreaProvider. Auth/profile, the three
marketplace study screens and the opt-in component catalog use this implementation.

Keep UI app-local until another React Native consumer exists. The shared brand
package remains platform-neutral; existing Flutter/web token adapters are not
silently migrated. No component owns a session, transport, server cache or business
permission. Fixtures stay in review features, not in the UI library.

Feedback is explicit and local: field errors, notices, content states, sheets and
confirmation dialogs. A typed presenter maps transport failures to allowlisted
copy. Feature owners decide retry/navigation, preserve data and close dialogs only
after success. No global toast bus or automatic mutation retry is introduced.

## Enforcement and validation

ESLint rejects direct Text/TextInput/Button/Modal imports and hex/rgb color
literals in routes/features. Contrast tests cover actual foreground/background
combinations. Error presenter tests prevent exception-message leakage and preserve
different recovery paths for invalid login, session expiry, permission denial and
throttling. These checks do not assess aesthetics or certify native accessibility.

`/ui` and `/design` require `EXPO_PUBLIC_DESIGN_PREVIEW=1`; the normal auth route
does not. The flag is build-time presentation gating, not a security boundary or
asset tree-shaking guarantee. CI watches brand dependencies and exports normal
all-platform bundles plus an opt-in web review build.
Export scripts clear Metro's cache so switching the build-time flag cannot reuse
a client bundle with the previous value. Run exports with different flags sequentially.

## Consequences

UI changes affect several consumers, so update the catalog and inspect representative
screens. The old `core/ui.tsx` is a facade; compatibility aliases have one implementation.
The auth UI now uses brand fonts, original logo and field-level required errors;
session/transport behavior and the API contract are unchanged. Input retention is
screen-local; the marketplace study still has no persistent drafts or backend workflow.

Before release, validate Android/iOS safe areas, keyboard, back navigation, image
picker, screen-reader announcements, modal focus and large text on actual native
runtimes. Exported JS/Hermes bundles are not native build evidence.

## Mobile experience correction — 2026-09-28

User review found the existing screens too document-like and filter submission
too far down a scrolling form. Add an optional fixed Sheet footer, keyboard
avoidance and a compact ActionRow; examples live in `/ui`. Filter edits are staged
separately from applied/search state. A feature-owned member navigation bar uses
existing Expo routes and existing session guards; it is absent from dirty editors.
Shelf cards use two columns, falling back to one below 360 px or at font scale 1.3.
Keep brand tokens and real data; no new workflow, persistence or auth policy.
Evidence and remaining limitations: [mobile experience](../handoff/MOBILE_EXPERIENCE.md).

## Shelf/detail review — 2026-09-28

Extract feature-local ShelfGrid, BookPresentation and BookGallery so actual API
screens and explicitly labelled review fixtures share presentation. Fetching,
signed-image expiry, permissions and mutations remain with the real screen owners.
Fixtures use existing attributed archival images and never seed public listings.
`/showcase` and `/showcase-book` allow `__DEV__` or the existing preview flag;
normal exports redirect to the real shelf. They have no product-navigation entry.
The existing `/ui` and `/design` flag requirement is unchanged. This is presentation
gating, not a security boundary or an asset exclusion guarantee.
Shelf cards accept Android's float rounding at OS 130% using a 1.29 threshold.
Evidence, entry points and pending acceptance: [shelf/detail review](../handoff/SHELF_DETAIL_REVIEW.md).
