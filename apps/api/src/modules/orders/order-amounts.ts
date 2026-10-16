import type { Collections } from '../../database/mongo/collections.js';
import type { Wire } from '../commands/domain-error.js';

// The accepted agreement is immutable. A sale quote remains the shipping/source
// snapshot and must not replace the price negotiated when the Order was made.
export async function orderAmounts(c: Collections, orderId: string) {
  const context = await c.workflow_contexts.findOne({ kind: 'Order', orderId });
  const agreement = context && await c.agreement_snapshots.findOne({ _id: context._id });
  return (agreement?.snapshot as { amounts?: Wire['DirectOrderAgreement']['amounts'] } | undefined)?.amounts;
}
