# ADR 0022: Private packaging images belong to the accepted Order

Accepted 2026-09-28 · OpenAPI 0.17.0. Follows [ADR 0021](0021-order-preparation.md),
[ADR 0008](0008-free-private-media-storage.md), SRS FR-O06/FR-S02, BR-37, POL-25.
Implementation and verification: [report](../features/PACKAGING_EVIDENCE_REPORT.md).

Follow-up0.18.0: [ADR 0023](0023-direct-shipment-registration.md) pins Ready images
to one outbound label; later uploads cannot change its evidence membership. Carrier
events remain planned. The scope below records the original0.17.0 decision.

## Decision

Implement packaging images as an Order subresource before shipment registration.
Do not reuse listing photos, loosen Reserved listing editing, or attach evidence
to listing-media cleanup. `OrderPackagingEvidence` has a restricted FK to the
immutable accepted preparation, immutable input length/MIME/SHA-256, retained byte
reservation and separate create/upload receipt references. No generic file URL or
object key is accepted from a client. No changes to Order/commitment versions,
deadlines, ledger, custody or listing state are made by an evidence command.

Only the verified MEMBER Seller creates/submits packaging images on Preparing or
ResolutionPending. LOCKED/RESTRICTED Sellers can meet their existing obligations;
this does not authorize a new payment. Both verified MEMBER participants may list
metadata and read submitted previews. Staff/Admin roles do not grant evidence
access: assignment-based investigation and original download remain future work.
The original is retained privately; there is no public URL or original-download API.

## Upload protocol and bounded execution

1. `POST /orders/{orderId}/packaging-evidence` uses an idempotency key and current
   expected Order version. Reserve storage and persist Pending + receipt/audit/outbox
   atomically under the existing command executor. Storage availability is irrelevant
   to reservation/replay. The receipt's version belongs to the evidence, not the Order.
2. Authenticated `PUT .../{evidenceId}/content` sends the exact binary image with a
   new, stable command key. Bearer authentication plus ownership is sufficient; this
   endpoint does not issue a separate upload ticket. It accepts only the previously
   declared MIME, length and hash. At most 10,000,000 bytes, JPEG/PNG/WebP, one frame,
   40MP decoded input. Reuse the real Sharp decoder from listing media, strip preview
   metadata, preserve aspect, no retouching, maximum 1600px and 2MB output.
3. For this bounded demo slice, normalize during the upload request. This is an
   intentional difference from asynchronous listing processing: there is no queue,
   background job or `Processing` state for packaging. The two-upload permit is
   **shared** across listing and packaging within each API process. Stream timeout
   120 seconds, Sharp timeout 20 seconds, provider calls bounded by the existing
   adapter. Recheck request deadline before acknowledging; client failure requires
   retrying the same bytes/key. A process crash leaves a durable Pending intent.
4. Outside DB transactions, write two create-only deterministic keys:
   `order-evidence/{id}/original` and `order-evidence/{id}/preview-v1.webp`. Provider
   retry reconciles exact bytes and never overwrites. The preview recipe is pinned
   by its key version; a future recipe/library change must preserve retry compatibility
   or introduce explicit migration/versioning, never overwrite an existing preview.
5. Re-lock sorted participants/session, context, Order and evidence; recheck current
   ownership, account/role/session and allowed Order state. Use decision time after
   locks. Atomically acknowledge Ready version2 + upload receipt + audit + outbox.
   Once Ready, neither bytes nor metadata can be edited or deleted through SQL/API.
   Same-key replay still checks current permission but requires no provider call.

Network calls hold no DB locks. A failed write, crash, revoked session or failed
audit after remote success may leave private objects with a Pending intent. Their
reservation stays charged. Retry repairs the acknowledgement; no auto-refund of
storage space and no silent evidence deletion. Invalid images return422 before
writing objects; their immutable intents remain Pending, and a different image
needs a new intent. List metadata allows recovering an existing intent by hash;
same Order/hash under a different key returns409.

## Capacity, retention and reads

- Shared 800MB default budget across listing and packaging; same PostgreSQL advisory
  lock serializes admission across users/processes. Listing uploads include packaging
  bytes in their calculation. Reserve original bytes + 2MB preview for each intent,
  conservatively keep that reservation after success. Do not infer unused provider
  capacity from this budget: other bucket objects/egress remain outside its accounting.
- Twenty intents/hour/uploader across listing and packaging. At most32 retained
  packaging intents/Order, including invalid/incomplete attempts. This is a demo
  resource policy, not a SRS claim-file cap or proof of adequate production capacity.
  At the limit, admission fails closed; retry an existing valid Pending intent.
- No packaging purge/reclamation job. Retain original, preview and metadata for the
  project lifecycle, conservatively exceeding POL-25's minimum365days after closure;
  future cleanup requires closure/legal-hold handling and auditable deletion. Listing
  cleanup cannot see this table/prefix. Finite free storage can fill; do not promise
  that waiting will free a retained evidence slot.
- List is bounded32 and never returns storage keys. Ready preview URL lasts120seconds.
  Check participant access before and after signing; record successful issuance by
  actor, Order context, evidence ID and request ID. This logs issuance, not every CDN
  fetch with an already-issued bearer URL. No signed URLs or original bytes in audit.
  Previously issued URLs survive until expiry. Backup must include private objects
  and their UUID mapping, not only a PostgreSQL dump.

## Meaning and remaining gate

`uploadedAt` is server acknowledgement time, not capture time or proof of timely
pickup. Late evidence is accepted for an existing ResolutionPending obligation and
cannot remove its review, restart its deadline, credit/refund money or release stock.
Ready means validated file ingestion, not verified genuine goods or truthful photo.

This increment intentionally precedes shipment registration and carrier simulation.
Those, independent custody decisions, original evidence access, dispute files (PDF/
video), post-acceptance cancellation, settlement and React Native upload UI remain
planned. Checkout remains closed until the required transaction chain is complete.
