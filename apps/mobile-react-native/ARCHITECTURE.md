# React Native architecture

- `src/app` contains Expo Router routes only.
- `src/features/<feature>` contains API functions, components, hooks, schemas, and tests for one user-facing feature.
- `src/core` contains API transport, secure token storage, session management, and error mapping.
- TanStack Query owns server state. Zustand is limited to local cross-screen state that does not belong on the server.
- Zod validates external data at application boundaries.
- The API remains authoritative for permissions and business state.
