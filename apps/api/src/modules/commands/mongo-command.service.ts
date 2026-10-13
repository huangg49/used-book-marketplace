import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  Json,
  MutationReceiptDoc,
  SystemActor,
  UserDoc,
} from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { canonicalJson } from '../../common/canonical-json.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { DomainError, type Wire } from './domain-error.js';

// MongoDB port of CommandService (ADR 0027). Order inside one transaction:
// idempotency-key lock -> user/session locks -> current authorization ->
// receipt replay/conflict -> mutate (resource locks, decision clock) ->
// receipt + audit + outbox -> commit-time invariant checks -> commit.

export type { Tx };
export type Actor = AuthenticatedRequest['auth'];
export type CurrentActor = UserDoc;
export interface CommandContext {
  auth: Actor;
  key: string;
  requestId: string;
}
export { canonicalJson };

const hasRole = (actor: CurrentActor, ...roles: string[]) =>
  actor.roles.some((r) => roles.includes(r.role));
export function member(actor: CurrentActor, active = false) {
  if (!hasRole(actor, 'MEMBER'))
    throw new DomainError(
      403,
      'FORBIDDEN',
      'Tài khoản cần quyền thành viên để thực hiện thao tác này.',
    );
  if (active) requireActive(actor);
}
export function requireActive(actor: CurrentActor) {
  if (actor.status !== 'ACTIVE')
    throw new DomainError(
      403,
      'AccountIneligible',
      'Tài khoản hiện chưa được phép thực hiện thao tác này.',
    );
}
export function admin(actor: CurrentActor) {
  requireActive(actor);
  if (!hasRole(actor, 'ADMIN'))
    throw new DomainError(
      403,
      'FORBIDDEN',
      'Bạn không có quyền quản lý đầu sách.',
    );
}
export function reviewer(actor: CurrentActor) {
  requireActive(actor);
  if (!hasRole(actor, 'STAFF', 'ADMIN'))
    throw new DomainError(
      403,
      'FORBIDDEN',
      'Bạn không có quyền kiểm duyệt sách.',
    );
}

type Change = {
  entityType: 'Catalog' | 'Listing' | 'Media';
  entityId: string;
  version: number;
  revisionId: string | null;
  state: Wire['MutationReceipt']['state'];
  before?: Json;
  reason?: string;
  event?: string;
};
type AddressChange = Omit<Change, 'entityType' | 'revisionId' | 'state'> & {
  entityType: 'AddressBook';
  addressId: string;
};
type QuoteChange = Omit<Change, 'entityType' | 'revisionId' | 'state'> & {
  entityType: 'SaleQuote';
  decidedAt: Date;
  expiresAt: Date;
};
export type OrderChange = {
  before?: Json;
  entityType: 'Order';
  entityId: string;
  contextId: string;
  version: number;
  state: Wire['TransactionCommandReceipt']['state'];
  decidedAt: Date;
  paymentDeadline: Date;
  affectedListings: { id: string; version: number }[];
  event: string;
  reason?: string;
};
export type PurchaseConversationChange = {
  entityType: 'PurchaseConversation';
  entityId: string;
  listingId: string;
  version: number;
  state: Wire['PurchaseConversationReceipt']['status'];
  expiresAt: Date;
  decidedAt: Date;
  event: string;
  before?: Json;
  reason?: string;
};
export type ExchangeChange = {
  entityType: 'Exchange';
  entityId: string;
  initiatorListingId: string;
  version: number;
  state: Wire['ExchangeStatus'];
  decidedAt: Date;
  event: string;
  exchange: Wire['Exchange'];
  before?: Json;
  reason?: string;
};
export type WalletChange = {
  reason?: string;
  entityType: 'TopupIntent';
  entityId: string;
  version: number;
  state: Wire['TopupIntent']['state'];
  credited: boolean;
  journalId: string | null;
  decidedAt: Date;
  event: string;
};
type PackagingChange = {
  entityType: 'OrderPackagingEvidence';
  entityId: string;
  orderId: string;
  contextId: string;
  version: number;
  state: 'Pending' | 'Ready';
  decidedAt: Date;
  event: string;
  reason?: string;
};
type ShipmentChange = Omit<PackagingChange, 'entityType' | 'state'> & {
  entityType: 'Shipment';
  state: 'LabelCreated';
};
type CarrierChange = Omit<PackagingChange, 'entityType' | 'state'> & {
  entityType: 'CarrierEvent';
  state: 'Recorded';
  shipmentId: string;
  outcome: Wire['CarrierEventReceipt']['outcome'];
  orderState: Wire['CarrierEventReceipt']['orderState'];
  orderVersion: number;
};
export type AuctionChange = {
  entityType: 'AuctionIntake' | 'Auction' | 'PointOrder';
  entityId: string;
  intakeId: string;
  auctionId: string | null;
  orderId: string | null;
  contextId: string;
  version: number;
  state: Wire['AuctionCommandReceipt']['state'];
  decidedAt: Date;
  currentPrice: number | null;
  minimumBid: number | null;
  leading: boolean | null;
  collectionOutcome?: Wire['AuctionCommandReceipt']['collectionOutcome'];
  attemptsRemaining?: number | null;
  codeExpiresAt?: Date | null;
  returnOutcome?: Wire['AuctionCommandReceipt']['returnOutcome'];
  before?: Json;
  event?: string;
  reason?: string;
};
export type AuctionOperation =
  | 'createAuctionIntake'
  | 'cancelAuctionIntake'
  | 'receiveAuctionIntake'
  | 'inspectAuctionIntake'
  | 'openAuction'
  | 'reclaimAuctionIntake'
  | 'cancelAuction'
  | 'placeAuctionBid'
  | 'setAuctionAutoBid'
  | 'disableAuctionAutoBid'
  | 'buyAuctionNow'
  | 'payPointOrder'
  | 'acceptPointOrderReport'
  | 'rejectPointOrderReport'
  | 'requestCollectionCode'
  | 'handOverPointOrder'
  | 'resolvePointOrder'
  | 'claimPointOrder'
  | 'receivePointOrderReturn';
