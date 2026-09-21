# API

NestJS modular monolith shared by every client. The API owns permissions, state transitions, reservations, wallet holds, settlement, dispute decisions, idempotency, and audit records.

```bash
cp .env.example .env
pnpm start:dev
```

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/api/v1/health`

Add modules under `src/modules/<business-area>`. Keep cross-module changes behind explicit services or events and use database transactions for business operations that must commit atomically.
