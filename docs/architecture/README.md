# Architecture

The platform is a modular monolith. This keeps deployment and transactions simple while enforcing module boundaries that can be split later if needed.

## Boundaries

- Mobile apps serve Member workflows.
- The web console serves Staff, Admin, and authorized Test Operator workflows.
- The API owns authorization, business state, transaction integrity, and audit records.
- PostgreSQL is the source of truth.
- Redis stores queue state and short-lived coordination data, never authoritative balances.
- MinIO stores uploaded images and evidence; PostgreSQL stores metadata and access rules.
- Payment and carrier simulators implement adapters behind the same boundaries expected for external providers.

## Backend modules

```text
auth users catalog listings orders exchanges wallet shipments
disputes reviews community notifications administration audit
```

Modules may read other modules through explicit services and events. They must not update another module's tables through ad-hoc repository access.

## Client architecture

Flutter follows View, ViewModel, Repository, and Service separation. React Native groups routes in `src/app` and feature code outside the route directory. Both clients treat server state separately from local interface state.