type CommandChange =
  | AuctionChange
  | PurchaseConversationChange
  | ExchangeChange
  | Change
  | AddressChange
  | QuoteChange
  | OrderChange
  | WalletChange
  | PackagingChange
  | ShipmentChange
  | CarrierChange;
type Options<C, D> = {
  discover?: (tx: Tx) => Promise<string[]>;
  authorize: (tx: Tx, actor: CurrentActor) => Promise<C>;
  mutate: (
    tx: Tx,
    actor: CurrentActor,
    current: C,
    receiptId: string,
  ) => Promise<D>;
};
type Principal = {
  actorId: string | null;
  systemActor: SystemActor | null;
  key: string;
  requestId: string;
};

// Operations a LOCKED account may still perform on existing obligations.
const EXISTING_OBLIGATION_OPERATIONS = [
  'cancelUnpaidOrder',
  'cancelPaidOrder',
  'rejectPaidOrder',
  'acceptOrder',
  'confirmOrderReceipt',
  'reportOrderNonReceipt',
  'createPackagingEvidence',
  'uploadPackagingEvidence',
  'registerDirectShipment',
  // Paid ViaPoint Order: the buyer may still decide and collect.
  'acceptPointOrderReport',
  'rejectPointOrderReport',
  'requestCollectionCode',
  'claimPointOrder',
];
const KEY_LOCK_TTL_MS = 7 * 24 * 3_600_000;
const sessionExpired = (
  message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
) => new DomainError(401, 'SESSION_EXPIRED', message);

@Injectable()
export class MongoCommandService {
  constructor(private readonly mongo: MongoService) {}

  // Locks the acting user, any other affected users and the session, then
  // reads current eligibility. Every writer of users/sessions conflicts with
  // these locks, so the decision cannot rest on a stale role or session.
  async actor(
    tx: Tx,
    auth: Actor,
    otherUsers: string[] = [],
    access: 'Standard' | 'ExistingObligation' = 'Standard',
  ): Promise<CurrentActor> {
    await tx.lock('users', [auth.user.id, ...otherUsers]);
    await tx.lock('auth_sessions', [auth.sessionId]);
    const session = await tx.c.auth_sessions.findOne({ _id: auth.sessionId });
    const user = await tx.c.users.findOne({ _id: auth.user.id });
    if (
      !session ||
      session.userId !== auth.user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !user?.emailVerifiedAt ||
      !['ACTIVE', 'RESTRICTED', 'LOCKED'].includes(user.status)
    )
      throw sessionExpired();
    if (user.status === 'LOCKED' && access !== 'ExistingObligation')
      throw new DomainError(
        403,
        'AccountIneligible',
        'Tài khoản đang bị khóa; chỉ được xử lý nghĩa vụ cũ.',
      );
    return user;
  }

