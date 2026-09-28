# ADR 0008: Free private media storage and bounded API uploads

Date: 2026-09-26. Accepted: Supabase Storage Free + Sharp. Implementation evidence
and passed live-storage/pending native checks: [media report](../features/MEDIA_UPLOAD_REPORT.md).

Follow-up 0.17.0: [ADR 0022](0022-order-packaging-evidence.md) adds packaging images
in a separate retained table/prefix using this adapter. Budget, hourly admission
and two API upload slots now account for both pipelines. The listing worker/cleanup
described below remains listing-only; do not apply it to evidence originals.

Live validation on 2026-09-26 passed with a server secret: browser upload through
NestJS, separate worker conversion, private signed read and draft persistence.
Use the project origin without `/rest/v1/`; the bucket limit must be exactly
10,000,000 bytes or lower, not the dashboard's 10 MiB (10,485,760 bytes).

## Decision

Use a dedicated Supabase Free project/private bucket for listing images. Keep
NestJS authorization, existing PostgreSQL/Prisma business data and current session
owner. Do not introduce Supabase Auth or a second client token store. Supabase
Storage is separate from where the business database is hosted.

MinIO is no longer the default storage target. Its old Compose service is behind
`legacy-minio`; existing volumes and historical business documents are preserved.
AWS S3 and Cloudinary were discussed, but neither is a project dependency.

The hard constraint is zero service fees for the current demo. Supabase Free
currently includes 1 GB storage, 5 GB egress and 5 GB cached egress; it can restrict
service above quota and pause inactive projects. This is not unlimited hosting or
an uptime guarantee. API, worker and DB can run on the team's existing computer.
See [pricing](https://supabase.com/pricing) and
[cost control](https://supabase.com/docs/guides/platform/cost-control).

## Upload and immutability

OpenAPI 0.5 replaces the planned MinIO presigned POST with authenticated binary
PUT through NestJS. This deliberately spends API bandwidth for stricter admission
control at demo scale. The 600-second upload token is bound to actor, session and
media ID; bearer authentication is still required. No storage credential reaches RN.

The API streams at most the declared bytes (maximum 10,000,000), verifies SHA-256
and declared MIME, then writes a create-only server-owned input key. It rechecks
account/session/ownership/state in the acknowledgement transaction after network
I/O. A changed account can leave an orphan object, never an authorized receipt;
the original reservation remains until successful deletion. Finalize requires the
acknowledged pinned key and atomically creates Processing + durable job + receipt
+ audit. No storage operation runs inside a business DB transaction.

Create/upload/finalize receipts use the shared command protocol. Create can reserve
an intent while storage is unavailable; replay does not depend on storage uptime.
Binary retries must send identical bytes and use the same command key. If an intent
expires or processing fails, select a new image/intent; do not mutate accepted input.

The worker checks the stored input hash/length again, decodes JPEG/PNG/WebP, rejects
multiple frames and >40 million pixels, normalizes orientation, strips metadata,
and produces WebP fitting 1600×1600 without cropping/upscaling. Output is capped at
2 MB. No retouching, authenticity label or synthetic content is introduced.

Supabase lacks S3 versioning. Immutability is enforced by server-owned keys,
create-only writes and database guards; it is not WORM protection from a project
administrator. Each worker attempt gets a separate derivative key. This prevents
a late worker from overwriting the chosen Ready derivative. Input is never served
to a member. Owner read issues a 120-second signed URL after authorization and
rechecks after signing; previously issued URLs remain valid until expiry.

## Resource and recovery boundaries

- 8 Pending/Processing and 80 retained images per listing; 20 intents/hour/actor.
- Two incoming binary uploads per API process, each bounded to 120 seconds.
  This is a per-process memory guard, not a distributed global connection limit.
- A transaction advisory lock serializes global byte reservations. Default cap
  800 MB; reserve input + 6 MB for three possible outputs. On successful processing,
  reserve input + actual final output + 2 MB per earlier attempt. No existing object
  outside this dedicated bucket/workflow is included; do not share the bucket.
- This is a storage reservation, not an egress meter. The Free plan is the billing
  boundary; quota exhaustion may interrupt service. Monitor the provider dashboard.
- One worker process runs one job at a time. PostgreSQL leases last 60 seconds with
  15-second heartbeat; attempt fencing prevents stale workers committing results.
  Three attempts maximum; missing/failed storage retries with backoff.
- PostgreSQL application/seed/test connections explicitly use UTC. A real concurrency
  test found that local server timezone caused date parameters to shorten leases.
  The lease test checks remaining time against database `now()`, not only JS dates.
- Cleanup expires Pending intents and tombstones unreferenced assets after 24 hours
  plus a safety interval. It retains all revision references, including saved drafts.
  Deletion occurs outside the transaction; reservation releases only after success.
  Object deletion retries after crashes. Never use automatic deletion for dispute
  evidence without the separate retention policy; those workflows remain planned.

## Client and limits

RN `/drafts` uses the existing SessionClient and TanStack Query. Uploads retain
command keys/bytes in memory across retries and reconcile server state. Upload
requests use only the selected Uint8Array view's bytes, including non-zero offsets;
binary retries after session refresh preserve body, content type and upload ticket.
Regression and quality evidence: [Android quality](../ANDROID_QUALITY.md).
Processing
polls only while foreground/focused; signed previews refresh before expiry.
Selecting/uploading does not itself save the revision's image selection: the member
must save the draft. Lost local attempts after app termination require selecting
the image again; acknowledged assets remain visible in the draft's media list.

This increment covers private drafts/media only. Submission, moderation and
operations image access subsequently landed under [ADR 0009](0009-listing-submission-moderation.md).
Public shelf/media subsequently landed under [ADR 0011](0011-public-shelf.md),
with separate eligibility-checked signed reads. Handover evidence and auctions remain planned.
