import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  ExchangeCancelReason,
  ExchangeCancelledBy,
  ExchangeDoc,
  ListingDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { LedgerService } from '../wallet/ledger.service.js';

@Injectable()
export class ExchangesService {
  private readonly logger = new Logger(ExchangesService.name);

  constructor(
    private readonly commands: MongoCommandService,
    private readonly listings: ListingCommitmentPolicy,
    private readonly ledger: LedgerService,
    private readonly mongo: MongoService,
    private readonly config: ConfigService,
  ) {}

  private async lockListingsOrdered(
    tx: Tx,
    id1: string,
    id2: string,
  ): Promise<{ initListing: ListingDoc; recListing: ListingDoc }> {
    const [firstId, secondId] = id1 < id2 ? [id1, id2] : [id2, id1];
    const first = await this.listings.lock(tx, firstId);
    const second = await this.listings.lock(tx, secondId);
    return {
      initListing: first._id === id1 ? first : second,
      recListing: first._id === id2 ? first : second,
    };
  }

  private async safeReleaseListing(
    tx: Tx,
    exchangeId: string,
    listing: ListingDoc,
  ) {
    if (listing.trade !== 'Reserved') {
      this.logger.warn(
        `[Exchange ${exchangeId}] Listing ${listing._id} is in trade state '${listing.trade}' instead of 'Reserved' during cancellation; skipping release.`,
      );
      return;
    }
    try {
      await this.listings.project(
        tx,
        listing._id,
        listing.version,
        'Reserved',
        'Available',
      );
    } catch (err) {
      this.logger.warn(
        `[Exchange ${exchangeId}] Unexpected error releasing listing ${listing._id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async cancelInternal(
    tx: Tx,
    exchange: ExchangeDoc,
    options: {
      reason: ExchangeCancelReason;
      cancelledBy: ExchangeCancelledBy;
      now: Date;
    },
  ): Promise<ExchangeDoc> {
    const { reason, cancelledBy, now } = options;

    // Only refund and release listings when the exchange had progressed to funding stage.
    // Proposed exchanges have no locked listings and no ledger entries.
    if (exchange.status === 'AcceptedAwaitingFunding') {
      await this.ledger.refundExchange(tx, exchange, now);

      const { initListing, recListing } = await this.lockListingsOrdered(
        tx,
        exchange.initiatorListingId,
        exchange.recipientListingId,
      );

      await this.safeReleaseListing(tx, exchange._id, initListing);
      await this.safeReleaseListing(tx, exchange._id, recListing);
    }

    const next = await tx.c.exchanges.findOneAndUpdate(
      {
        _id: exchange._id,
        revision: exchange.revision,
        status: exchange.status,
      },
      {
        $set: {
          status: 'Cancelled',
          cancelReason: reason,
          cancelledBy,
          cancelledAt: now,
          updatedAt: now,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    return next;
  }

  private async exchange(tx: Tx, id: string) {
    const row = await tx.c.exchanges.findOne({ _id: id });
    if (!row) throw notFound();
    return row;
  }

  private participant(row: ExchangeDoc, userId: string) {
    if (row.initiatorId !== userId && row.recipientId !== userId) {
      throw notFound();
    }
  }

  private view(row: ExchangeDoc): Wire['Exchange'] {
    return {
      id: row._id,
      initiatorId: row.initiatorId,
      recipientId: row.recipientId,
      initiatorListingId: row.initiatorListingId,
      recipientListingId: row.recipientListingId,
      status: row.status as Wire['ExchangeStatus'],
      revision: row.revision,
      initiatorDeposit: row.initiatorDeposit,
      recipientDeposit: row.recipientDeposit,
      diffAmount: row.diffAmount,
      diffPayerId: row.diffPayerId,
      fundingDeadline: row.fundingDeadline?.toISOString() ?? null,
      initiatorFundedAt: row.initiatorFundedAt?.toISOString() ?? null,
      recipientFundedAt: row.recipientFundedAt?.toISOString() ?? null,
      proposalExpiresAt: row.proposalExpiresAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason ?? null,
      cancelReason: row.cancelReason ?? null,
      cancelledBy: row.cancelledBy ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      initiatorShippedAt: row.initiatorShippedAt?.toISOString() ?? null,
      recipientShippedAt: row.recipientShippedAt?.toISOString() ?? null,
      initiatorReceivedAt: row.initiatorReceivedAt?.toISOString() ?? null,
      recipientReceivedAt: row.recipientReceivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  create(context: CommandContext, body: Wire['CreateExchangeProposal']) {
    const proposalTtlHours = Number(
      this.config.get('EXCHANGE_PROPOSAL_TTL_HOURS') ?? 72,
    );

    return this.commands.runExchange(
      context,
      'createExchangeProposal',
      null,
      body,
      {
        discover: async (tx) => {
          const initiatorListing = await tx.c.listings.findOne({
            _id: body.initiatorListingId,
          });
          const recipientListing = await tx.c.listings.findOne({
            _id: body.recipientListingId,
          });
          return [
            initiatorListing?.ownerId,
            recipientListing?.ownerId,
          ].filter(Boolean) as string[];
        },
        authorize: async (tx, actor) => {
          member(actor);
          const initiatorListing = await tx.c.listings.findOne({
            _id: body.initiatorListingId,
          });
          const recipientListing = await tx.c.listings.findOne({
            _id: body.recipientListingId,
          });
          if (!initiatorListing || !recipientListing) throw notFound();
          return { initiatorListing, recipientListing };
        },
        mutate: async (tx, actor, { initiatorListing, recipientListing }) => {
          requireActive(actor);
          if (
            initiatorListing.ownerId !== actor._id ||
            recipientListing.ownerId === actor._id
          ) {
            throw invalidState();
          }

          if (
            initiatorListing.trade !== 'Available' ||
            recipientListing.trade !== 'Available' ||
            initiatorListing.moderation !== 'Approved' ||
            recipientListing.moderation !== 'Approved' ||
            initiatorListing.visibility !== 'Visible' ||
            recipientListing.visibility !== 'Visible'
          ) {
            throw invalidState();
          }

          const initiatorRev = await tx.c.listing_revisions.findOne({
            _id: initiatorListing.currentRevisionId!,
          });
          const recipientRev = await tx.c.listing_revisions.findOne({
            _id: recipientListing.currentRevisionId!,
          });

          if (!initiatorRev || !recipientRev) throw invalidState();

          if (
            !['Exchange', 'Both'].includes(initiatorRev.mode ?? '') ||
            !['Exchange', 'Both'].includes(recipientRev.mode ?? '')
          ) {
            throw invalidState();
          }

          const initiatorValue = initiatorRev.exchangeValue ?? 0;
          const recipientValue = recipientRev.exchangeValue ?? 0;

          const diffAmount = Math.abs(initiatorValue - recipientValue);
          let diffPayerId: string | null = null;
          if (initiatorValue < recipientValue) {
            diffPayerId = actor._id;
          } else if (initiatorValue > recipientValue) {
            diffPayerId = recipientListing.ownerId;
          }

          const now = await tx.now();
          const proposalExpiresAt = new Date(
            now.getTime() + proposalTtlHours * 3_600_000,
          );
          const row: ExchangeDoc = {
            _id: randomUUID(),
            initiatorId: actor._id,
            recipientId: recipientListing.ownerId,
            initiatorListingId: initiatorListing._id,
            recipientListingId: recipientListing._id,
            status: 'Proposed',
            revision: 1,
            initiatorDeposit: recipientValue,
            recipientDeposit: initiatorValue,
            diffAmount,
            diffPayerId,
            initiatorOrderId: randomUUID(),
            recipientOrderId: randomUUID(),
            fundingDeadline: null,
            initiatorFundedAt: null,
            recipientFundedAt: null,
            proposalExpiresAt,
            rejectionReason: null,
            cancelReason: null,
            cancelledBy: null,
            cancelledAt: null,
            initiatorShippedAt: null,
            recipientShippedAt: null,
            initiatorReceivedAt: null,
            recipientReceivedAt: null,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          };

          await tx.c.exchanges.insertOne(row);

          return {
            entityType: 'Exchange',
            entityId: row._id,
            initiatorListingId: row.initiatorListingId,
            version: row.revision,
            state: row.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event: 'ExchangeProposed',
            exchange: this.view(row),
          };
        },
      },
    );
  }

  list(auth: Actor) {
    return this.commands.read(auth, async (tx, actor) => {
      const rows = await tx.c.exchanges
        .find(
          { $or: [{ initiatorId: actor._id }, { recipientId: actor._id }] },
          { sort: { updatedAt: -1, _id: -1 }, limit: 100 },
        )
        .toArray();
      return { items: rows.map((r) => this.view(r)), nextCursor: null };
    });
  }

  getExchange(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      const row = await this.exchange(tx, id);
      this.participant(row, actor._id);
      return this.view(row);
    });
  }

  accept(context: CommandContext, id: string, body: Wire['AcceptExchange']) {
    return this.commands.runExchange(context, 'acceptExchange', id, body, {
      discover: async (tx) => {
        const exchange = await tx.c.exchanges.findOne({ _id: id });
        return [exchange?.initiatorId, exchange?.recipientId].filter(
          Boolean,
        ) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, initialExchange) => {
        requireActive(actor);
        this.participant(initialExchange, actor._id);

        await tx.lock('exchanges', [initialExchange._id]);
        const exchange = await this.exchange(tx, initialExchange._id);

        if (exchange.recipientId !== actor._id) {
          throw conflict();
        }
        if (exchange.status !== 'Proposed') {
          throw invalidState();
        }
        if (exchange.revision !== body.revision) {
          throw conflict();
        }

        const now = await tx.now();
        // Reject accept() when the proposal deadline has already passed,
        // even if the worker hasn't swept it yet.
        if (exchange.proposalExpiresAt && now >= exchange.proposalExpiresAt) {
          throw invalidState();
        }

        const { initListing, recListing } = await this.lockListingsOrdered(
          tx,
          exchange.initiatorListingId,
          exchange.recipientListingId,
        );
        if (
          initListing.trade !== 'Available' ||
          recListing.trade !== 'Available'
        ) {
          throw invalidState();
        }

        // Project both listings from Available to Reserved
        await this.listings.project(
          tx,
          initListing._id,
          initListing.version,
          'Available',
          'Reserved',
        );
        await this.listings.project(
          tx,
          recListing._id,
          recListing.version,
          'Available',
          'Reserved',
        );

        // Cancel any competing proposals for either listing
        await tx.c.exchanges.updateMany(
          {
            _id: { $ne: exchange._id },
            status: 'Proposed',
            $or: [
              { initiatorListingId: { $in: [initListing._id, recListing._id] } },
              { recipientListingId: { $in: [initListing._id, recListing._id] } },
            ],
          },
          {
            $set: {
              status: 'Cancelled',
              rejectionReason: 'Listing no longer available',
              cancelReason: 'ListingUnavailable',
              cancelledBy: 'System',
              cancelledAt: now,
              updatedAt: now,
            },
            $inc: { revision: 1 },
          },
        );

        // 24-hour funding deadline per POL-05
        const fundingDeadline = new Date(now.getTime() + 24 * 3600_000);

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
          {
            $set: {
              status: 'AcceptedAwaitingFunding',
              fundingDeadline,
              updatedAt: now,
            },
            $inc: { revision: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
          initiatorListingId: next.initiatorListingId,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeAccepted',
          exchange: this.view(next),
        };
      },
    });
  }

  fund(context: CommandContext, id: string) {
    return this.commands.runExchange(context, 'fundExchange', id, {}, {
      discover: async (tx) => {
        const exchange = await tx.c.exchanges.findOne({ _id: id });
        return [exchange?.initiatorId, exchange?.recipientId].filter(
          Boolean,
        ) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, initialExchange) => {
        requireActive(actor);
        this.participant(initialExchange, actor._id);

        await tx.lock('exchanges', [initialExchange._id]);
        const exchange = await this.exchange(tx, initialExchange._id);

        if (exchange.status !== 'AcceptedAwaitingFunding') {
          throw invalidState();
        }
        if (exchange.revision !== initialExchange.revision) {
          throw conflict();
        }

        const now = await tx.now();
        if (exchange.fundingDeadline && now > exchange.fundingDeadline) {
          throw invalidState();
        }

        const isInitiator = actor._id === exchange.initiatorId;
        if (isInitiator && exchange.initiatorFundedAt) {
          throw invalidState();
        }
        if (!isInitiator && exchange.recipientFundedAt) {
          throw invalidState();
        }
        const baseDeposit = isInitiator
          ? exchange.initiatorDeposit
          : exchange.recipientDeposit;
        const diff = exchange.diffPayerId === actor._id ? exchange.diffAmount : 0;
        const amountToPay = baseDeposit + diff;
        const orderId = isInitiator
          ? exchange.initiatorOrderId
          : exchange.recipientOrderId;

        if (amountToPay > 0) {
          const accounts = await this.ledger.lockOrder(
            tx,
            actor._id,
            orderId,
            true,
          );
          await this.ledger.postOrder(
            tx,
            orderId,
            randomUUID(),
            accounts,
            amountToPay,
            now,
            false,
          );
        }

        const bothFunded = isInitiator
          ? Boolean(exchange.recipientFundedAt)
          : Boolean(exchange.initiatorFundedAt);

        const updateSet: Record<string, unknown> = {
          updatedAt: now,
        };
        if (isInitiator) {
          updateSet.initiatorFundedAt = now;
        } else {
          updateSet.recipientFundedAt = now;
        }
        if (bothFunded) {
          updateSet.status = 'Preparing';
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          {
            _id: exchange._id,
            revision: exchange.revision,
            status: 'AcceptedAwaitingFunding',
          },
          { $set: updateSet, $inc: { revision: 1 } },
          { returnDocument: 'after' },
        );

        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
          initiatorListingId: next.initiatorListingId,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeFunded',
          exchange: this.view(next),
        };
      },
    });
  }

  cancel(context: CommandContext, id: string, body: Wire['VersionCommand']) {
    return this.commands.runExchange(context, 'cancelExchange', id, body, {
      discover: async (tx) => {
        const exchange = await tx.c.exchanges.findOne({ _id: id });
        return [exchange?.initiatorId, exchange?.recipientId].filter(
          Boolean,
        ) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, initialExchange) => {
        requireActive(actor);
        this.participant(initialExchange, actor._id);

        await tx.lock('exchanges', [initialExchange._id]);
        const exchange = await this.exchange(tx, initialExchange._id);

        if (
          exchange.status !== 'Proposed' &&
          exchange.status !== 'AcceptedAwaitingFunding'
        ) {
          throw invalidState();
        }
        if (exchange.revision !== body.expectedVersion) {
          throw conflict();
        }

        const now = await tx.now();
        const cancelledBy: ExchangeCancelledBy =
          actor._id === exchange.initiatorId ? 'Initiator' : 'Recipient';

        if (exchange.status === 'Proposed') {
          if (exchange.initiatorId !== actor._id) throw conflict();
          const next = await this.cancelInternal(tx, exchange, {
            reason: 'CancelledByUser',
            cancelledBy: 'Initiator',
            now,
          });

          return {
            entityType: 'Exchange',
            entityId: next._id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event: 'ExchangeCancelled',
            exchange: this.view(next),
          };
        }

        if (exchange.status === 'AcceptedAwaitingFunding') {
          const next = await this.cancelInternal(tx, exchange, {
            reason: 'CancelledByUser',
            cancelledBy,
            now,
          });

          return {
            entityType: 'Exchange',
            entityId: next._id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event: 'ExchangeCancelled',
            exchange: this.view(next),
          };
        }

        throw invalidState();
      },
    });
  }

  reject(
    context: CommandContext,
    id: string,
    body: Wire['RejectExchangeCommand'],
  ) {
    return this.commands.runExchange(context, 'rejectExchange', id, body, {
      discover: async (tx) => {
        const exchange = await tx.c.exchanges.findOne({ _id: id });
        return [exchange?.initiatorId, exchange?.recipientId].filter(
          Boolean,
        ) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, initialExchange) => {
        requireActive(actor);

        // Lock then re-read to get a fresh snapshot (race with expiry worker).
        await tx.lock('exchanges', [initialExchange._id]);
        const exchange = await this.exchange(tx, initialExchange._id);

        if (exchange.recipientId !== actor._id) {
          throw conflict();
        }
        if (exchange.status !== 'Proposed') {
          throw invalidState();
        }
        if (exchange.revision !== body.expectedVersion) {
          throw conflict();
        }

        const now = await tx.now();
        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
          {
            $set: {
              status: 'Cancelled',
              rejectionReason: body.reason,
              updatedAt: now,
            },
            $inc: { revision: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
          initiatorListingId: next.initiatorListingId,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeRejected',
          exchange: this.view(next),
        };
      },
    });
  }

  ship(context: CommandContext, id: string, body: Wire['VersionCommand']) {
    return this.commands.runExchange(context, 'shipExchange', id, body, {
      discover: async (tx) => {
        const exchange = await tx.c.exchanges.findOne({ _id: id });
        return [exchange?.initiatorId, exchange?.recipientId].filter(
          Boolean,
        ) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, exchange) => {
        requireActive(actor);
        this.participant(exchange, actor._id);

        if (
          !['Preparing', 'InTransit'].includes(exchange.status) ||
          exchange.revision !== body.expectedVersion
        ) {
          throw conflict();
        }

        const isInitiator = exchange.initiatorId === actor._id;
        if (
          (isInitiator && exchange.initiatorShippedAt) ||
          (!isInitiator && exchange.recipientShippedAt)
        ) {
          throw invalidState();
        }

        const now = await tx.now();
        const setFields: Record<string, unknown> = { updatedAt: now };
        if (isInitiator) setFields.initiatorShippedAt = now;
        else setFields.recipientShippedAt = now;

        const willBeBothShipped =
          (isInitiator
            ? exchange.recipientShippedAt
            : exchange.initiatorShippedAt) != null;
        if (willBeBothShipped && exchange.status === 'Preparing') {
          setFields.status = 'InTransit';
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision },
          { $set: setFields, $inc: { revision: 1 } },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
          initiatorListingId: next.initiatorListingId,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeShipped',
          exchange: this.view(next),
        };
      },
    });
  }

  receive(context: CommandContext, id: string, body: Wire['VersionCommand']) {
    return this.commands.runExchange(context, 'receiveExchange', id, body, {
      discover: async (tx) => {
        const exchange = await tx.c.exchanges.findOne({ _id: id });
        return [exchange?.initiatorId, exchange?.recipientId].filter(
          Boolean,
        ) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, exchange) => {
        requireActive(actor);
        this.participant(exchange, actor._id);

        if (
          !['InTransit', 'Delivered'].includes(exchange.status) ||
          exchange.revision !== body.expectedVersion
        ) {
          throw conflict();
        }

        const isInitiator = exchange.initiatorId === actor._id;
        if (
          (isInitiator && exchange.initiatorReceivedAt) ||
          (!isInitiator && exchange.recipientReceivedAt)
        ) {
          throw invalidState();
        }

        const now = await tx.now();
        const setFields: Record<string, unknown> = { updatedAt: now };
        if (isInitiator) setFields.initiatorReceivedAt = now;
        else setFields.recipientReceivedAt = now;

        const willBeBothReceived =
          (isInitiator
            ? exchange.recipientReceivedAt
            : exchange.initiatorReceivedAt) != null;

        if (willBeBothReceived) {
          setFields.status = 'Completed';

          // Settle holds: release deposits back to owners, transfer diffAmount
          const updatedForSettlement: ExchangeDoc = {
            ...exchange,
            status: 'Completed',
            initiatorReceivedAt: isInitiator ? now : exchange.initiatorReceivedAt,
            recipientReceivedAt: !isInitiator ? now : exchange.recipientReceivedAt,
          };
          await this.ledger.settleExchange(tx, updatedForSettlement, now);

          // Project listings from Reserved to Exchanged
          const { initListing, recListing } = await this.lockListingsOrdered(
            tx,
            exchange.initiatorListingId,
            exchange.recipientListingId,
          );
          await this.listings.project(
            tx,
            initListing._id,
            initListing.version,
            'Reserved',
            'Exchanged',
          );
          await this.listings.project(
            tx,
            recListing._id,
            recListing.version,
            'Reserved',
            'Exchanged',
          );
        } else if (exchange.status === 'InTransit') {
          setFields.status = 'Delivered';
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision },
          { $set: setFields, $inc: { revision: 1 } },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
          initiatorListingId: next.initiatorListingId,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeReceived',
          exchange: this.view(next),
        };
      },
    });
  }

  async expireExchange(id: string, nowOverride?: Date) {
    return this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [id]);
      const exchange = await tx.c.exchanges.findOne({ _id: id });
      if (!exchange) return null;

      const now = nowOverride ?? (await tx.now());
      if (
        exchange.status !== 'AcceptedAwaitingFunding' ||
        !exchange.fundingDeadline ||
        exchange.fundingDeadline >= now
      ) {
        return null;
      }

      const next = await this.cancelInternal(tx, exchange, {
        reason: 'FundingExpired',
        cancelledBy: 'System',
        now,
      });

      return {
        exchange: this.view(next),
        refundedInitiator: Boolean(exchange.initiatorFundedAt),
        refundedRecipient: Boolean(exchange.recipientFundedAt),
      };
    });
  }

  async expireProposal(id: string, nowOverride?: Date) {
    return this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [id]);
      const exchange = await tx.c.exchanges.findOne({ _id: id });
      if (!exchange) return null;

      const now = nowOverride ?? (await tx.now());
      // Re-check under lock: status must still be Proposed and deadline must have passed.
      if (
        exchange.status !== 'Proposed' ||
        !exchange.proposalExpiresAt ||
        exchange.proposalExpiresAt > now
      ) {
        // Already accepted/rejected/cancelled by another path, or not yet expired — skip safely.
        return null;
      }

      const next = await this.cancelInternal(tx, exchange, {
        reason: 'ProposalExpired',
        cancelledBy: 'System',
        now,
      });

      this.logger.log(
        JSON.stringify({
          event: 'exchangeProposalExpired',
          exchangeId: exchange._id,
          status: 'Cancelled',
        }),
      );

      return { exchange: this.view(next) };
    });
  }
}
