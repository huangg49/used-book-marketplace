# Shared session transport

Framework-independent auth/session client used by React Native and operations web.
The implementation and 11 regression tests were extracted from RN without changing
token lifecycle behavior. Runtime schemas reference generated API-contract types.

Each application owns one instance and supplies its storage adapter. Native RN
persists only refresh tokens in SecureStore; browser adapters keep everything in
memory. No global token store, UI code or platform imports belong here.

Run `pnpm --filter @used-books/session-client test`. Both client typechecks validate
the package source; RN CI and operations CI run its regression suite. See ADRs
0003 and 0010 for rotation, logout, recovery and current limitations.
