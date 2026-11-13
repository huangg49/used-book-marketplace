import { randomUUID } from 'node:crypto';
import type {
  ExchangeDoc,
  ExchangeReturnDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  invalidField,
  invalidState,
  type Wire,
} from '../commands/domain-error.js';

const HOUR = 3_600_000;
const STAFF_LIMIT = 300_000;
type Action = Wire['ExchangeReturnCommand']['action'];

export function oneSidedReturn(row: ExchangeDoc) {
  const sent = Boolean(row.initiatorShippedAt);
  // This decision covers one physical book per party. The recipient's own
  // acknowledgement is the evidence that the shipped copy reached them.
  if (
    sent === Boolean(row.recipientShippedAt) ||
    (row.initiatorListingIds?.length ?? 1) !== 1 ||
    !row.initiatorFundedAt ||
    !row.recipientFundedAt ||
    !row.shippingDeadline ||
    !row.disputedAt ||
    row.disputedAt < row.shippingDeadline ||
    (sent ? row.initiatorShippedAt! : row.recipientShippedAt!) >=
      row.shippingDeadline ||
    (sent ? row.recipientDeposit : row.initiatorDeposit) <= 0 ||
    !(sent ? row.recipientReceivedAt : row.initiatorReceivedAt) ||
    (sent ? row.initiatorReceivedAt : row.recipientReceivedAt)
  )
    return null;
  return {
    ownerId: sent ? row.initiatorId : row.recipientId,
    holderId: sent ? row.recipientId : row.initiatorId,
    listingId: sent ? row.initiatorListingId : row.recipientListingId,
    otherListingId: sent ? row.recipientListingId : row.initiatorListingId,
    ownerDeposit: sent ? row.initiatorDeposit : row.recipientDeposit,
    holderDeposit: sent ? row.recipientDeposit : row.initiatorDeposit,
    differenceAmount: row.diffAmount,
    differencePayerId: row.diffPayerId,
    ownerOrderId: sent ? row.initiatorOrderId : row.recipientOrderId,
    holderOrderId: sent ? row.recipientOrderId : row.initiatorOrderId,
  };
}

export function returnResolutionView(
  row: ExchangeDoc,
): Wire['ExchangeReturnResolution'] {
  const scope = oneSidedReturn(row)!;
  const r = row.returnResolution!;
  return {
    ownerId: scope.ownerId,
    holderId: scope.holderId,
    listingId: scope.listingId,
    ownerDeposit: scope.ownerDeposit,
    holderDeposit: scope.holderDeposit,
    differenceAmount: scope.differenceAmount,
    differencePayerId: scope.differencePayerId,
    phase: r.phase,
    note: r.note,
    evidenceDueAt: r.evidenceDueAt?.toISOString() ?? null,
    appealDueAt: r.appealDueAt?.toISOString() ?? null,
    effectiveAt: r.effectiveAt?.toISOString() ?? null,
    appeals: r.appeals,
    returnDueAt: r.returnDueAt?.toISOString() ?? null,
    trackingCode: r.trackingCode,
    returnedAt: r.returnedAt?.toISOString() ?? null,
    checkDueAt: r.checkDueAt?.toISOString() ?? null,
    outcome: r.outcome,
    compensation:
      r.outcome === 'Compensated' || r.phase === 'CompensationOrdered'
        ? scope.holderDeposit
        : 0,
  };
}

const emptyResolution = (): ExchangeReturnDoc => ({
  phase: 'Evidence',
  note: '',
  evidenceDueAt: null,
  appealDueAt: null,
  appeals: [],
  decisionBy: null,
  effectiveAt: null,
  returnDueAt: null,
  trackingCode: null,
  dispatchedAt: null,
  returnedAt: null,
  checkDueAt: null,
  outcome: null,
  settlementReceiptId: null,
  evidenceId: null,
});

const MEMBER_ACTIONS = new Set<Action>([
  'SubmitStatement',
  'Appeal',
  'ReportDispatch',
  'AcknowledgeReturn',
  'ReportReturnProblem',
]);
const ADMIN_ACTIONS = new Set<Action>([
  'Uphold',
  'SetAside',
  'VerifyReturnDelivery',
  'RejectReturnDispatch',
  'OrderCompensation',
]);
const NOTE_ACTIONS = new Set<Action>([
  'RequestEvidence',
  'SubmitStatement',
  'OrderReturn',
  'Appeal',
  'Uphold',
  'SetAside',
  'ReportReturnProblem',
  'VerifyReturnDelivery',
  'RejectReturnDispatch',
  'OrderCompensation',
]);

function requireState(
  allowed: boolean,
  message = 'Hồ sơ chưa đến bước này. Hãy tải trạng thái mới nhất.',
): asserts allowed {
  if (!allowed) throw invalidState(message);
}

function effective(r: ExchangeReturnDoc, now: Date) {
  if (r.effectiveAt) return r.effectiveAt;
  if (r.appealDueAt && r.appealDueAt <= now && !r.appeals.length)
    return r.appealDueAt;
  throw invalidState(
    'Quyết định đang chờ hết hạn kháng nghị hoặc chờ Admin xét lại.',
  );
}

