# React Native architecture

- `src/app` contains Expo Router routes only.
- `src/features/<feature>` contains API functions, components, hooks, schemas, and tests for one user-facing feature.
- `src/core` contains API transport, secure token storage, session management, and error mapping.
- TanStack Query owns server state. Zustand is limited to local cross-screen state that does not belong on the server.
- Zod validates external data at application boundaries.
- The API remains authoritative for permissions and business state.

The implemented reference slice is `features/auth` and `features/account`.
`core/api/session-client.ts` re-exports `@used-books/session-client`, the shared
framework-independent transport that owns refresh coalescing,
recovery, retry and logout; it is exercised by unit tests. `SessionProvider`
clears query caches when the user changes. Native refresh tokens use SecureStore;
web preview uses memory only. API types are generated from the shared contract.
Add authenticated routes behind the session gate; never rely on UI role labels as authorization.

`features/design-preview` is an isolated, opt-in screen study with in-memory
fixtures and the shared brand 1.1 UI foundation. `/design` requires the build-time
`EXPO_PUBLIC_DESIGN_PREVIEW=1` flag; otherwise it redirects to `/`. It introduces
no marketplace transport or session owner. Do not reuse its fixture state as
server state or its simulated permissions as authorization. See
[scope and native validation still required](../../docs/design/SCREEN_STUDY.md).

`core/ui` owns the app-local design tokens, fonts, controls, content states and
overlays. `core/ui.tsx` is a facade to its public barrel. Auth/profile and the
screen study use the same controls. `/ui` is an opt-in interactive catalog, with
the same preview flag as `/design`. No shared component imports feature fixtures,
owns transport/session state or decides permissions. See
[ADR 0004](../../docs/adr/0004-react-native-ui-foundation.md) and the
[UI rules](../../docs/design/UI_CODING_RULES.md).
