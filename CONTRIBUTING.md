# Contributing

## Before coding

For AI-assisted work, start with [AGENTS](AGENTS.md) and the
[shared workflow](docs/AI_WORKFLOW.md). Repo skills provide task-specific guidance;
each contributor still owns the result and its evidence.

1. Select or create an issue with acceptance criteria.
2. Confirm the affected API contract and business rule.
3. Create a short-lived branch from the latest `main`.

## Pull requests

- Keep one business change per pull request.
- Link the issue and SRS requirement IDs such as `FR-X04`.
- Include tests for authorization, invalid states, duplicate requests, and concurrency when the change affects transactions.
- Update `packages/api-contract/openapi.yaml` before changing a client integration.
- Never commit credentials, personal data, generated secrets, or production evidence.
- Require at least one reviewer who did not author the change.

## Commit style

Use Conventional Commits:

```text
feat(exchange): validate proposal revision on acceptance
fix(wallet): keep withdrawal funds held after unknown payout result
docs(api): document listing moderation response
```

## Definition of done

- Acceptance criteria pass.
- Lint, type checks, and relevant tests pass.
- API and mobile error states are handled.
- Audit and idempotency behavior is covered where required.
- Documentation and diagrams match the final behavior.
