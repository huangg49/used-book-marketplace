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
