import type { ExchangeDoc } from '../../database/mongo/documents.js';

export const EXCHANGE_INSPECTION_MS = 72 * 3_600_000;

export function hasExchangeDispute(exchange: ExchangeDoc) {
  return Boolean(
    exchange.disputedAt || exchange.disputedBy || exchange.disputeReason,
  );
}

// Legacy carrier callbacks only stored receivedAt/common deadline. Derive the
// same participant deadlines on reads and decisions without trusting that common
// deadline to shorten either participant's POL-08 window.
export function inspectionDeadlines(exchange: ExchangeDoc) {
  if (
    ['Completed', 'Cancelled'].includes(exchange.status) &&
    !exchange.initiatorInspectionDeadline &&
    !exchange.recipientInspectionDeadline
  ) {
    return {
      initiator: null,
      recipient: null,
      all: exchange.inspectionDeadline,
    };
  }
  const deadline = (received: Date | null, pinned?: Date | null) => {
    if (!received) return null;
    return (
      pinned ??
      new Date(
        Math.max(
          received.getTime() + EXCHANGE_INSPECTION_MS,
          exchange.inspectionDeadline?.getTime() ?? 0,
        ),
      )
    );
  };
  const initiator = deadline(
    exchange.initiatorReceivedAt,
    exchange.initiatorInspectionDeadline,
  );
  const recipient = deadline(
    exchange.recipientReceivedAt,
    exchange.recipientInspectionDeadline,
  );
  const all =
    initiator && recipient
      ? new Date(Math.max(initiator.getTime(), recipient.getTime()))
      : null;
  return { initiator, recipient, all };
}

export function inspectionMaySettle(exchange: ExchangeDoc, now: Date) {
  const { all } = inspectionDeadlines(exchange);
  return (
    exchange.status === 'Delivered' &&
    !hasExchangeDispute(exchange) &&
    all !== null &&
    now >= all
  );
}

// Candidate discovery uses the same legacy fallback as commit-time decisions;
// stale common deadlines must not fill a bounded batch with ineligible rows.
export const participantInspectionDeadlineExpression = (
  side: 'initiator' | 'recipient',
) => ({
  $cond: [
    { $ne: [`$${side}ReceivedAt`, null] },
    {
      $ifNull: [
        `$${side}InspectionDeadline`,
        {
          $max: [
            { $add: [`$${side}ReceivedAt`, EXCHANGE_INSPECTION_MS] },
            '$inspectionDeadline',
          ],
        },
      ],
    },
    null,
  ],
});
export function dueExchangeInspections(now: Date) {
  return {
    status: 'Delivered' as const,
    initiatorReceivedAt: { $ne: null },
    recipientReceivedAt: { $ne: null },
    disputedAt: null,
    disputedBy: null,
    disputeReason: null,
    $expr: {
      $lte: [
        {
          $max: [
            participantInspectionDeadlineExpression('initiator'),
            participantInspectionDeadlineExpression('recipient'),
          ],
        },
        now,
      ],
    },
  };
}
