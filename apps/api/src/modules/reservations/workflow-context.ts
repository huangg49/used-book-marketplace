import type {
  AuctionIntakeContextDoc,
  PointOrderContextDoc,
  WorkflowContextDoc,
} from '../../database/mongo/documents.js';

type Stored =
  WorkflowContextDoc | AuctionIntakeContextDoc | PointOrderContextDoc;

// workflow_contexts holds Order and AuctionIntake contexts (migration 0008).
// Order code accepts only an Order context; anything else reads as absent.
export const orderContext = (c: Stored | null): WorkflowContextDoc | null =>
  c?.kind === 'Order' ? c : null;
export const intakeContext = (
  c: Stored | null,
): AuctionIntakeContextDoc | null => (c?.kind === 'AuctionIntake' ? c : null);
export const pointOrderContext = (
  c: Stored | null,
): PointOrderContextDoc | null => (c?.kind === 'PointOrder' ? c : null);
