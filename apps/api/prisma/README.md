# Read-only PostgreSQL history

`schema.prisma` and the 17 numbered SQL migrations preserve the source schema for
the PostgreSQL → MongoDB import and its regression tests. Do not edit applied
migrations or generate a Prisma client for the current application.

API and workers use `src/database/mongo/`. Add new database changes there.
For importing existing data, follow the
[cutover runbook](../../../docs/refactor/MIG06_CUTOVER_RUNBOOK.md).