function issue(
  r: ExchangeReturnDoc,
  phase: 'ReturnOrdered' | 'CompensationOrdered',
  note: string,
  actorId: string,
  now: Date,
) {
  return {
    ...r,
    phase,
    note,
    decisionBy: actorId,
    appeals: [],
    effectiveAt: null,
    appealDueAt: new Date(+now + 48 * HOUR),
    ...(phase === 'ReturnOrdered'
      ? { returnDueAt: new Date(+now + 120 * HOUR) }
      : {}),
  };
}

export async function exchangeReturnChange(
  tx: Tx,
  row: ExchangeDoc,
  actor: UserDoc,
  body: Wire['ExchangeReturnCommand'],
  operations: boolean,
  now: Date,
): Promise<ExchangeReturnDoc> {
  const scope = oneSidedReturn(row);
  requireState(
    Boolean(scope),
    'Luồng này xử lý một cuốn đã được bên nhận xác nhận và một cuốn đã quá hạn gửi.',
  );
  const { ownerId, holderId } = scope!;
  const { action, evidenceId } = body;
  if (operations === MEMBER_ACTIONS.has(action))
    throw new DomainError(403, 'FORBIDDEN', 'Thao tác này thuộc vai trò khác.');
  const admin = actor.roles.some((role) => role.role === 'ADMIN');
  if (
    operations &&
    (ADMIN_ACTIONS.has(action) ||
      (action !== 'RequestEvidence' &&
        row.initiatorDeposit + row.recipientDeposit + row.diffAmount >
          STAFF_LIMIT)) &&
    !admin
  )
    throw new DomainError(403, 'FORBIDDEN', 'Hồ sơ cần Admin xử lý.');

  const note = body.note?.trim() ?? '';
  if (NOTE_ACTIONS.has(action) && note.length < 5)
    throw invalidField('/note', 'Nhập căn cứ hoặc nội dung ít nhất 5 ký tự.');
  const r = row.returnResolution ?? emptyResolution();

  switch (action) {
    case 'RequestEvidence':
      requireState(
        (r.phase === 'Evidence' && !r.evidenceDueAt) ||
          r.phase === 'NeedsReview',
      );
      return {
        ...emptyResolution(),
        note,
        evidenceDueAt: new Date(+now + 48 * HOUR),
      };
    case 'SubmitStatement':
      requireState(
        r.phase === 'Evidence' && (!r.evidenceDueAt || now < r.evidenceDueAt),
      );
      await tx.c.exchange_messages.insertOne({
        _id: randomUUID(),
        exchangeId: row._id,
        senderId: actor._id,
        body: note,
        sentAt: now,
      });
      return r;
    case 'OrderReturn':
      requireState(
        r.phase === 'Evidence' &&
          Boolean(r.evidenceDueAt && now >= r.evidenceDueAt),
        'Hãy yêu cầu hai bên bổ sung bằng chứng và chờ hết 48 giờ trước khi ra quyết định.',
      );
      return issue(r, 'ReturnOrdered', note, actor._id, now);
    case 'Appeal':
      requireState(
        (r.phase === 'ReturnOrdered' || r.phase === 'CompensationOrdered') &&
          !r.effectiveAt &&
          Boolean(r.appealDueAt && now < r.appealDueAt) &&
          !r.appeals.some((appeal) => appeal.by === actor._id),
        'Hết hạn kháng nghị hoặc bạn đã gửi kháng nghị cho quyết định này.',
      );
      return { ...r, appeals: [...r.appeals, { by: actor._id, note }] };
    case 'Uphold':
    case 'SetAside':
      requireState(
        (r.phase === 'ReturnOrdered' || r.phase === 'CompensationOrdered') &&
          !r.effectiveAt &&
          r.appeals.length > 0 &&
          Boolean(r.appealDueAt && now >= r.appealDueAt),
      );
      if (r.decisionBy === actor._id)
        throw new DomainError(
          403,
          'SelfReviewForbidden',
          'Admin khác cần xem kháng nghị này.',
        );
      if (action === 'SetAside')
        return {
          ...r,
          phase: 'NeedsReview',
          note,
          effectiveAt: null,
          returnDueAt: null,
        };
      return {
        ...r,
        note,
        effectiveAt: now,
        ...(r.phase === 'ReturnOrdered'
          ? { returnDueAt: new Date(+now + 72 * HOUR) }
          : {}),
      };
    case 'ReportDispatch': {
      requireState(r.phase === 'ReturnOrdered' && actor._id === holderId);
      const effectiveAt = effective(r, now);
      requireState(
        Boolean(r.returnDueAt && now < r.returnDueAt),
        'Hạn bàn giao sách hoàn đã hết.',
      );
      if (!body.trackingCode?.trim() || body.trackingCode.trim().length < 5)
        throw invalidField('/trackingCode', 'Nhập mã vận đơn hoàn.');
      if (
        body.trackingCode.trim() ===
        (row.initiatorShipment?.trackingCode ??
          row.recipientShipment?.trackingCode)
      )
        throw invalidField(
          '/trackingCode',
          'Dùng mã vận đơn mới cho chặng hoàn.',
        );
      return {
        ...r,
        effectiveAt,
        phase: 'ReturnInProgress',
        trackingCode: body.trackingCode.trim(),
        dispatchedAt: now,
      };
    }
    case 'RejectReturnDispatch':
      requireState(
        r.phase === 'ReturnInProgress' ||
          (r.phase === 'ReturnIssue' && !r.returnedAt),
      );
      await requireEvidence(tx, row, evidenceId, r.dispatchedAt);
      return {
        ...r,
        phase: 'ReturnOrdered',
        note,
        trackingCode: null,
        dispatchedAt: null,
        evidenceId: evidenceId!,
      };
    case 'AcknowledgeReturn':
    case 'VerifyReturnDelivery':
      requireState(
        (r.phase === 'ReturnInProgress' ||
          (operations && r.phase === 'ReturnIssue')) &&
          (operations || actor._id === ownerId),
      );
      if (operations)
        await requireEvidence(tx, row, evidenceId, r.dispatchedAt);
      return {
        ...r,
        phase: 'CheckingReturn',
        evidenceId: operations ? evidenceId! : null,
        returnedAt: now,
        checkDueAt: new Date(+now + 48 * HOUR),
      };
    case 'ReportReturnProblem':
      requireState(
        actor._id === ownerId &&
          (r.phase === 'ReturnInProgress' ||
            (r.phase === 'CheckingReturn' &&
              Boolean(r.checkDueAt && now < r.checkDueAt))),
      );
      return { ...r, phase: 'ReturnIssue', note };
    case 'OrderCompensation':
      requireState(
        r.phase === 'ReturnOrdered' &&
          Boolean(r.returnDueAt && now >= r.returnDueAt) &&
          !r.dispatchedAt,
        'Chỉ xét bồi thường khi đã quá hạn trả và hồ sơ chưa ghi nhận chặng hoàn.',
      );
      effective(r, now);
      await requireEvidence(tx, row, evidenceId, r.returnDueAt);
      return {
        ...issue(r, 'CompensationOrdered', note, actor._id, now),
        evidenceId: evidenceId!,
      };
    case 'Settle':
      if (r.phase === 'CheckingReturn' && r.checkDueAt && now >= r.checkDueAt)
        return { ...r, phase: 'Closed', outcome: 'Returned' };
      requireState(r.phase === 'CompensationOrdered');
      return {
        ...r,
        effectiveAt: effective(r, now),
        phase: 'Closed',
        outcome: 'Compensated',
      };
  }
}

