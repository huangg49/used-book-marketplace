# React Native member application

Expo and React Native implementation for the mobile-development course. It consumes the same API and acceptance criteria as the Flutter application while retaining idiomatic React Native architecture.

```bash
cp .env.example .env
pnpm start
```

See [ARCHITECTURE.md](ARCHITECTURE.md) before adding features.

## Internal read-only wallet

Set `EXPO_PUBLIC_INTERNAL_MEMBER_VIEWS=1` before starting Expo to show **Ví của bạn**
under `/account` and enable `/wallet` for Members. Restart Metro with `--clear`
when changing the flag; it is bundled at build time. The default is hidden.
This flag controls visibility only: the API still owns permission, including
LOCKED Members' existing access. Use your own configured API and isolated QA data.

The screen reads `/me/wallet` and cursor-based `/me/wallet/history`. It labels
simulated money, uses server balances and the shared session, and offers refresh
and pagination only. It does not implement topup, withdrawal, checkout or
settlement. C01/C02 internal development is allowed by the dated exception in
[the continuation plan](../../docs/handoff/CONTINUATION_PLAN.md); M1 and release
gates remain open. See [C01 evidence](../../docs/handoff/C01_WALLET_2026_09_30.md).

Start with [the team guide](../../docs/REACT_NATIVE_START.md) for database/seed setup,
demo login, phone/emulator networking and tests. Login and account screens use the
shared API contract. Native refresh tokens use SecureStore; access tokens stay in memory.

## Listings, photos and submission

Approved listings now offer edit/resubmit and hide/reopen; nonremoved Available
listings can be archived with confirmation. See [lifecycle behavior and verification](../../docs/features/LISTING_LIFECYCLE_REPORT.md).

`/` opens the real public shelf without login. Search/filter/paging leads to
`/book?id=<uuid>`; `/account` opens login/profile. See [public shelf verification](../../docs/features/PUBLIC_SHELF_REPORT.md).
From the root, `pnpm test:public:browser` runs the RN web export against an isolated
real API/DB fixture after building/exporting with the report's test settings.

Account → **Sách của tôi** uses real APIs for catalog selection/requests, photos,
condition/prices, save/submit and rejection/resubmission. Run the separate media worker and configure
[Supabase Free](../../docs/features/SUPABASE_MEDIA_SETUP.md) on the API server.
See the [RN submission report](../../docs/features/RN_LISTING_SUBMISSION_REPORT.md)
and [media report](../../docs/features/MEDIA_UPLOAD_REPORT.md) for the distinction
between automated storage tests, passed live-provider/browser QA and pending native checks.

## Brand screen study (opt-in)

The interactive `/design` route studies discovery, listing details and publishing
with local sample data. See [the screen study and verification](../../docs/design/SCREEN_STUDY.md).
In PowerShell, set `$env:EXPO_PUBLIC_DESIGN_PREVIEW = '1'` before starting Expo,
then open `/design` on the web preview. Restart Expo without that flag to return
to the normal configuration. This preview does not create listings or transactions.

## Shared UI foundation

Local environment preflight: `pnpm doctor:local` from the repository root.
Native debug build: `pnpm build:android --emulator` for an x86_64 Android emulator.
See [Android quality and setup](../../docs/ANDROID_QUALITY.md).

Open `/ui` with the same flag for the interactive component catalog. Auth/profile
and `/design` now reuse `src/core/ui` and the bundled brand fonts. Read
[UI coding rules](../../docs/design/UI_CODING_RULES.md) and
[component usage](../../docs/design/UI_COMPONENTS.md) before writing a new screen.
Lint rejects direct native Text/TextInput/Button/Modal imports and literal colors
in features/routes. The library is ready for implementation review; native keyboard,
safe-area and assistive-technology validation are still required before release.

Account links to /addresses for the private address book. Apply the current MongoDB
migrations using [START_HERE](../../docs/handoff/START_HERE.md); the
[address-book report](../../docs/features/ADDRESS_BOOK_REPORT.md) records its original
milestone. DEMO-A/B are simulated areas, not official wards or delivery points.
Current native gates are in [READINESS](../../docs/handoff/READINESS.md).

Listing forms now select a private delivery origin and DirectDelivery preference.
Use the current MongoDB runtime and OpenAPI contract from START_HERE. Changed/deleted addresses
require explicit reselection; approved replacements still need review. Public detail
only shows safe region/method information. See [fulfillment evidence](../../docs/features/LISTING_FULFILLMENT_REPORT.md).
