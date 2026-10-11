# ADR 0033: Contextual catalog classification and search facets

Date: 2026-10-11. Status: implemented locally on
`codex/catalog-contextual-filters`; owner-approved scope, human review pending.

## Context

Member Search previously filtered eight preview categories only. The owner
approved a broader category-dependent filter set, with the same values used
when posting books and reviewing catalog requests. This must support real
Mongo listings and old clients, rather than only filter a page of sample data.
Catalog metadata belongs to immutable revisions; copy condition/trade/prices
belong to listing revisions. Those boundaries and public eligibility remain.

## Decision

- Versioned vocabulary `catalog-v1` in the shared api-contract package, exposed
  through public read-only `GET /catalog/taxonomy`. Stable codes, Vietnamese
  labels,11 root categories/29 nodes,16 controlled facet types. The release
  controls the vocabulary; there is no Admin CRUD vocabulary API in this scope.
- Add optional `categoryId`, `attributes` (controlled string-array fields) and
  `series` to catalog metadata/public books. Keep the existing category label
  and old requests valid. New classified requests use canonical label/id pairs.
  API rejects unknown keys/values, duplicate/empty arrays and incompatible
  contexts; commit-time catalog checks repeat classification validation.
- Category hierarchy is parent-inclusive. Values within one facet are OR;
  facets and common filters are AND. Language-learning category differs from
  edition language. Exam options depend on purpose+target language, grades on
  school stage. Series is optional for Manga/LN and exact NFC/case-insensitive.
- Apply catalog-revision lookup/match before keyset and limit in catalog and
  public listing reads. Normalize facet object/set order in cursor scope. Keep
  existing eligibility/permissions/session/idempotency behavior intact.
- Add migration0016 with frozen vocabulary literals, optional validator fields
  and a category index. No rewriting old migrations or confirmed revisions.
  Existing known category labels get read-time fallback when categoryId is
  missing; unknown labels stay readable without invented classification.
- Web Search and posting share classification fields. Existing confirmed-book
  picker reuses bookId instead of attempting a metadata mutation. Admin sees
  classification labels on the revision it reviews. Preview enrichment stays
  explicitly sample data and never seeds the live catalog.

## Consequences

Run the project's migration workflow before using new fields on an existing
database. It has run on isolated QA only, not the owner's main database.
Future vocabulary changes need compatible code/contract and a new migration;
do not mutate0016 or remove codes referenced by immutable revisions. Runtime
configurable vocabulary would require a separate decision, versioning strategy
and Admin permissions/workflows; this ADR does not grant them.

Legacy books can appear in category search but cannot match a specific facet
they do not possess. Classifying historical confirmed metadata requires an
authorized revision workflow, not an ad hoc backfill. Facet aggregation uses
joined catalog metadata; performance/load testing at production scale remains
open. The index does not imply every combination avoids joins/scans.

OpenAPI0.31.0/generated types and optional fields preserve old client inputs.
RN typecheck passes, but native behavior and every business flow were not
revalidated. [Feature/evidence](../design/CATALOG_CONTEXTUAL_FILTERS.md) records
selected checks and their limits; [READINESS](../handoff/READINESS.md) is unchanged.