async function requireEvidence(
  tx: Tx,
  row: ExchangeDoc,
  id: string | undefined,
  since: Date | null,
) {
  if (
    !id ||
    !since ||
    !(await tx.c.exchange_evidence.findOne({
      _id: id,
      exchangeId: row._id,
      status: 'Ready',
      uploadedAt: { $gte: since },
    }))
  )
    throw invalidField(
      '/evidenceId',
      'Chọn bằng chứng đã tải xong trong hồ sơ, ghi nhận sau mốc xử lý này.',
    );
}

export function resolutionMessage(
  action: Action,
  r: ExchangeReturnDoc,
): string | undefined {
  switch (action) {
    case 'RequestEvidence':
      return 'Hai bên có 48 giờ để bổ sung bằng chứng trong phiếu trao đổi.';
    case 'OrderReturn':
      return 'Đã có quyết định yêu cầu trả sách. Hai bên có 48 giờ để kháng nghị.';
    case 'Appeal':
      return 'Đã nhận kháng nghị. Tiền vẫn được giữ trong khi Admin xem xét.';
    case 'Uphold':
      return 'Admin đã xem xét kháng nghị và giữ quyết định. Mở phiếu trao đổi để xem bước tiếp theo.';
    case 'SetAside':
      return 'Admin đã hủy quyết định đang xét. Hồ sơ tiếp tục được xem xét và tiền vẫn được giữ.';
    case 'ReportDispatch':
      return 'Đã có mã vận đơn hoàn. Hãy theo dõi và chỉ xác nhận khi đã nhận sách.';
    case 'AcknowledgeReturn':
    case 'VerifyReturnDelivery':
      return 'Đã ghi nhận giao sách hoàn. Chủ sách có 48 giờ để kiểm tra và báo sai sót.';
    case 'RejectReturnDispatch':
      return 'Admin đã xác minh mã vận đơn chưa chứng minh việc bàn giao sách. Hãy xem lại hồ sơ trả sách.';
    case 'ReportReturnProblem':
      return 'Đã ghi nhận vấn đề ở chặng trả sách. Tiền vẫn được giữ để kiểm tra.';
    case 'OrderCompensation':
      return 'Đã có quyết định bồi thường từ cọc. Hai bên có 48 giờ để kháng nghị.';
    case 'Settle':
      return r.outcome === 'Returned'
        ? 'Đã xác minh trả sách và hoàn các khoản đang giữ.'
        : 'Đã hoàn tiền và chi bồi thường theo quyết định cuối. Xem số tiền từng khoản trong phiếu.';
  }
}
