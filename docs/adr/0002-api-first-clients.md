# ADR 0002: API-first client development

**Status:** Accepted

## Decision

Flutter, React Native, and the operations web consume one versioned REST API described by OpenAPI.

## Rationale

The two course applications must demonstrate their respective frameworks without duplicating business rules. A reviewed contract lets teams work concurrently and makes parity testable.

## Consequences

The API remains authoritative. Client-only checks are usability features. Contract changes land before dependent client changes, and CI checks the OpenAPI document.