  read<T>(
    auth: Actor,
    fn: (tx: Tx, actor: CurrentActor) => Promise<T>,
    discover?: (tx: Tx) => Promise<string[]>,
  ): Promise<T> {
    return this.mongo.tx(async (tx) =>
      fn(tx, await this.actor(tx, auth, (await discover?.(tx)) ?? [])),
    );
  }

  readObligation<T>(
    auth: Actor,
    fn: (tx: Tx, actor: CurrentActor) => Promise<T>,
    discover?: (tx: Tx) => Promise<string[]>,
  ): Promise<T> {
    return this.mongo.tx(async (tx) => {
      const actor = await this.actor(
        tx,
        auth,
        (await discover?.(tx)) ?? [],
        'ExistingObligation',
      );
      const value = await fn(tx, actor);
      const now = await tx.now();
      const session = await tx.c.auth_sessions.findOne({ _id: auth.sessionId });
      if (!session || session.revokedAt || session.expiresAt <= now)
        throw sessionExpired('Phiên đăng nhập đã hết hạn.');
      return value;
    });
  }

  run<C>(
    context: CommandContext,
    operation: string,
    target: string | null,
    body: unknown,
    options: Options<C, Change>,
  ) {
    return this.execute(
      context,
      operation,
      target,
      body,
      options,
      (change, id, serverTime): Wire['MutationReceipt'] => ({
        id,
        entityType: change.entityType,
        entityId: change.entityId,
        version: change.version,
        revisionId: change.revisionId,
        state: change.state,
        serverTime: serverTime.toISOString(),
      }),
    );
  }
  runAddress<C>(
    context: CommandContext,
    operation: string,
    target: string | null,
    body: unknown,
    options: Options<C, AddressChange>,
  ) {
    return this.execute(
      context,
      operation,
      target,
      body,
      options,
      (change, id, serverTime): Wire['AddressBookReceipt'] => ({
        id,
        entityType: 'AddressBook',
        entityId: change.entityId,
        version: change.version,
        addressId: change.addressId,
        serverTime: serverTime.toISOString(),
      }),
    );
  }
  runQuote<C>(
    context: CommandContext,
    operation: string,
    target: string | null,
    body: unknown,
    options: Options<C, QuoteChange>,
  ) {
    return this.execute(
      context,
      operation,
      target,
      body,
      options,
      (change, id, serverTime): Wire['QuoteReceipt'] => ({
        id,
        entityType: 'SaleQuote',
        entityId: change.entityId,
        version: 1,
        expiresAt: change.expiresAt.toISOString(),
        serverTime: serverTime.toISOString(),
      }),
    );
  }
  private orderReceipt(
    change: OrderChange,
    id: string,
    serverTime: Date,
  ): Wire['TransactionCommandReceipt'] {
    return {
      id,
      entityType: 'Order',
      entityId: change.entityId,
      contextId: change.contextId,
      version: change.version,
      state: change.state,
      paymentDeadline: change.paymentDeadline.toISOString(),
      serverTime: serverTime.toISOString(),
      affectedListings: change.affectedListings,
    };
  }
  runOrder<C>(
    context: CommandContext,
    operation:
      | 'createDirectOrder'
      | 'cancelUnpaidOrder'
      | 'payOrder'
      | 'acceptOrder'
      | 'confirmOrderReceipt'
      | 'emitSimulatedDeliveryEvent'
      | 'reportOrderNonReceipt'
      | 'cancelPaidOrder'
      | 'rejectPaidOrder',
    target: string | null,
    body: unknown,
    options: Options<C, OrderChange>,
  ) {
    return this.execute(context, operation, target, body, options, (...args) =>
      this.orderReceipt(...args),
    );
  }
  runPurchaseConversation<C>(
    context: CommandContext,
    operation: 'createPurchaseConversation',
    target: string,
    body: unknown,
    options: Options<C, PurchaseConversationChange>,
  ) {
    return this.execute(context, operation, target, body, options, (change, id, serverTime): Wire['PurchaseConversationReceipt'] => ({
      id,
      entityType: 'PurchaseConversation',
      entityId: change.entityId,
      listingId: change.listingId,
      version: change.version,
      status: change.state,
      expiresAt: change.expiresAt.toISOString(),
      serverTime: serverTime.toISOString(),
    }));
  }
  runExchange<C>(
    context: CommandContext,
    operation: 'createExchangeProposal' | 'acceptExchange' | 'fundExchange' | 'cancelExchange' | 'rejectExchange' | 'shipExchange' | 'receiveExchange',
    target: string | null,
    body: unknown,
    options: Options<C, ExchangeChange>,
  ) {
    return this.execute(context, operation, target, body, options, (change, id, serverTime): Wire['Exchange'] => change.exchange);
  }
  systemPurchaseConversation<C>(
    key: string,
    options: {
      discover: (tx: Tx) => Promise<string[]>;
      authorize: (tx: Tx) => Promise<C>;
      mutate: (tx: Tx, current: C, receiptId: string) => Promise<PurchaseConversationChange>;
    },
  ) {
    return this.executePrincipal(
      { actorId: null, systemActor: 'PurchaseConversationExpiry', key, requestId: randomUUID() },
      'expirePurchaseConversation', key, {},
      { authorize: async (tx) => { await this.lockUsers(tx, await options.discover(tx)); return options.authorize(tx); }, mutate: options.mutate },
      (change, id, serverTime): Wire['PurchaseConversationReceipt'] => ({ id, entityType: 'PurchaseConversation', entityId: change.entityId, listingId: change.listingId, version: change.version, status: change.state, expiresAt: change.expiresAt.toISOString(), serverTime: serverTime.toISOString() }),
    );
  }
  runPackaging<C>(
    context: CommandContext,
    operation: 'createPackagingEvidence' | 'uploadPackagingEvidence',
    target: string,
    body: unknown,
    options: Options<C, PackagingChange>,
  ) {
    return this.execute(
      context,
      operation,
      target,
      body,
      options,
      (change, id, serverTime): Wire['PackagingEvidenceReceipt'] => ({
        id,
        entityType: 'OrderPackagingEvidence',
        entityId: change.entityId,
        orderId: change.orderId,
        contextId: change.contextId,
        version: change.version as 1 | 2,
        state: change.state,
        serverTime: serverTime.toISOString(),
      }),
    );
  }
  runShipment<C>(
    context: CommandContext,
    target: string,
    body: unknown,
    options: Options<C, ShipmentChange>,
  ) {
    return this.execute(
      context,
      'registerDirectShipment',
      target,
      body,
      options,
      (change, id, serverTime): Wire['ShipmentCommandReceipt'] => ({
        id,
        entityType: 'Shipment',
        entityId: change.entityId,
        orderId: change.orderId,
        contextId: change.contextId,
        version: 1,
        state: 'LabelCreated',
        serverTime: serverTime.toISOString(),
      }),
    );
  }
  runCarrier<C>(
    context: CommandContext,
    body: Wire['SimulatedPickupEvent'],
    options: Options<C, CarrierChange>,
  ) {
    return this.execute(
      context,
      'emitSimulatedPickupEvent',
      body.shipmentId,
      body,
      options,
      (change, id, serverTime): Wire['CarrierEventReceipt'] => ({
        id,
        entityType: 'CarrierEvent',
        entityId: change.entityId,
        shipmentId: change.shipmentId,
        orderId: change.orderId,
        contextId: change.contextId,
        version: change.version,
        state: 'Recorded',
        outcome: change.outcome,
        orderVersion: change.orderVersion,
        orderState: change.orderState,
        serverTime: serverTime.toISOString(),
      }),
    );
  }
  runWallet<C>(
    context: CommandContext,
    operation: 'createTopupIntent' | 'emitSimulatedTopupEvent',
    target: string | null,
    body: unknown,
    options: Options<C, WalletChange>,
  ) {
    return this.execute(
      context,
      operation,
      target,
      body,
      options,
      (change, id, serverTime): Wire['WalletCommandReceipt'] => ({
        id,
        entityType: 'TopupIntent',
        entityId: change.entityId,
        version: change.version,
        state: change.state,
        credited: change.credited,
        journalId: change.journalId,
        serverTime: serverTime.toISOString(),
        demoOnly: true,
        label: 'Mô phỏng đồ án',
        currency: 'VND',
      }),
    );
  }
  // Only the internal workers call this path. No HTTP DTO selects a principal.
  expireOrder<C>(
    orderId: string,
    options: {
      discover: (tx: Tx) => Promise<string[]>;
      authorize: (tx: Tx) => Promise<C>;
      mutate: (tx: Tx, current: C, receiptId: string) => Promise<OrderChange>;
    },
    operation:
      | 'expireOrder'
      | 'expireSellerConfirmation'
      | 'expireOrderPickup'
      | 'expireOrderDelivery'
      | 'settleDirectOrder'
      | 'refundOrder' = 'expireOrder',
  ) {
    const systemActor: SystemActor =
      operation === 'expireOrderDelivery'
        ? 'OrderDeliveryExpiry'
        : operation === 'settleDirectOrder'
          ? 'OrderInspectionExpiry'
        : operation === 'expireOrder'
          ? 'OrderExpiry'
          : operation === 'refundOrder'
            ? 'OrderRefund'
            : operation === 'expireOrderPickup'
              ? 'OrderPickupExpiry'
              : 'OrderConfirmationExpiry';
    return this.executePrincipal(
      { actorId: null, systemActor, key: orderId, requestId: randomUUID() },
      operation,
      orderId,
      {},
      {
        authorize: async (tx) => {
          await this.lockUsers(tx, await options.discover(tx));
          return options.authorize(tx);
        },
        mutate: options.mutate,
      },
      (...args) => this.orderReceipt(...args),
    );
  }
  private auctionReceipt(
    change: AuctionChange,
    id: string,
    serverTime: Date,
  ): Wire['AuctionCommandReceipt'] {
    return {
      id,
      entityType: change.entityType,
      entityId: change.entityId,
      intakeId: change.intakeId,
      auctionId: change.auctionId,
      orderId: change.orderId,
      contextId: change.contextId,
      version: change.version,
      state: change.state,
      currentPrice: change.currentPrice,
      minimumBid: change.minimumBid,
      leading: change.leading,
      collectionOutcome: change.collectionOutcome ?? null,
      attemptsRemaining: change.attemptsRemaining ?? null,
      codeExpiresAt: change.codeExpiresAt?.toISOString() ?? null,
      returnOutcome: change.returnOutcome ?? null,
      serverTime: serverTime.toISOString(),
    };
  }
  runAuction<C>(
    context: CommandContext,
    operation: AuctionOperation,
    target: string | null,
    body: unknown,
    options: Options<C, AuctionChange>,
  ) {
    return this.execute(context, operation, target, body, options, (...args) =>
      this.auctionReceipt(...args),
    );
  }
  // Auction workers only; the key names the aggregate (and, for repeatable
  // deadlines, its version), so each transition commits at most once.
  systemAuction<C>(
    systemActor: Extract<
      SystemActor,
      | 'AuctionClose'
      | 'AuctionHold'
      | 'AuctionPaymentExpiry'
      | 'AuctionIntakeExpiry'
      | 'PointOrderDeadline'
      | 'PointOrderSettlement'
    >,
    key: string,
    options: {
      discover: (tx: Tx) => Promise<string[]>;
      authorize: (tx: Tx) => Promise<C>;
      mutate: (tx: Tx, current: C, receiptId: string) => Promise<AuctionChange>;
    },
  ) {
    const operation = {
      AuctionClose: 'closeAuction',
      AuctionHold: 'holdAuction',
      AuctionPaymentExpiry: 'expireAuctionPayment',
      AuctionIntakeExpiry: 'expireAuctionIntake',
      PointOrderDeadline: 'openPointOrderResolution',
      PointOrderSettlement: 'settlePointOrder',
    }[systemActor];
    return this.executePrincipal(
      { actorId: null, systemActor, key, requestId: randomUUID() },
      operation,
      key,
      {},
      {
        authorize: async (tx) => {
          await this.lockUsers(tx, await options.discover(tx));
          return options.authorize(tx);
        },
        mutate: options.mutate,
      },
      (...args) => this.auctionReceipt(...args),
    );
  }
  async lockUsers(tx: Tx, users: string[]) {
    if (users.length) await tx.lock('users', users);
  }

