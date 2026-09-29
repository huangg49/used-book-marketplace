import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { DomainError, type Wire } from './domain-error.js';
import { canonicalJson } from '../../common/canonical-json.js';

export type Tx = Prisma.TransactionClient;
export type Actor = AuthenticatedRequest['auth'];
export type CurrentActor = Prisma.UserGetPayload<{ include: { roles: true } }>;
export interface CommandContext {
  auth: Actor;
  key: string;
  requestId: string;
}
export { canonicalJson };
export function member(actor: CurrentActor, active = false) {
  if (!actor.roles.some((r) => r.role === 'MEMBER'))
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
  if (!actor.roles.some((r) => r.role === 'ADMIN'))
    throw new DomainError(
      403,
      'FORBIDDEN',
      'Bạn không có quyền quản lý đầu sách.',
    );
}
export function reviewer(actor: CurrentActor) {
  requireActive(actor);
  if (!actor.roles.some((r) => r.role === 'STAFF' || r.role === 'ADMIN'))
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
  before?: Prisma.InputJsonObject;
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
  before?: Prisma.InputJsonObject;
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
type CommandChange =
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

@Injectable()
export class CommandService {
  constructor(private readonly db: DatabaseService) {}
  async actor(
    tx: Tx,
    auth: Actor,
    otherUsers: string[] = [],
    access: 'Standard' | 'ExistingObligation' = 'Standard',
  ): Promise<CurrentActor> {
    const ids = [...new Set([auth.user.id, ...otherUsers])].sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${auth.sessionId}::uuid FOR SHARE`;
    const session = await tx.authSession.findUnique({
      where: { id: auth.sessionId },
    });
    const user = await tx.user.findUnique({
      where: { id: auth.user.id },
      include: { roles: true },
    });
    if (
      !session ||
      session.userId !== auth.user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !user?.emailVerifiedAt ||
      !['ACTIVE', 'RESTRICTED', 'LOCKED'].includes(user.status)
    )
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    if (user.status === 'LOCKED' && access !== 'ExistingObligation')
      throw new DomainError(
        403,
        'AccountIneligible',
        'Tài khoản đang bị khóa; chỉ được xử lý nghĩa vụ cũ.',
      );
    return user;
  }
  async read<T>(
    auth: Actor,
    fn: (tx: Tx, actor: CurrentActor) => Promise<T>,
    discover?: (tx: Tx) => Promise<string[]>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) =>
        fn(tx, await this.actor(tx, auth, (await discover?.(tx)) ?? [])),
      { maxWait: 5000, timeout: 10000 },
    );
  }
  async readObligation<T>(
    auth: Actor,
    fn: (tx: Tx, actor: CurrentActor) => Promise<T>,
    discover?: (tx: Tx) => Promise<string[]>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const actor = await this.actor(
          tx,
          auth,
          (await discover?.(tx)) ?? [],
          'ExistingObligation',
        );
        const value = await fn(tx, actor);
        const [clock] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT clock_timestamp() AS now`;
        const session = await tx.authSession.findUnique({
          where: { id: auth.sessionId },
        });
        if (!session || session.revokedAt || session.expiresAt <= clock.now)
          throw new DomainError(
            401,
            'SESSION_EXPIRED',
            'Phiên đăng nhập đã hết hạn.',
          );
        return value;
      },
      { maxWait: 5000, timeout: 10000 },
    );
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
  // Only the internal expiry service can call this path. No HTTP DTO selects a principal.
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
      | 'refundOrder' = 'expireOrder',
  ) {
    return this.executePrincipal(
      {
        actorId: null,
        systemActor:
          operation === 'expireOrderDelivery'
            ? 'OrderDeliveryExpiry'
            : operation === 'expireOrder'
              ? 'OrderExpiry'
              : operation === 'refundOrder'
                ? 'OrderRefund'
                : operation === 'expireOrderPickup'
                  ? 'OrderPickupExpiry'
                  : 'OrderConfirmationExpiry',
        key: orderId,
        requestId: randomUUID(),
      },
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
  async lockUsers(tx: Tx, users: string[]) {
    const ids = [...new Set(users)].sort();
    if (ids.length)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
      );
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
            [
              'cancelUnpaidOrder',
              'cancelPaidOrder',
              'rejectPaidOrder',
              'acceptOrder',
              'reportOrderNonReceipt',
              'createPackagingEvidence',
              'uploadPackagingEvidence',
              'registerDirectShipment',
            ].includes(operation)
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
  private async executePrincipal<C, D extends CommandChange, R>(
    context: {
      actorId: string | null;
      systemActor:
        | 'OrderExpiry'
        | 'OrderConfirmationExpiry'
        | 'OrderRefund'
        | 'OrderPickupExpiry'
        | 'OrderDeliveryExpiry'
        | null;
      key: string;
      requestId: string;
    },
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
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const lock = canonicalJson([
              operation === 'emitSimulatedPickupEvent'
                ? 'CarrierSimulator'
                : (context.actorId ?? context.systemActor),
              operation,
              context.key,
            ]);
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))::text`;
            // Current permission checks always run before stored receipt access.
            const current = await options.authorize(tx);
            let previous = await tx.mutationReceipt.findFirst({
              where: {
                actorId: context.actorId,
                systemActor: context.systemActor,
                operation,
                key: context.key,
              },
            });
            // Provider event identity is global, but current authorization still precedes replay.
            if (!previous && operation === 'emitSimulatedPickupEvent') {
              const event = await tx.carrierPickupEvent.findUnique({
                where: { id: context.key },
                include: { receipt: true },
              });
              previous = event?.receipt ?? null;
            }
            if (previous) {
              if (previous.payloadHash !== hash)
                throw new DomainError(
                  409,
                  'IdempotencyConflict',
                  'Mã yêu cầu đã được dùng cho nội dung khác.',
                );
              return {
                receipt: previous.result as unknown as R,
                replayed: true,
              };
            }
            const id = randomUUID();
            const change = await options.mutate(tx, current, id);
            const serverTime =
              change.entityType === 'SaleQuote' ||
              change.entityType === 'Order' ||
              change.entityType === 'OrderPackagingEvidence' ||
              change.entityType === 'Shipment' ||
              change.entityType === 'CarrierEvent' ||
              change.entityType === 'TopupIntent'
                ? change.decidedAt
                : new Date();
            const receipt = project(change, id, serverTime);
            const targetFk =
              change.entityType === 'TopupIntent'
                ? { topupId: change.entityId }
                : change.entityType === 'Order' ||
                    change.entityType === 'OrderPackagingEvidence' ||
                    change.entityType === 'Shipment' ||
                    change.entityType === 'CarrierEvent'
                  ? { contextId: change.contextId }
                  : change.entityType === 'SaleQuote'
                    ? { quoteId: change.entityId }
                    : change.entityType === 'AddressBook'
                      ? { addressBookId: change.entityId }
                      : change.entityType === 'Catalog'
                        ? { bookId: change.entityId }
                        : change.entityType === 'Media'
                          ? { mediaId: change.entityId }
                          : { listingId: change.entityId };
            await tx.mutationReceipt.create({
              data: {
                id,
                actorId: context.actorId,
                systemActor: context.systemActor,
                operation,
                key: context.key,
                payloadHash: hash,
                ...targetFk,
                resultVersion: change.version,
                result: receipt as unknown as Prisma.InputJsonObject,
                committedAt: serverTime,
              },
            });
            const audit = await tx.auditEvent.create({
              data: {
                actorId: context.actorId,
                systemActor: context.systemActor,
                receiptId: id,
                ...targetFk,
                action: operation,
                requestId: context.requestId,
                before: 'before' in change ? change.before : undefined,
                after:
                  change.entityType === 'CarrierEvent'
                    ? {
                        eventId: change.entityId,
                        shipmentId: change.shipmentId,
                        orderId: change.orderId,
                        version: change.version,
                        state: change.state,
                        outcome: change.outcome,
                        orderVersion: change.orderVersion,
                        orderState: change.orderState,
                      }
                    : change.entityType === 'TopupIntent'
                      ? {
                          version: change.version,
                          state: change.state,
                          journalId: change.journalId,
                          credited: change.credited,
                        }
                      : change.entityType === 'Shipment'
                        ? {
                            shipmentId: change.entityId,
                            orderId: change.orderId,
                            version: change.version,
                            state: change.state,
                          }
                        : change.entityType === 'OrderPackagingEvidence'
                          ? {
                              evidenceId: change.entityId,
                              orderId: change.orderId,
                              version: change.version,
                              state: change.state,
                            }
                          : change.entityType === 'Order'
                            ? {
                                version: change.version,
                                state: change.state,
                                affectedListings: change.affectedListings,
                              }
                            : change.entityType === 'SaleQuote'
                              ? {
                                  version: change.version,
                                  expiresAt: change.expiresAt.toISOString(),
                                }
                              : change.entityType === 'AddressBook'
                                ? {
                                    version: change.version,
                                    addressId: change.addressId,
                                  }
                                : ({
                                    version: change.version,
                                    revisionId: change.revisionId,
                                    state: change.state,
                                  } as Prisma.InputJsonObject),
                reason: change.reason,
              },
            });
            if (change.event)
              await tx.outboxEvent.create({
                data: {
                  auditId: audit.id,
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
                        : {}),
                    ...('revisionId' in change
                      ? { revisionId: change.revisionId }
                      : {}),
                    version: change.version,
                  },
                },
              });
            return { receipt, replayed: false };
          },
          { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 },
        );
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : '';
        const sqlState =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? String(error.meta?.code ?? '')
            : '';
        if (code === 'P2034' || ['40P01', '40001'].includes(sqlState)) {
          if (attempt < 2) continue;
          throw new DomainError(
            503,
            'UNAVAILABLE',
            'Dịch vụ đang bận. Vui lòng thử lại cùng yêu cầu.',
          );
        }
        if (code === 'P2028' || code === 'P2024')
          throw new DomainError(
            503,
            'UNAVAILABLE',
            'Dịch vụ đang bận. Vui lòng thử lại cùng yêu cầu.',
          );
        throw error;
      }
    }
    throw new Error('Unreachable command retry');
  }
}
