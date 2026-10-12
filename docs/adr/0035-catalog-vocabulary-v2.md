# ADR 0035: Additive catalog vocabulary v2 and parent search contexts

Date: 2026-10-12. Status: implemented locally on `codex/catalog-expansion`;
owner-approved core phases1–5, human review pending.

## Context

The owner approved [the expansion plan](../design/CATALOG_EXPANSION_PLAN.md).
[ADR0033](0033-catalog-contextual-classification.md) established optional,
controlled classification on immutable catalog revisions. Its v1 vocabulary
does not cover several common book groups, and its exact-category metadata
rules cannot directly express a parent query across different exam systems.

## Decision

- Ship static shared `catalog-v2`:17 roots,55 children,72 stable category IDs,
  25 facet definitions and234 controlled options. Preserve every v1 code and
  canonical label. Contextual profiles constrain choices rather than turning
  each topic into another category. Runtime Admin vocabulary CRUD is deferred.
- Separate metadata and search contexts. Writes validate the exact category;
  parent searches merge descendant options, then build compatible exact-category
  branches. OR alternatives within each facet and AND across facets must coexist
  in the same branch. Unknown values or alternatives covered by no compatible
  branch are rejected, never silently ignored. For example, Japanese N3 and
  English TOEIC can share a language-parent search when purpose includes Exam;
  they cannot both be metadata on one edition.
- Keep purpose→exam and school-stage→grade dependencies declarative. Prune
  incompatible draft choices when context changes and announce the removal.
  Shared fields expose search within long facets, selected choices and disclosure.
- Include taxonomy version in normalized cursor scope and the web query key.
  Apply the existing eligibility and catalog-revision joins/filter before
  pagination. Preserve legacy-label fallback only for known labels. Missing
  attributes never invent facet matches.
- Add frozen migration0019 after0018, expanding only the existing catalog
  revision validator. No new index without load evidence, no live-registry import
  into the migration, no editing0016, backfill or confirmed-revision mutation.
  OpenAPI0.34.0 and generated types share the72-ID enum and25 facet enums.
- Home and Navbar discover the whole vocabulary; links preserve live/preview
  source. Detail links use live data and carry dependency values. Sell and Admin
  reuse the same metadata. RN parsers and rejected-request resubmission preserve
  classification; full native taxonomy UI remains separate work.

## Consequences and rollout

Run `pnpm db:migrate` before accepting v2 writes. On the owner's local database,
only0019 was pending and applied on12/10/2026; existing catalog data was not
rewritten. Restart the API with the current source. Other environments still
need migration through their normal deployment process.

Once v2 revisions exist, rolling back to a v1-only validator/client can reject
or hide them. Retain additive codes and use a forward compatible deployment;
do not narrow validators or reset the database as rollback.

The preview has118 sourced editions with illustrative classification/prices;
it is separate from the live catalog and does not claim all72 categories have
stock. Facet counts, historical reclassification, auction filtering, runtime
vocabulary management and full RN editing remain deferred. Joining contextual
metadata has production load implications; a21-record QA explain is diagnostic,
not a scale benchmark. [Verification and limitations](../../.impeccable/review/catalog-v2/README.md)
record local evidence. READINESS gates remain unchanged.