  private execute<C, D extends CommandChange, R>(
    context: CommandContext,
    operation: string,
    target: string | null,
    body: unknown,
    options: Options<C, D>,
    project: (change: D, id: string, serverTime: Date) => R,
  ) {
    return this.executePrincipal(
      {
        actorId: context.auth.user.id,
        systemActor: null,
        key: context.key,
        requestId: context.requestId,
      },
      operation,
      target,
      body,
      {
        authorize: async (tx) => {
          const actor = await this.actor(
            tx,
            context.auth,
            (await options.discover?.(tx)) ?? [],
            EXISTING_OBLIGATION_OPERATIONS.includes(operation)
              ? 'ExistingObligation'
              : 'Standard',
          );
          return { actor, current: await options.authorize(tx, actor) };
        },
        mutate: (tx, result, receiptId) =>
          options.mutate(tx, result.actor, result.current, receiptId),
      },
      project,
    );
  }

  private executePrincipal<C, D extends CommandChange, R>(
    context: Principal,
    operation: string,
    target: string | null,
    body: unknown,
    options: {
      authorize: (tx: Tx) => Promise<C>;
      mutate: (tx: Tx, current: C, receiptId: string) => Promise<D>;
    },
    project: (change: D, id: string, serverTime: Date) => R,
  ): Promise<{ receipt: R; replayed: boolean }> {
    const hash = createHash('sha256')
      .update(canonicalJson({ operation, target, body }))
      .digest('hex');
    const principal = context.actorId
      ? `user:${context.actorId}`
      : `system:${context.systemActor}`;
    // Transient conflicts retry the whole callback with a finite budget;
    // exhaustion and unknown commit outcomes surface as 503 (ADR 0027).
    return this.mongo.tx(async (tx) => {
      // Same tuple as the PostgreSQL advisory lock. Carrier events share one
      // global identity across operators.
      const lockId = createHash('sha256')
        .update(
          canonicalJson([
            operation === 'emitSimulatedPickupEvent'
              ? 'CarrierSimulator'
              : (context.actorId ?? context.systemActor),
            operation,
            context.key,
          ]),
        )
        .digest('hex');
      await tx.c.command_locks.updateOne(
        { _id: lockId },
        {
          $inc: { lockSeq: 1 },
          $set: { expiresAt: new Date(Date.now() + KEY_LOCK_TTL_MS) },
        },
        { upsert: true },
      );
      // Current permission checks always run before stored receipt access.
      const current = await options.authorize(tx);
      let previous: MutationReceiptDoc | null =
        await tx.c.mutation_receipts.findOne({
          principal,
          operation,
          key: context.key,
        });
      // Provider event identity is global, but current authorization still precedes replay.
      if (!previous && operation === 'emitSimulatedPickupEvent') {
        const event = await tx.c.carrier_pickup_events.findOne({
          _id: context.key,
        });
        previous = event
          ? await tx.c.mutation_receipts.findOne({ _id: event.receiptId })
          : null;
      }
      if (previous) {
        if (previous.payloadHash !== hash)
          throw new DomainError(
            409,
            'IdempotencyConflict',
            'Mã yêu cầu đã được dùng cho nội dung khác.',
          );
        return { receipt: previous.result as unknown as R, replayed: true };
      }
      const id = randomUUID();
      const change = await options.mutate(tx, current, id);
      const serverTime =
        change.entityType === 'SaleQuote' ||
        change.entityType === 'Order' ||
        change.entityType === 'OrderPackagingEvidence' ||
        change.entityType === 'Shipment' ||
        change.entityType === 'CarrierEvent' ||
        change.entityType === 'TopupIntent' ||
        change.entityType === 'AuctionIntake' ||
        change.entityType === 'Auction' ||
        change.entityType === 'PointOrder'
        || change.entityType === 'PurchaseConversation'
          ? change.decidedAt
          : new Date();
      const receipt = project(change, id, serverTime);
      const targets = {
        listingId: null as string | null,
        bookId: null as string | null,
        mediaId: null as string | null,
        addressBookId: null as string | null,
        quoteId: null as string | null,
        contextId: null as string | null,
        topupId: null as string | null,
      };
      if (change.entityType === 'TopupIntent')
        targets.topupId = change.entityId;
      else if (change.entityType === 'Exchange') {
        targets.listingId = change.initiatorListingId;
      } else if (
        change.entityType === 'Order' ||
        change.entityType === 'OrderPackagingEvidence' ||
        change.entityType === 'Shipment' ||
        change.entityType === 'CarrierEvent' ||
        change.entityType === 'AuctionIntake' ||
        change.entityType === 'Auction' ||
        change.entityType === 'PointOrder'
      )
        targets.contextId = change.contextId;
      else if (change.entityType === 'PurchaseConversation')
        targets.listingId = change.listingId;
      else if (change.entityType === 'SaleQuote')
        targets.quoteId = change.entityId;
      else if (change.entityType === 'AddressBook')
        targets.addressBookId = change.entityId;
      else if (change.entityType === 'Catalog')
        targets.bookId = change.entityId;
      else if (change.entityType === 'Media') targets.mediaId = change.entityId;
      else targets.listingId = change.entityId;
      await tx.c.mutation_receipts.insertOne({
        _id: id,
        principal,
        actorId: context.actorId,
        systemActor: context.systemActor,
        operation,
        key: context.key,
        payloadHash: hash,
        ...targets,
        resultVersion: change.version,
        result: receipt as unknown as Json,
        committedAt: serverTime,
      });
      const auditId = randomUUID();
      const createdAt = await tx.now();
      await tx.c.audit_events.insertOne({
        _id: auditId,
        actorId: context.actorId,
        systemActor: context.systemActor,
        receiptId: id,
        ...targets,
        action: operation,
        before: 'before' in change && change.before ? change.before : null,
        after: auditAfter(change),
        reason: change.reason ?? null,
        requestId: context.requestId,
        createdAt,
      });
      if (change.event)
        await tx.c.outbox_events.insertOne({
          _id: randomUUID(),
          auditId,
          type: change.event,
          payload: {
            entityId: change.entityId,
            ...(change.entityType === 'Order'
              ? {
                  contextId: change.contextId,
                  state: change.state,
                  affectedListings: change.affectedListings,
                }
              : change.entityType === 'OrderPackagingEvidence' ||
                  change.entityType === 'Shipment' ||
                  change.entityType === 'CarrierEvent'
                ? {
                    contextId: change.contextId,
                    orderId: change.orderId,
                    state: change.state,
                  }
                  : change.entityType === 'AuctionIntake' ||
                    change.entityType === 'Auction' ||
                    change.entityType === 'PointOrder'
                  ? {
                      contextId: change.contextId,
                      intakeId: change.intakeId,
                      auctionId: change.auctionId,
                      orderId: change.orderId,
                      state: change.state,
                    }
                  : change.entityType === 'PurchaseConversation'
                    ? { listingId: change.listingId, state: change.state, expiresAt: change.expiresAt.toISOString() }
                  : {}),
            ...('revisionId' in change
              ? { revisionId: change.revisionId }
              : {}),
            version: change.version,
          },
          attempts: 0,
          availableAt: createdAt,
          leaseUntil: null,
          processedAt: null,
          createdAt,
        });
      return { receipt, replayed: false };
    });
  }
}

