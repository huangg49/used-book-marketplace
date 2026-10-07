import { createHash } from 'node:crypto';

// Idempotency key of a worker step on an aggregate version. A system receipt
// is keyed by (systemActor, operation, key); keying by the aggregate id alone
// would replay the first deadline when the same Order reaches a second one
// (for example after an Admin reopened collection). Deterministic, so a crashed
// sweep retried on the same version replays instead of acting twice.
export function stepKey(id: string, version: number) {
  const h = createHash('sha256').update(`${id}:${version}`).digest('hex');
  const variant = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
