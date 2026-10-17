# ADR 0039: Three book circulation zones

17/10/2026. Owner request: the address selector represents areas through which
books circulate, with the names TP.HCM, Bình Dương and Vũng Tàu.

## Decision

Ordinary address forms and DirectDelivery use three project-defined operational
zones. These names replace the old demo A/B wording; they are not an official
administrative dataset, address geocoding, or managed handover-point records.
This accepted request supersedes the earlier TP.HCM-only address-selector wording
in ADR0014 and product context. SRS snapshots remain unchanged as history.

| Stable locality code | Display label |
| --- | --- |
| DEMO-A | TP.HCM |
| DEMO-B | Bình Dương |
| DEMO-C | Vũng Tàu |

Keep the existing `HCM-DEMO-v1` service-area code and its legacy `name: TP.HCM`
wire envelope for compatible clients. The selector displays API locality labels;
that envelope name is not a promise that a selected address is in one official
administrative boundary. New Mongo migration0030 updates reference labels and
adds DEMO-C atomically. Applied migrations/checksums stay frozen. Existing address,
listing-origin and order keys/snapshots are not rewritten or re-created.

Address owner/default/quota/version/replay checks remain in the command executor.
Addresses in all three zones can use the same existing DirectDelivery quote
policy. No distance computation, new shipping fee, real carrier coverage or
automatic inference from street text is introduced by this naming change.

The two simulated auction handover points and their custody/capacity/inspection
rules remain unchanged. Zones are not additional ViaPoint sites. READINESS and
post-F2h gates remain unchanged. Native form copy and native acceptance are outside
the Member web request; the compatible directory is shared by clients.

## Rollout and verification

Apply migration0030 using the existing migrator, without reset/reseed. Existing
processes need current source and migrations on restart. Test the upgrade from
the prior schema with an existing address, unchanged historical checksums and a
second migration run; verify all labels, save/replay and out-of-directory denial.
Browser QA verifies seller origin selection and a Bình Dương→Vũng Tàu quote/order
with the current amounts. Use only disposable QA databases for these tests.