function auditAfter(change: CommandChange): Json {
  switch (change.entityType) {
    // Public price only: Auto ceilings never enter audit/outbox (FR-AU10).
    case 'AuctionIntake':
    case 'Auction':
    case 'PointOrder':
      return {
        intakeId: change.intakeId,
        auctionId: change.auctionId,
        orderId: change.orderId,
        version: change.version,
        state: change.state,
        currentPrice: change.currentPrice,
      };
    case 'CarrierEvent':
      return {
        eventId: change.entityId,
        shipmentId: change.shipmentId,
        orderId: change.orderId,
        version: change.version,
        state: change.state,
        outcome: change.outcome,
        orderVersion: change.orderVersion,
        orderState: change.orderState,
      };
    case 'TopupIntent':
      return {
        version: change.version,
        state: change.state,
        journalId: change.journalId,
        credited: change.credited,
      };
    case 'Shipment':
      return {
        shipmentId: change.entityId,
        orderId: change.orderId,
        version: change.version,
        state: change.state,
      };
    case 'OrderPackagingEvidence':
      return {
        evidenceId: change.entityId,
        orderId: change.orderId,
        version: change.version,
        state: change.state,
      };
    case 'Order':
      return {
        version: change.version,
        state: change.state,
        affectedListings: change.affectedListings,
      };
    case 'PurchaseConversation':
      return { listingId: change.listingId, version: change.version, state: change.state, expiresAt: change.expiresAt.toISOString() };
    case 'SaleQuote':
      return {
        version: change.version,
        expiresAt: change.expiresAt.toISOString(),
      };
    case 'Exchange':
      return {
        version: change.version,
        state: change.state,
      };
    case 'AddressBook':
      return { version: change.version, addressId: change.addressId };
    default:
      return {
        version: change.version,
        revisionId: change.revisionId,
        state: change.state,
      };
  }
}
