import type {
  AuctionIntakeDoc,
  DirectOrderDoc,
  ExchangeDoc,
  PointOrderDoc,
} from '../../database/mongo/documents.js';
import {
  atReadTime,
  directGuidance,
  exchangeGuidance,
  intakeGuidance,
  pointGuidance,
} from './work-policy.js';

const due = new Date('2026-10-29T01:00:00Z');
describe('work prompts preserve state, deadlines and each side of an obligation', () => {
  it('does not prompt a seller to pay, or call held money a completed sale', () => {
    const order = {
      buyerId: 'buyer',
      sellerId: 'seller',
      state: 'AwaitingPayment',
      paymentDeadline: due,
    } as DirectOrderDoc;
    expect(directGuidance(order, 'buyer', true)).toMatchObject({
      attention: 'Action',
      dueAt: due,
    });
    expect(directGuidance(order, 'seller', true).attention).toBe('Waiting');
    expect(directGuidance(order, 'buyer', false).attention).toBe('Blocked');
    order.state = 'PendingSellerConfirmation';
    order.sellerConfirmationDeadline = due;
    expect(directGuidance(order, 'seller', false)).toMatchObject({
      attention: 'Action',
      dueAt: due,
    });
    expect(directGuidance(order, 'buyer', true).attention).toBe('Waiting');
    order.state = 'SettlementPending';
    expect(directGuidance(order, 'seller', true).reason).toContain('chưa phải');
  });
  it('at the exact deadline waits for the owning worker; never extends or mutates a deadline', () => {
    const guidance = {
      attention: 'Action' as const,
      dueAt: due,
      reason: 'Pay',
    };
    expect(atReadTime(guidance, new Date(+due - 1)).attention).toBe('Action');
    expect(atReadTime(guidance, due)).toMatchObject({
      attention: 'Waiting',
      dueAt: due.toISOString(),
    });
    expect(atReadTime(guidance, new Date(+due + 1)).reason).toContain(
      'hướng dẫn hiện tại',
    );
    expect(guidance).toEqual({
      attention: 'Action',
      dueAt: due,
      reason: 'Pay',
    });
  });
  it('counteroffers wait on the other participant, including a recipient counteroffer and legacy proposer', () => {
    const exchange = {
      status: 'Proposed',
      initiatorId: 'a',
      recipientId: 'b',
      lastProposedById: 'b',
      proposalExpiresAt: due,
    } as ExchangeDoc;
    expect(exchangeGuidance(exchange, 'a', true).attention).toBe('Action');
    expect(exchangeGuidance(exchange, 'b', true).attention).toBe('Waiting');
    expect(exchangeGuidance(exchange, 'a', false).attention).toBe('Blocked');
    delete exchange.lastProposedById;
    expect(exchangeGuidance(exchange, 'b', true).attention).toBe('Action');
  });
  it('never asks to fund twice or bypass a dispute using a stale Delivered state', () => {
    const e = {
      status: 'AcceptedAwaitingFunding',
      initiatorId: 'a',
      initiatorFundedAt: due,
      recipientFundedAt: null,
      fundingDeadline: due,
    } as ExchangeDoc;
    expect(exchangeGuidance(e, 'a', true).attention).toBe('Waiting');
    expect(exchangeGuidance(e, 'b', true).attention).toBe('Action');
    expect(exchangeGuidance(e, 'b', false).attention).toBe('Blocked');
    e.status = 'Delivered';
    e.disputedBy = 'b';
    expect(exchangeGuidance(e, 'a', true)).toMatchObject({
      attention: 'Waiting',
      dueAt: null,
    });
  });
  it('uses each participant inspection deadline, including the shared legacy fallback', () => {
    const received = new Date(+due - 1000);
    const e = {
      status: 'Delivered',
      initiatorId: 'a',
      initiatorReceivedAt: received,
      recipientReceivedAt: null,
      inspectionDeadline: due,
    } as ExchangeDoc;
    const expected = new Date(+received + 72 * 3600000);
    expect(exchangeGuidance(e, 'a', true).dueAt).toEqual(expected);
    expect(exchangeGuidance(e, 'b', true).attention).toBe('Waiting');
    e.initiatorCompletedAt = received;
    expect(exchangeGuidance(e, 'a', true).attention).toBe('Waiting');
  });
  it('does not request evidence twice and distinguishes publication from point inspection', () => {
    const intake = {
      state: 'NeedsEvidence',
      evidenceSubmittedAt: null,
      evidenceDeadline: due,
    } as AuctionIntakeDoc;
    expect(intakeGuidance(intake, true).attention).toBe('Action');
    intake.evidenceSubmittedAt = due;
    expect(intakeGuidance(intake, true).attention).toBe('Waiting');
    intake.state = 'Passed';
    expect(intakeGuidance(intake, false).attention).toBe('Blocked');
    expect(intakeGuidance(intake, true).reason).toContain('công bố');
  });
  it('seller cannot accept the buyer report; accepted carrier-bound report waits on the point', () => {
    const order = {
      state: 'Fulfilling',
      buyerId: 'buyer',
      acceptanceDeadline: due,
      acceptedAt: null,
    } as PointOrderDoc;
    expect(pointGuidance(order, 'seller', true).attention).toBe('Waiting');
    expect(pointGuidance(order, 'buyer', true).attention).toBe('Action');
    order.acceptedAt = due;
    expect(pointGuidance(order, 'buyer', true)).toMatchObject({
      attention: 'Waiting',
      dueAt: null,
    });
    order.state = 'ReturnPending';
    order.returnDeadline = due;
    expect(pointGuidance(order, 'buyer', true)).toMatchObject({
      attention: 'Action',
      dueAt: due,
    });
  });
});
