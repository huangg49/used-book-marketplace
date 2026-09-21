# ADR 0001: Modular monolith

**Status:** Accepted

## Decision

Implement one NestJS application divided into business modules and deploy it as one service for the project scope.

## Rationale

Orders, exchanges, wallet holds, disputes, and settlement need consistent transactions. A modular monolith gives the team clear ownership without the operational cost and failure modes of microservices.

## Consequences

Module boundaries and tests are mandatory. PostgreSQL transactions can cover critical changes. Background workers remain separate processes built from the same codebase when deployment requires it.
