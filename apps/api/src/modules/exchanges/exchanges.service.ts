import { ConversationAgreementsService } from '../purchases/conversation-agreements.service.js';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  ExchangeAddressSnapshot,
  ExchangeCancelReason,
  ExchangeCancelledBy,
  ExchangeDoc,
  ExchangeShipmentSnapshot,
  ListingDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import {
  MongoCommandService,
  member,
  requireActive,
  staff,
  type Actor,
  type CommandContext,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { requireMarketplace } from '../listings/listing-channel.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { notifyExchange } from './exchange-notifications.js';

@Injectable()
export class ExchangesService {
  private readonly logger = new Logger(ExchangesService.name);

  constructor(
    private readonly agreements: ConversationAgreementsService,
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

  private getInitiatorListingIds(exchange: ExchangeDoc): string[] {
    return exchange.initiatorListingIds && exchange.initiatorListingIds.length > 0
      ? exchange.initiatorListingIds
      : [exchange.initiatorListingId];
  }

  private async lockAllListingsOrdered(
    tx: Tx,
    ids: string[],
  ): Promise<Map<string, ListingDoc>> {
    const sortedUnique = Array.from(new Set(ids)).sort();
    const map = new Map<string, ListingDoc>();
    for (const id of sortedUnique) {
      const doc = await this.listings.lock(tx, id);
      map.set(id, doc);
    }
    return map;
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

    // Only refund and release listings when the exchange had progressed to funding or preparing stage.
    // Proposed exchanges have no locked listings and no ledger entries.
    if (
      exchange.status === 'AcceptedAwaitingFunding' ||
      exchange.status === 'Preparing'
    ) {
      await this.ledger.refundExchange(tx, exchange, now);

      const initIds = this.getInitiatorListingIds(exchange);
      const allIds = [...initIds, exchange.recipientListingId];
      const lockedMap = await this.lockAllListingsOrdered(tx, allIds);

      for (const id of allIds) {
        const listing = lockedMap.get(id);
        if (listing) {
          await this.safeReleaseListing(tx, exchange._id, listing);
        }
      }
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

    let notifyRecipients: string[] = [];
    let reasonText = '';
    if (cancelledBy === 'Initiator') {
      notifyRecipients = [next.recipientId];
      reasonText = 'Người khởi tạo đã hủy giao dịch';
    } else if (cancelledBy === 'Recipient') {
      notifyRecipients = [next.initiatorId];
      reasonText = 'Đối tác đã hủy giao dịch';
    } else if (cancelledBy === 'System') {
      if (reason === 'FundingExpired') {
        notifyRecipients = [next.initiatorId, next.recipientId];
        reasonText = 'Hết thời hạn nạp cọc bảo chứng (24 giờ)';
      } else if (reason === 'ProposalExpired') {
        notifyRecipients = [next.initiatorId];
        reasonText = 'Hết thời hạn chờ phản hồi đề xuất';
      } else if (reason === 'ShippingExpired') {
        notifyRecipients = [next.initiatorId, next.recipientId];
        reasonText = 'Hết thời hạn gửi sách (72 giờ) nhưng không bên nào gửi hàng';
      }
    }

    if (notifyRecipients.length) {
      await notifyExchange(
        tx,
        next,
        'ExchangeCancelled',
        notifyRecipients,
        now,
        { reason: reasonText },
      );
    }

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
      initiatorListingIds: row.initiatorListingIds ?? [row.initiatorListingId],
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
      inspectionDeadline: row.inspectionDeadline?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      initiatorCompletedAt: row.initiatorCompletedAt?.toISOString() ?? null,
      recipientCompletedAt: row.recipientCompletedAt?.toISOString() ?? null,
      initiatorAddress: row.initiatorAddress
        ? {
            recipientName: row.initiatorAddress.recipientName,
            phone: row.initiatorAddress.phone,
            detail: row.initiatorAddress.detail,
            localityCode: row.initiatorAddress.localityCode ?? null,
            serviceAreaCode: row.initiatorAddress.serviceAreaCode ?? null,
          }
        : null,
      recipientAddress: row.recipientAddress
        ? {
            recipientName: row.recipientAddress.recipientName,
            phone: row.recipientAddress.phone,
            detail: row.recipientAddress.detail,
            localityCode: row.recipientAddress.localityCode ?? null,
            serviceAreaCode: row.recipientAddress.serviceAreaCode ?? null,
          }
        : null,
      initiatorShipment: row.initiatorShipment
        ? {
            method: row.initiatorShipment.method,
            carrierCode: row.initiatorShipment.carrierCode ?? null,
            carrierName: row.initiatorShipment.carrierName ?? null,
            trackingCode: row.initiatorShipment.trackingCode ?? null,
            meetupLocation: row.initiatorShipment.meetupLocation ?? null,
            notes: row.initiatorShipment.notes ?? null,
            shippedAt: row.initiatorShipment.shippedAt
              ? new Date(row.initiatorShipment.shippedAt).toISOString()
              : null,
          }
        : null,
      recipientShipment: row.recipientShipment
        ? {
            method: row.recipientShipment.method,
            carrierCode: row.recipientShipment.carrierCode ?? null,
            carrierName: row.recipientShipment.carrierName ?? null,
            trackingCode: row.recipientShipment.trackingCode ?? null,
            meetupLocation: row.recipientShipment.meetupLocation ?? null,
            notes: row.recipientShipment.notes ?? null,
            shippedAt: row.recipientShipment.shippedAt
              ? new Date(row.recipientShipment.shippedAt).toISOString()
              : null,
          }
        : null,
      lastProposedById: row.lastProposedById ?? row.initiatorId,
      shippingDeadline: row.shippingDeadline?.toISOString() ?? null,
      disputedAt: row.disputedAt?.toISOString() ?? null,
      disputeReason: row.disputeReason ?? null,
      disputedBy: row.disputedBy ?? null,
      resolutionDecision: row.resolutionDecision ?? null,
      resolutionReason: row.resolutionReason ?? null,
      resolvedBy: row.resolvedBy ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  create(context: CommandContext, body: Wire['CreateExchangeProposal']) {
    const proposalTtlHours = Number(
      this.config.get('EXCHANGE_PROPOSAL_TTL_HOURS') ?? 72,
    );

    const rawIds = body.initiatorListingIds?.length
      ? body.initiatorListingIds
      : body.initiatorListingId
        ? [body.initiatorListingId]
        : [];
    const initiatorListingIds = Array.from(new Set(rawIds));
    if (initiatorListingIds.length === 0) throw invalidState();
    const primaryInitiatorListingId =
      body.initiatorListingId ?? initiatorListingIds[0];

    return this.commands.runExchange(
      context,
      'createExchangeProposal',
      null,
      body,
      {
        discover: async (tx) => {
          const initiatorListings = await tx.c.listings
            .find({ _id: { $in: initiatorListingIds } })
            .toArray();
          const recipientListing = await tx.c.listings.findOne({
            _id: body.recipientListingId,
          });
          return [
            ...initiatorListings.map((l) => l.ownerId),
            recipientListing?.ownerId,
          ].filter(Boolean) as string[];
        },
        authorize: async (tx, actor) => {
          member(actor);
          const initiatorListings = await tx.c.listings
            .find({ _id: { $in: initiatorListingIds } })
            .toArray();
          const recipientListing = await tx.c.listings.findOne({
            _id: body.recipientListingId,
          });
          if (
            initiatorListings.length !== initiatorListingIds.length ||
            !recipientListing
          ) {
            throw notFound();
          }
          return { initiatorListings, recipientListing };
        },
        mutate: async (tx, actor, { initiatorListings, recipientListing }) => {
          requireActive(actor);
          const conversation = body.conversationId ? await this.agreements.prepareExchange(tx, body.conversationId, body.expectedConversationVersion!, actor._id, recipientListing._id, recipientListing.ownerId) : null;
          if (recipientListing.ownerId === actor._id) {
            throw invalidState('Không thể tự tạo đề xuất trao đổi với chính mình.');
          }

          // POL-23: Giới hạn tối đa 5 đề xuất Proposed mỗi tài khoản
          const maxOpenProposals = Number(
            this.config.get('EXCHANGE_MAX_OPEN_PROPOSALS') ?? 5,
          );
          const openProposalsCount = await tx.c.exchanges.countDocuments({
            initiatorId: actor._id,
            status: 'Proposed',
          });
          if (openProposalsCount >= maxOpenProposals) {
            throw invalidState(
              `Bạn đã đạt giới hạn tối đa ${maxOpenProposals} đề xuất trao đổi đang mở (POL-23). Hãy chờ phản hồi hoặc hủy bớt đề xuất cũ.`,
            );
          }

          // POL-23: Chỉ 1 đề xuất mở cho cùng cặp listing
          const existingSamePair = await tx.c.exchanges.findOne({
            initiatorId: actor._id,
            status: 'Proposed',
            recipientListingId: recipientListing._id,
            $or: [
              { initiatorListingId: { $in: initiatorListingIds } },
              { initiatorListingIds: { $in: initiatorListingIds } },
            ],
          });
          if (existingSamePair) {
            throw invalidState(
              'Bạn đã có một đề xuất trao đổi đang chờ xử lý cho cuốn sách này (POL-23).',
            );
          }

          const reverseSamePair = await tx.c.exchanges.findOne({
            initiatorId: recipientListing.ownerId,
            recipientId: actor._id,
            status: 'Proposed',
            recipientListingId: { $in: initiatorListingIds },
            $or: [
              { initiatorListingId: recipientListing._id },
              { initiatorListingIds: recipientListing._id },
            ],
          });
          if (reverseSamePair) {
            throw invalidState(
              'Đối tác đã gửi một đề xuất trao đổi cho cuốn sách này đang chờ bạn phản hồi (POL-23).',
            );
          }

          for (const initListing of initiatorListings) {
            if (initListing.ownerId !== actor._id) {
              throw invalidState();
            }
            requireMarketplace(initListing);
            if (
              initListing.trade !== 'Available' ||
              initListing.moderation !== 'Approved' ||
              initListing.visibility !== 'Visible'
            ) {
              throw invalidState();
            }
          }

          requireMarketplace(recipientListing);
          if (
            recipientListing.trade !== 'Available' ||
            recipientListing.moderation !== 'Approved' ||
            recipientListing.visibility !== 'Visible'
          ) {
            throw invalidState();
          }

          const initiatorRevIds = initiatorListings.map(
            (l) => l.currentRevisionId!,
          );
          const initiatorRevs = await tx.c.listing_revisions
            .find({ _id: { $in: initiatorRevIds } })
            .toArray();
          const recipientRev = await tx.c.listing_revisions.findOne({
            _id: recipientListing.currentRevisionId!,
          });

          if (
            initiatorRevs.length !== initiatorListings.length ||
            !recipientRev
          ) {
            throw invalidState();
          }

          for (const initRev of initiatorRevs) {
            if (!['Exchange', 'Both'].includes(initRev.mode ?? '')) {
              throw invalidState();
            }
          }

          if (!['Exchange', 'Both'].includes(recipientRev.mode ?? '')) {
            throw invalidState();
          }

          const initiatorValue = initiatorRevs.reduce(
            (sum, r) => sum + (r.exchangeValue ?? 0),
            0,
          );
          const recipientValue = recipientRev.exchangeValue ?? 0;

          const diffAmount = Math.abs(initiatorValue - recipientValue);
          let diffPayerId: string | null = null;
          if (initiatorValue < recipientValue) {
            diffPayerId = actor._id;
          } else if (initiatorValue > recipientValue) {
            diffPayerId = recipientListing.ownerId;
          }

          let initiatorAddress: ExchangeAddressSnapshot | null = null;
          if (body.deliveryAddressId) {
            const addr = await tx.c.member_addresses.findOne({
              _id: body.deliveryAddressId,
              ownerId: actor._id,
            });
            if (addr) {
              initiatorAddress = {
                recipientName: addr.recipientName,
                phone: addr.phone,
                detail: addr.detail,
                localityCode: addr.localityCode ?? null,
                serviceAreaCode: addr.serviceAreaCode ?? null,
              };
            }
          }

          const now = await tx.now();
          const proposalExpiresAt = new Date(
            now.getTime() + proposalTtlHours * 3_600_000,
          );
          const row: ExchangeDoc = {
            _id: randomUUID(),
            initiatorId: actor._id,
            recipientId: recipientListing.ownerId,
            initiatorListingId: primaryInitiatorListingId,
            initiatorListingIds,
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
            shippingDeadline: null,
            initiatorShippedAt: null,
            recipientShippedAt: null,
            initiatorReceivedAt: null,
            recipientReceivedAt: null,
            inspectionDeadline: null,
            disputedAt: null,
            disputeReason: null,
            disputedBy: null,
            completedAt: null,
            initiatorAddress,
            recipientAddress: null,
            initiatorShipment: null,
            recipientShipment: null,
            lastProposedById: actor._id,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          };

          await tx.c.exchanges.insertOne(row);
          if (conversation) await this.agreements.linkExchange(tx, conversation, row._id, actor._id);

          await notifyExchange(
            tx,
            row,
            'ExchangeProposed',
            [row.recipientId],
            now,
          );

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

        const currentProposerId = exchange.lastProposedById ?? exchange.initiatorId;
        if (currentProposerId === actor._id) {
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

        const initIds = this.getInitiatorListingIds(exchange);
        const allIds = [...initIds, exchange.recipientListingId];
        const lockedMap = await this.lockAllListingsOrdered(tx, allIds);

        for (const id of allIds) {
          const listing = lockedMap.get(id);
          if (!listing || listing.trade !== 'Available') {
            throw invalidState();
          }
          requireMarketplace(listing);
        }

        // Project all listings from Available to Reserved
        for (const id of allIds) {
          const listing = lockedMap.get(id)!;
          await this.listings.project(
            tx,
            listing._id,
            listing.version,
            'Available',
            'Reserved',
          );
        }

        // Cancel any competing proposals for any involved listing
        await tx.c.exchanges.updateMany(
          {
            _id: { $ne: exchange._id },
            status: 'Proposed',
            $or: [
              { initiatorListingId: { $in: allIds } },
              { initiatorListingIds: { $in: allIds } },
              { recipientListingId: { $in: allIds } },
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

        const isInitiator = actor._id === exchange.initiatorId;
        let myAddress: ExchangeAddressSnapshot | null = null;
        if (body.deliveryAddressId) {
          const addr = await tx.c.member_addresses.findOne({
            _id: body.deliveryAddressId,
            ownerId: actor._id,
          });
          if (addr) {
            myAddress = {
              recipientName: addr.recipientName,
              phone: addr.phone,
              detail: addr.detail,
              localityCode: addr.localityCode ?? null,
              serviceAreaCode: addr.serviceAreaCode ?? null,
            };
          }
        }

        const setFields: Record<string, unknown> = {
          status: 'AcceptedAwaitingFunding',
          fundingDeadline,
          updatedAt: now,
        };
        if (myAddress) {
          if (isInitiator) {
            setFields.initiatorAddress = myAddress;
          } else {
            setFields.recipientAddress = myAddress;
          }
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
          {
            $set: setFields,
            $inc: { revision: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        await notifyExchange(
          tx,
          next,
          'ExchangeAccepted',
          [next.initiatorId, next.recipientId],
          now,
        );

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

  counter(
    context: CommandContext,
    id: string,
    body: Wire['CounterExchangeProposal'],
  ) {
    return this.commands.runExchange(
      context,
      'counterExchangeProposal',
      id,
      body,
      {
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

          const exchange = await this.exchange(tx, initialExchange._id);

          if (exchange.status !== 'Proposed') {
            throw invalidState();
          }
          if (exchange.revision !== body.expectedVersion) {
            throw conflict();
          }

          const now = await tx.now();
          if (exchange.proposalExpiresAt && now >= exchange.proposalExpiresAt) {
            throw invalidState();
          }

          let diffPayerId: string | null = null;
          if (body.diffPayer === 'initiator') {
            diffPayerId = exchange.initiatorId;
          } else if (body.diffPayer === 'recipient') {
            diffPayerId = exchange.recipientId;
          }

          let updatedAddress: ExchangeAddressSnapshot | null = null;
          if (body.deliveryAddressId) {
            const addr = await tx.c.member_addresses.findOne({
              _id: body.deliveryAddressId,
              ownerId: actor._id,
            });
            if (addr) {
              updatedAddress = {
                recipientName: addr.recipientName,
                phone: addr.phone,
                detail: addr.detail,
                localityCode: addr.localityCode ?? null,
                serviceAreaCode: addr.serviceAreaCode ?? null,
              };
            }
          }

          const isInitiator = actor._id === exchange.initiatorId;
          const setFields: Record<string, unknown> = {
            diffAmount: body.diffAmount,
            diffPayerId,
            lastProposedById: actor._id,
            updatedAt: now,
          };
          if (updatedAddress) {
            if (isInitiator) {
              setFields.initiatorAddress = updatedAddress;
            } else {
              setFields.recipientAddress = updatedAddress;
            }
          }

          const next = await tx.c.exchanges.findOneAndUpdate(
            { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
            {
              $set: setFields,
              $inc: { revision: 1 },
            },
            { returnDocument: 'after' },
          );
          if (!next) throw conflict();

          // Also insert a notification in exchange_messages so both parties see it in chat
          const payerLabel =
            body.diffPayer === 'none'
              ? 'Đổi ngang giá (không bù tiền)'
              : (body.diffPayer === (isInitiator ? 'initiator' : 'recipient')
                  ? 'Tôi bù thêm '
                  : 'Đối tác bù thêm ') +
                body.diffAmount.toLocaleString('vi-VN') +
                ' đ';
          const addressPart = updatedAddress
            ? `\n• Địa chỉ nhận mới: ${updatedAddress.recipientName} - ${updatedAddress.phone}, ${updatedAddress.detail} (${updatedAddress.localityCode ?? 'TP.HCM'})`
            : '';
          const notePart = body.note?.trim()
            ? `\nLời nhắn: ${body.note.trim()}`
            : '';
          await tx.c.exchange_messages.insertOne({
            _id: randomUUID(),
            exchangeId: exchange._id,
            senderId: actor._id,
            body: `[Đề xuất lại điều khoản]\n• Tiền bù: ${payerLabel}${addressPart}${notePart}`,
            sentAt: now,
          });

          return {
            entityType: 'Exchange',
            entityId: next._id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event: 'ExchangeCounterProposed',
            exchange: this.view(next),
          };
        },
      },
    );
  }

  getMessages(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      const exchange = await this.exchange(tx, id);
      this.participant(exchange, actor._id);
      const rows = await tx.c.exchange_messages
        .find({ exchangeId: id }, { sort: { sentAt: 1, _id: 1 }, limit: 500 })
        .toArray();
      return {
        items: rows.map((m) => ({
          id: m._id,
          exchangeId: m.exchangeId,
          senderId: m.senderId,
          body: m.body,
          sentAt: m.sentAt.toISOString(),
        })),
      };
    });
  }

  sendMessage(
    auth: Actor,
    id: string,
    body: Wire['CreateExchangeMessage'],
  ) {
    return this.commands.read(auth, async (tx, actor) => {
      const text = body.body.trim();
      if (!text || [...text].length > 1000) throw invalidState();

      const exchange = await this.exchange(tx, id);
      this.participant(exchange, actor._id);

      const now = await tx.now();
      const messageId = randomUUID();
      await tx.c.exchange_messages.insertOne({
        _id: messageId,
        exchangeId: exchange._id,
        senderId: actor._id,
        body: text,
        sentAt: now,
      });

      return {
        id: messageId,
        exchangeId: exchange._id,
        senderId: actor._id,
        body: text,
        sentAt: now.toISOString(),
      };
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
          const shippingHours = Number(
            this.config.get('EXCHANGE_SHIPPING_HOURS') ?? 72,
          );
          updateSet.shippingDeadline = new Date(
            now.getTime() + shippingHours * 3600_000,
          );
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

        const otherUserId = isInitiator
          ? exchange.recipientId
          : exchange.initiatorId;
        await notifyExchange(tx, next, 'ExchangeFunded', [otherUserId], now);

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
          exchange.status !== 'AcceptedAwaitingFunding' &&
          exchange.status !== 'Preparing'
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

        if (exchange.status === 'Preparing') {
          if (exchange.initiatorShippedAt || exchange.recipientShippedAt) {
            throw invalidState();
          }
          if (!exchange.shippingDeadline || now < exchange.shippingDeadline) {
            throw invalidState();
          }
          const next = await this.cancelInternal(tx, exchange, {
            reason: 'ShippingExpired',
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

        await notifyExchange(
          tx,
          next,
          'ExchangeRejected',
          [next.initiatorId],
          now,
          { reason: body.reason },
        );

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

  ship(context: CommandContext, id: string, body: Wire['ShipExchangeCommand']) {
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
        const shipmentSnapshot: ExchangeShipmentSnapshot = {
          method: (body.method as 'carrier' | 'direct') ?? 'carrier',
          carrierCode: body.carrierCode ?? null,
          carrierName: body.carrierName ?? null,
          trackingCode: body.trackingCode ?? null,
          meetupLocation: body.meetupLocation ?? null,
          notes: body.notes ?? null,
          shippedAt: now,
        };

        if (isInitiator) {
          setFields.initiatorShippedAt = now;
          setFields.initiatorShipment = shipmentSnapshot;
        } else {
          setFields.recipientShippedAt = now;
          setFields.recipientShipment = shipmentSnapshot;
        }

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

        const otherUserId = isInitiator
          ? exchange.recipientId
          : exchange.initiatorId;
        await notifyExchange(tx, next, 'ExchangeShipped', [otherUserId], now, {
          trackingCode: body.trackingCode ?? undefined,
        });

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
          const inspectionHours = Number(
            this.config.get('EXCHANGE_INSPECTION_HOURS') ?? 48,
          );
          setFields.status = 'Delivered';
          setFields.inspectionDeadline = new Date(
            now.getTime() + inspectionHours * 3_600_000,
          );
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision },
          { $set: setFields, $inc: { revision: 1 } },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        const otherUserId = isInitiator
          ? exchange.recipientId
          : exchange.initiatorId;
        await notifyExchange(tx, next, 'ExchangeReceived', [otherUserId], now);

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

  complete(context: CommandContext, id: string, body: Wire['VersionCommand']) {
    return this.commands.runExchange<ExchangeDoc>(context, 'completeExchange', id, body, {
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
          exchange.status !== 'Delivered' ||
          !exchange.initiatorReceivedAt ||
          !exchange.recipientReceivedAt
        ) {
          throw invalidState();
        }
        if (exchange.revision !== body.expectedVersion) {
          throw conflict();
        }

        const isInitiator = exchange.initiatorId === actor._id;
        if (
          (isInitiator && exchange.initiatorCompletedAt) ||
          (!isInitiator && exchange.recipientCompletedAt)
        ) {
          throw invalidState();
        }

        const now = await tx.now();
        const setFields: Record<string, unknown> = { updatedAt: now };
        if (isInitiator) {
          setFields.initiatorCompletedAt = now;
        } else {
          setFields.recipientCompletedAt = now;
        }

        const willBeBothCompleted =
          (isInitiator
            ? exchange.recipientCompletedAt
            : exchange.initiatorCompletedAt) != null;

        if (willBeBothCompleted) {
          setFields.status = 'Completed';
          setFields.completedAt = now;

          const updatedForSettlement: ExchangeDoc = {
            ...exchange,
            ...setFields,
            status: 'Completed',
            completedAt: now,
          };
          await this.ledger.settleExchange(tx, updatedForSettlement, now);

          const initIds = this.getInitiatorListingIds(exchange);
          const allIds = [...initIds, exchange.recipientListingId];
          const lockedMap = await this.lockAllListingsOrdered(tx, allIds);
          for (const id of allIds) {
            const listing = lockedMap.get(id)!;
            await this.listings.project(
              tx,
              listing._id,
              listing.version,
              'Reserved',
              'Exchanged',
            );
          }
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision, status: 'Delivered' },
          {
            $set: setFields,
            $inc: { revision: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!next) throw conflict();

        if (willBeBothCompleted) {
          await notifyExchange(
            tx,
            next,
            'ExchangeCompleted',
            [next.initiatorId, next.recipientId],
            now,
          );
        }

        return {
          entityType: 'Exchange',
          entityId: next._id,
          initiatorListingId: next.initiatorListingId,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: willBeBothCompleted ? 'ExchangeCompleted' : 'ExchangeInspected',
          exchange: this.view(next),
        };
      },
    });
  }

  async expireInspection(id: string, nowOverride?: Date) {
    return this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [id]);
      const exchange = await tx.c.exchanges.findOne({ _id: id });
      if (!exchange) return null;

      const now = nowOverride ?? (await tx.now());
      if (
        exchange.status !== 'Delivered' ||
        !exchange.initiatorReceivedAt ||
        !exchange.recipientReceivedAt ||
        !exchange.inspectionDeadline ||
        exchange.inspectionDeadline > now
      ) {
        return null;
      }

      const updatedForSettlement: ExchangeDoc = {
        ...exchange,
        status: 'Completed',
        completedAt: now,
      };
      await this.ledger.settleExchange(tx, updatedForSettlement, now);

      const initIds = this.getInitiatorListingIds(exchange);
      const allIds = [...initIds, exchange.recipientListingId];
      const lockedMap = await this.lockAllListingsOrdered(tx, allIds);
      for (const id of allIds) {
        const listing = lockedMap.get(id)!;
        await this.listings.project(
          tx,
          listing._id,
          listing.version,
          'Reserved',
          'Exchanged',
        );
      }

      const next = await tx.c.exchanges.findOneAndUpdate(
        { _id: exchange._id, revision: exchange.revision, status: 'Delivered' },
        {
          $set: {
            status: 'Completed',
            completedAt: now,
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!next) return null;

      await notifyExchange(
        tx,
        next,
        'ExchangeCompleted',
        [next.initiatorId, next.recipientId],
        now,
      );

      this.logger.log(
        JSON.stringify({
          event: 'exchangeInspectionCompleted',
          exchangeId: exchange._id,
          status: 'Completed',
        }),
      );

      return { exchange: this.view(next) };
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

  dispute(
    context: CommandContext,
    id: string,
    body: Wire['DisputeExchangeCommand'],
  ) {
    return this.commands.runExchange<ExchangeDoc>(
      context,
      'disputeExchange',
      id,
      body,
      {
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

          if (!['InTransit', 'Delivered'].includes(exchange.status)) {
            throw invalidState();
          }
          if (exchange.revision !== body.expectedVersion) {
            throw conflict();
          }

          const now = await tx.now();
          const next = await tx.c.exchanges.findOneAndUpdate(
            { _id: exchange._id, revision: exchange.revision },
            {
              $set: {
                status: 'ResolutionPending',
                disputedAt: now,
                disputeReason: body.reason.trim(),
                disputedBy: actor._id,
                updatedAt: now,
              },
              $inc: { revision: 1 },
            },
            { returnDocument: 'after' },
          );
          if (!next) throw conflict();

          const otherUserId =
            actor._id === exchange.initiatorId
              ? exchange.recipientId
              : exchange.initiatorId;

          await notifyExchange(
            tx,
            next,
            'ExchangeDisputed',
            [otherUserId],
            now,
            { reason: body.reason.trim() },
          );

          await tx.c.exchange_messages.insertOne({
            _id: randomUUID(),
            exchangeId: exchange._id,
            senderId: actor._id,
            body: `[Khiếu nại / Báo sự cố]\nLý do: ${body.reason.trim()}\nGiao dịch đã được chuyển sang trạng thái chờ giải quyết tranh chấp. Tiền cọc được tạm khóa an toàn.`,
            sentAt: now,
          });

          this.logger.log(
            JSON.stringify({
              event: 'exchangeDisputed',
              exchangeId: exchange._id,
              disputedBy: actor._id,
              reason: body.reason.trim(),
            }),
          );

          return {
            entityType: 'Exchange',
            entityId: next._id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event: 'ExchangeDisputed',
            exchange: this.view(next),
          };
        },
      },
    );
  }

  listResolutions(auth: Actor) {
    return this.commands.read(auth, async (tx, actor) => {
      staff(actor);
      const rows = await tx.c.exchanges
        .find({ status: 'ResolutionPending' })
        .sort({ disputedAt: -1, updatedAt: -1 })
        .toArray();
      return rows.map((r) => this.view(r));
    });
  }

  resolveDispute(
    context: CommandContext,
    id: string,
    body: Wire['ResolveExchangeDisputeCommand'],
  ) {
    return this.commands.runExchange<ExchangeDoc>(
      context,
      'resolveExchangeDispute',
      id,
      body,
      {
        discover: async (tx) => {
          const exchange = await tx.c.exchanges.findOne({ _id: id });
          return [exchange?.initiatorId, exchange?.recipientId].filter(
            Boolean,
          ) as string[];
        },
        authorize: async (tx, actor) => {
          staff(actor);
          return this.exchange(tx, id);
        },
        mutate: async (tx, actor, initialExchange) => {
          requireActive(actor);
          staff(actor);

          if (!body.decision || !['RefundBoth', 'CompleteExchange'].includes(body.decision)) {
            invalidField('/decision', 'Quyết định phân xử phải là RefundBoth hoặc CompleteExchange.');
          }
          if (!body.reason || body.reason.trim().length < 5 || body.reason.trim().length > 500) {
            invalidField('/reason', 'Lý do phân xử phải từ 5 đến 500 ký tự.');
          }

          await tx.lock('exchanges', [initialExchange._id]);
          const exchange = await this.exchange(tx, initialExchange._id);

          if (exchange.status !== 'ResolutionPending') {
            throw invalidState('Chỉ có thể giải quyết khiếu nại cho giao dịch đang ở trạng thái ResolutionPending.');
          }
          if (exchange.revision !== body.expectedVersion) {
            throw conflict();
          }

          const now = await tx.now();
          const trimmedReason = body.reason.trim();

          let next: ExchangeDoc | null = null;

          if (body.decision === 'RefundBoth') {
            // 1. Hoàn tiền cọc và tiền chênh lệch cho cả 2 bên theo số dư bảo chứng
            await this.ledger.refundExchange(tx, exchange, now);

            // 2. Mở khóa giải phóng sách trở lại Available
            const initIds = this.getInitiatorListingIds(exchange);
            const allIds = [...initIds, exchange.recipientListingId];
            const lockedMap = await this.lockAllListingsOrdered(tx, allIds);
            for (const listingId of allIds) {
              const listing = lockedMap.get(listingId);
              if (listing) {
                await this.safeReleaseListing(tx, exchange._id, listing);
              }
            }

            // 3. Cập nhật trạng thái Cancelled do phán quyết giải quyết tranh chấp
            next = await tx.c.exchanges.findOneAndUpdate(
              { _id: exchange._id, revision: exchange.revision, status: 'ResolutionPending' },
              {
                $set: {
                  status: 'Cancelled',
                  cancelReason: 'DisputeResolvedRefund',
                  cancelledBy: 'Staff',
                  cancelledAt: now,
                  resolutionDecision: 'RefundBoth',
                  resolutionReason: trimmedReason,
                  resolvedBy: actor._id,
                  resolvedAt: now,
                  updatedAt: now,
                },
                $inc: { revision: 1 },
              },
              { returnDocument: 'after' },
            );
          } else {
            // CompleteExchange: Phán quyết công nhận hoàn tất giao dịch
            const updatedForSettlement: ExchangeDoc = {
              ...exchange,
              status: 'Completed',
              completedAt: now,
              resolutionDecision: 'CompleteExchange',
              resolutionReason: trimmedReason,
              resolvedBy: actor._id,
              resolvedAt: now,
              updatedAt: now,
            };

            // 1. Tất toán bảo chứng: trả lại cọc và chuyển tiền chênh lệch cho bên nhận
            await this.ledger.settleExchange(tx, updatedForSettlement, now);

            // 2. Chuyển trạng thái sách thành Exchanged
            const initIds = this.getInitiatorListingIds(exchange);
            const allIds = [...initIds, exchange.recipientListingId];
            const lockedMap = await this.lockAllListingsOrdered(tx, allIds);
            for (const listingId of allIds) {
              const listing = lockedMap.get(listingId);
              if (listing && listing.trade === 'Reserved') {
                await this.listings.project(
                  tx,
                  listing._id,
                  listing.version,
                  'Reserved',
                  'Exchanged',
                );
              }
            }

            // 3. Cập nhật exchange sang Completed
            next = await tx.c.exchanges.findOneAndUpdate(
              { _id: exchange._id, revision: exchange.revision, status: 'ResolutionPending' },
              {
                $set: {
                  status: 'Completed',
                  completedAt: now,
                  resolutionDecision: 'CompleteExchange',
                  resolutionReason: trimmedReason,
                  resolvedBy: actor._id,
                  resolvedAt: now,
                  updatedAt: now,
                },
                $inc: { revision: 1 },
              },
              { returnDocument: 'after' },
            );
          }

          if (!next) throw conflict();

          // Gửi thông báo đến cả hai bên tham gia giao dịch
          await notifyExchange(
            tx,
            next,
            body.decision === 'RefundBoth' ? 'ExchangeCancelled' : 'ExchangeCompleted',
            [next.initiatorId, next.recipientId],
            now,
            {
              reason: `Phán quyết từ quản trị viên: ${trimmedReason}`,
            },
          );

          // Lưu tin nhắn giải trình vào hộp thư trao đổi giữa hai bên
          await tx.c.exchange_messages.insertOne({
            _id: randomUUID(),
            exchangeId: exchange._id,
            senderId: actor._id,
            body: `[Phán quyết của Quản trị viên]\nQuyết định: ${
              body.decision === 'RefundBoth'
                ? 'Hủy giao dịch & Hoàn tiền cho 2 bên'
                : 'Công nhận hoàn tất trao đổi & Tất toán'
            }\nLý do: ${trimmedReason}`,
            sentAt: now,
          });

          this.logger.log(
            JSON.stringify({
              event: 'exchangeDisputeResolved',
              exchangeId: exchange._id,
              decision: body.decision,
              resolvedBy: actor._id,
              reason: trimmedReason,
            }),
          );

          return {
            entityType: 'Exchange',
            entityId: next._id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event:
              body.decision === 'RefundBoth'
                ? 'ExchangeDisputeRefunded'
                : 'ExchangeDisputeCompleted',
            exchange: this.view(next),
          };
        },
      },
    );
  }

  async expireShipping(id: string, nowOverride?: Date) {
    return this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [id]);
      const exchange = await tx.c.exchanges.findOne({ _id: id });
      if (!exchange) return null;

      const now = nowOverride ?? (await tx.now());
      if (
        exchange.status !== 'Preparing' ||
        !exchange.shippingDeadline ||
        exchange.shippingDeadline > now
      ) {
        return null;
      }

      const hasInitShipped = Boolean(exchange.initiatorShippedAt);
      const hasRecipShipped = Boolean(exchange.recipientShippedAt);

      // Case A: Neither party shipped -> Full refund and Cancel
      if (!hasInitShipped && !hasRecipShipped) {
        const next = await this.cancelInternal(tx, exchange, {
          reason: 'ShippingExpired',
          cancelledBy: 'System',
          now,
        });

        this.logger.log(
          JSON.stringify({
            event: 'exchangeShippingExpiredBothUnsent',
            exchangeId: exchange._id,
            status: 'Cancelled',
          }),
        );

        return { exchange: this.view(next), escalated: false };
      }

      // Case B: One party shipped, but the other did not -> Escalate to ResolutionPending
      const delinquentParty = hasInitShipped ? 'Người nhận' : 'Người khởi tạo';
      const disputeReason = `Hết thời hạn gửi sách (72 giờ): ${delinquentParty} không gửi hàng. Hệ thống tạm khóa để quản trị viên xử lý hoàn tiền / bảo hộ hàng hóa.`;

      const next = await tx.c.exchanges.findOneAndUpdate(
        { _id: exchange._id, revision: exchange.revision, status: 'Preparing' },
        {
          $set: {
            status: 'ResolutionPending',
            disputedAt: now,
            disputeReason,
            disputedBy: 'System',
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!next) return null;

      await notifyExchange(
        tx,
        next,
        'ExchangeDisputed',
        [next.initiatorId, next.recipientId],
        now,
        { reason: disputeReason },
      );

      this.logger.log(
        JSON.stringify({
          event: 'exchangeShippingExpiredOneSent',
          exchangeId: exchange._id,
          status: 'ResolutionPending',
          disputeReason,
        }),
      );

      return { exchange: this.view(next), escalated: true };
    });
  }

  async expireTransit(id: string, nowOverride?: Date) {
    return this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [id]);
      const exchange = await tx.c.exchanges.findOne({ _id: id });
      if (!exchange) return null;

      if (exchange.status !== 'InTransit') {
        return null;
      }

      const overdueHours = Number(
        this.config.get('EXCHANGE_DELIVERY_OVERDUE_HOURS') ?? 240,
      );
      const overdueMs = overdueHours * 3_600_000;
      const now = nowOverride ?? (await tx.now());

      const initLegOverdue =
        Boolean(exchange.initiatorShippedAt) &&
        !exchange.recipientReceivedAt &&
        now.getTime() - exchange.initiatorShippedAt!.getTime() >= overdueMs;

      const recipLegOverdue =
        Boolean(exchange.recipientShippedAt) &&
        !exchange.initiatorReceivedAt &&
        now.getTime() - exchange.recipientShippedAt!.getTime() >= overdueMs;

      if (!initLegOverdue && !recipLegOverdue) {
        return null;
      }

      const overdueSides: string[] = [];
      if (initLegOverdue) overdueSides.push('chiều Người khởi tạo gửi');
      if (recipLegOverdue) overdueSides.push('chiều Người nhận gửi');

      const disputeReason = `Quá hạn vận chuyển (${overdueHours} giờ): ${overdueSides.join(' và ')} chưa được xác nhận đã nhận hàng. Hệ thống tự động mở điều tra vận chuyển (POL-07).`;

      const next = await tx.c.exchanges.findOneAndUpdate(
        { _id: exchange._id, revision: exchange.revision, status: 'InTransit' },
        {
          $set: {
            status: 'ResolutionPending',
            disputedAt: now,
            disputeReason,
            disputedBy: 'System',
            updatedAt: now,
          },
          $inc: { revision: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!next) return null;

      await notifyExchange(
        tx,
        next,
        'ExchangeDisputed',
        [next.initiatorId, next.recipientId],
        now,
        { reason: disputeReason },
      );

      this.logger.log(
        JSON.stringify({
          event: 'exchangeTransitOverdue',
          exchangeId: exchange._id,
          status: 'ResolutionPending',
          disputeReason,
        }),
      );

      return { exchange: this.view(next), escalated: true };
    });
  }
}
