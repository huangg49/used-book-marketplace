import { messageBoundary } from '../commands/message-history.js';
import { checkMessageSendRate, MESSAGE_MAX_LENGTH } from '../commands/message-send-limits.js';
import { MediaStorage } from '../media/media-storage.js';
import { agreementBooks, agreementMatches, eligibleExchangeMember, exchangeAmounts, snapshotExchangeBook } from './exchange-agreement.js';
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
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { recordViolation } from '../auctions/member-violations.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { LedgerService } from '../wallet/ledger.service.js';
import { exchangeReturnChange, oneSidedReturn, pendingOutboundDelivery, resolutionMessage, returnResolutionView, verifyOutboundDelivery } from './exchange-return-resolution.js';
import { notifyExchange } from './exchange-notifications.js';
import { EXCHANGE_INSPECTION_MS, hasExchangeDispute, inspectionDeadlines, inspectionMaySettle } from './exchange-inspection.js';

@Injectable()
export class ExchangesService {
  private readonly logger = new Logger(ExchangesService.name);

  constructor(
    private readonly storage: MediaStorage,
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
    } else if (cancelledBy === 'Both' || reason === 'MutualAgreement') {
      notifyRecipients = [next.initiatorId, next.recipientId];
      reasonText = 'Hai bên đã đồng thuận hủy giao dịch trao đổi';
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
    const deadlines = inspectionDeadlines(row);
    return {
      id: row._id,
      ...(oneSidedReturn(row) && row.status === 'ResolutionPending' ? { canStartReturnResolution: true } : {}),
      ...(pendingOutboundDelivery(row) ? { canVerifyOutboundDelivery: true } : {}),
      ...(row.outboundDeliveryVerification ? { outboundDeliveryVerification: {
        verifiedAt: row.outboundDeliveryVerification.verifiedAt.toISOString(),
        note: row.outboundDeliveryVerification.note,
      } } : {}),
      ...(row.returnResolution ? { returnResolution: returnResolutionView(row) } : {}),
      agreement: row.agreement ?? null,
      initiatorId: row.initiatorId,
      recipientId: row.recipientId,
      initiatorListingId: row.initiatorListingId,
      initiatorListingIds: row.initiatorListingIds ?? [row.initiatorListingId],
      recipientListingId: row.recipientListingId,
      status: (hasExchangeDispute(row) && !['Completed', 'Cancelled'].includes(row.status)
        ? 'ResolutionPending' : row.status) as Wire['ExchangeStatus'],
      revision: row.revision,
      initiatorDeposit: row.initiatorDeposit,
      recipientDeposit: row.recipientDeposit,
      diffAmount: row.diffAmount,
      diffPayerId: row.diffPayerId,
      negotiatedDiffAmount: row.negotiatedDiffAmount ?? null,
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
      initiatorInspectionDeadline: deadlines.initiator?.toISOString() ?? null,
      recipientInspectionDeadline: deadlines.recipient?.toISOString() ?? null,
      inspectionDeadline: deadlines.all?.toISOString() ?? null,
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
            packagingPhotoUrl: row.initiatorShipment.packagingPhotoUrl ?? null,
            packagingVideoUrl: row.initiatorShipment.packagingVideoUrl ?? null,
            packagingPhotoName: row.initiatorShipment.packagingPhotoName ?? null,
            packagingVideoName: row.initiatorShipment.packagingVideoName ?? null,
            shippedAt: row.initiatorShipment.shippedAt
              ? new Date(row.initiatorShipment.shippedAt).toISOString()
              : null,
            lastEvent: row.initiatorShipment.lastEvent ?? null,
            lastEventAt: row.initiatorShipment.lastEventAt
              ? new Date(row.initiatorShipment.lastEventAt).toISOString()
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
            packagingPhotoUrl: row.recipientShipment.packagingPhotoUrl ?? null,
            packagingVideoUrl: row.recipientShipment.packagingVideoUrl ?? null,
            packagingPhotoName: row.recipientShipment.packagingPhotoName ?? null,
            packagingVideoName: row.recipientShipment.packagingVideoName ?? null,
            shippedAt: row.recipientShipment.shippedAt
              ? new Date(row.recipientShipment.shippedAt).toISOString()
              : null,
            lastEvent: row.recipientShipment.lastEvent ?? null,
            lastEventAt: row.recipientShipment.lastEventAt
              ? new Date(row.recipientShipment.lastEventAt).toISOString()
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
      cancellationRequestedBy: row.cancellationRequestedBy ?? null,
      cancellationRequestedAt: row.cancellationRequestedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async closeUnavailable(tx: Tx, exchange: ExchangeDoc, now: Date) {
    const next = await tx.c.exchanges.findOneAndUpdate(
      { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
      { $set: { status: 'Cancelled', cancelReason: 'ListingUnavailable', cancelledBy: 'System', cancelledAt: now,
        rejectionReason: 'Thỏa thuận không còn hợp lệ hoặc thiếu bản chụp gốc. Hãy tạo đề xuất mới từ sách đủ điều kiện.', updatedAt: now }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    await notifyExchange(tx, next, 'ExchangeCancelled', [next.initiatorId, next.recipientId], now, { reason: next.rejectionReason! });
    return { entityType: 'Exchange' as const, entityId: next._id, initiatorListingId: next.initiatorListingId,
      version: next.revision, state: next.status as Wire['ExchangeStatus'], decidedAt: now,
      event: 'ExchangeUnavailable', exchange: this.view(next) };
  }

  private async agreementEligible(tx: Tx, exchange: ExchangeDoc, listings: Map<string, ListingDoc>) {
    const parties = await tx.c.users.find({ _id: { $in: [exchange.initiatorId, exchange.recipientId] } }).toArray();
    if (parties.length !== 2 || parties.some((user) => !eligibleExchangeMember(user)) || !agreementMatches(exchange, listings)) return false;
    try {
      for (const book of agreementBooks(exchange.agreement!)) {
        const current = await snapshotExchangeBook(tx, listings.get(book.listingId)!, book.ownerId);
        if (current.exchangeValue !== book.exchangeValue || current.mediaIds.join() !== book.mediaIds.join()) return false;
      }
      return true;
    } catch (error) {
      if (error instanceof DomainError && error.getStatus() === 409) return false;
      throw error;
    }
  }

  async photo(auth: Actor, id: string, listingId: string, mediaId: string): Promise<Wire['MediaRead']> {
    const authorize = () => this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
      const exchange = await this.exchange(tx, id);
      this.participant(exchange, actor._id);
      const book = exchange.agreement && agreementBooks(exchange.agreement).find((b) => b.listingId === listingId);
      if (!book?.mediaIds.includes(mediaId)) throw notFound();
      const media = await tx.c.listing_media.findOne({ _id: mediaId, listingId, status: 'Ready', purgedAt: null });
      if (!media?.derivativeKey || !media.width || !media.height) throw notFound();
      return { key: media.derivativeKey, width: media.width, height: media.height, revisionId: book.revisionId };
    });
    const before = await authorize();
    await this.storage.check();
    const signed = await this.storage.signedRead(before.key);
    const after = await authorize();
    if (before.key !== after.key || before.revisionId !== after.revisionId) throw notFound();
    return { id: mediaId, ...signed, width: after.width, height: after.height };
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
        mutate: async (tx, actor, { recipientListing: proposedRecipient }) => {
          requireActive(actor);
          // Conversation precedes resource locks in the transaction protocol.
          const conversation = body.conversationId ? await this.agreements.prepareExchange(tx, body.conversationId, body.expectedConversationVersion!, actor._id, proposedRecipient._id, proposedRecipient.ownerId) : null;
          const locked = await this.lockAllListingsOrdered(tx, [...initiatorListingIds, body.recipientListingId]);
          const initiatorListings = initiatorListingIds.map((id) => locked.get(id)!);
          const recipientListing = locked.get(body.recipientListingId)!;
          if (!initiatorListingIds.includes(primaryInitiatorListingId) || new Set(rawIds).size !== rawIds.length || initiatorListingIds.length > 5) throw invalidState();
          if (!eligibleExchangeMember(await tx.c.users.findOne({ _id: recipientListing.ownerId }))) throw invalidState('Đối tác hiện không đủ điều kiện tạo giao dịch mới.');
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

          const agreement = {
            initiatorBooks: await Promise.all(initiatorListings.map((listing) => snapshotExchangeBook(tx, listing, actor._id))),
            recipientBook: await snapshotExchangeBook(tx, recipientListing, recipientListing.ownerId),
          };
          const amounts = exchangeAmounts(agreement, actor._id, recipientListing.ownerId);
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
            agreement,
            ...amounts,
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
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
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
    return this.commands.readObligation(auth, async (tx, actor) => {
      member(actor);
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

        if (!await this.agreementEligible(tx, exchange, lockedMap)) {
          return this.closeUnavailable(tx, exchange, now);
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

          await tx.lock('exchanges', [initialExchange._id]);
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

          if ((exchange.lastProposedById ?? exchange.initiatorId) === actor._id) throw conflict();
          const isInitiator = actor._id === exchange.initiatorId;
          const ownIds = isInitiator ? this.getInitiatorListingIds(exchange) : [exchange.recipientListingId];
          const hasNewListings = Array.isArray(body.listingIds) && body.listingIds.length > 0;
          const targetListingIds: string[] = hasNewListings ? body.listingIds! : ownIds;

          if (hasNewListings && !isInitiator && targetListingIds.length !== 1) {
            throw invalidState('Bên nhận đề xuất chọn đúng một sách thay thế.');
          }

          const currentIds = [...this.getInitiatorListingIds(exchange), exchange.recipientListingId];
          const locked = await this.lockAllListingsOrdered(tx, [...currentIds, ...targetListingIds]);
          if (!await this.agreementEligible(tx, exchange, locked)) {
            return this.closeUnavailable(tx, exchange, now);
          }

          const isBooksChanged = targetListingIds.length !== ownIds.length || !targetListingIds.every((id) => ownIds.includes(id));
          const isNegotiated = body.negotiatedDiffAmount !== undefined && body.negotiatedDiffAmount !== null;

          if (!isBooksChanged && !isNegotiated && !body.deliveryAddressId) {
            throw invalidState('Hãy chọn sách khác hoặc điều chỉnh tiền bù để đề xuất lại.');
          }
          if (isNegotiated && body.negotiatedDiffAmount! < 0) {
            throw invalidState('Tiền bù không thể là số âm.');
          }

          const replacements = isBooksChanged
            ? await Promise.all(targetListingIds.map((id) => snapshotExchangeBook(tx, locked.get(id)!, actor._id)))
            : (isInitiator ? exchange.agreement!.initiatorBooks : [exchange.agreement!.recipientBook]);

          const agreement = isInitiator
            ? { initiatorBooks: replacements, recipientBook: exchange.agreement!.recipientBook }
            : { initiatorBooks: exchange.agreement!.initiatorBooks, recipientBook: replacements[0] };

          if (isNegotiated && body.diffPayerId !== undefined && body.diffPayerId !== null) {
            if (body.diffPayerId !== exchange.initiatorId && body.diffPayerId !== exchange.recipientId) {
              throw invalidState('Bên bù tiền phải là một trong hai người tham gia trao đổi.');
            }
          }

          const amounts = exchangeAmounts(
            agreement,
            exchange.initiatorId,
            exchange.recipientId,
            isNegotiated ? body.negotiatedDiffAmount : (isBooksChanged ? null : exchange.negotiatedDiffAmount),
            isNegotiated ? (body.negotiatedDiffAmount === 0 ? null : body.diffPayerId) : (isBooksChanged ? undefined : exchange.diffPayerId),
          );
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

          const setFields: Record<string, unknown> = {
            agreement,
            ...amounts,
            ...(isInitiator ? { initiatorListingIds: targetListingIds, initiatorListingId: targetListingIds[0] } : { recipientListingId: targetListingIds[0] }),
            lastProposedById: actor._id,
            updatedAt: now,
          };
          if (isNegotiated) {
            setFields.negotiatedDiffAmount = amounts.diffAmount;
          } else if (isBooksChanged) {
            setFields.negotiatedDiffAmount = null;
          }
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
          const payerLabel = amounts.diffAmount === 0 ? 'Đổi ngang giá (không bù tiền)'
            : (amounts.diffPayerId === actor._id ? 'Tôi bù thêm ' : 'Đối tác bù thêm ') + amounts.diffAmount.toLocaleString('vi-VN') + ' đ';
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

  getMessages(
    auth: Actor,
    id: string,
    before?: string,
    limit?: number,
  ): Promise<Wire['ExchangeMessagesResponse']> {
    return this.commands.read(auth, async (tx, actor) => {
      const exchange = await this.exchange(tx, id);
      this.participant(exchange, actor._id);
      const paginated = before !== undefined || limit !== undefined;
      const size = limit ?? (paginated ? 40 : 500);
      const boundary = before === undefined ? undefined : messageBoundary(before, id);
      const older = boundary ? {
        $or: [
          { sentAt: { $lt: boundary.sentAt } },
          { sentAt: boundary.sentAt, _id: { $lt: boundary.id } },
        ],
      } : {};
      const rows = await tx.c.exchange_messages
        .find({ exchangeId: id, ...older }, {
          sort: { sentAt: -1, _id: -1 },
          limit: size + (paginated ? 1 : 0),
        })
        .toArray();
      const items = rows.slice(0, size).reverse().map((message) => ({
        id: message._id,
        exchangeId: message.exchangeId,
        senderId: message.senderId,
        body: message.body,
        sentAt: message.sentAt.toISOString(),
      }));
      const oldest = items[0];
      return {
        items,
        ...(paginated ? {
          olderCursor: rows.length > size && oldest
            ? Buffer.from(`${id}/${oldest.sentAt}/${oldest.id}`).toString('base64url')
            : null,
        } : {}),
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
      if (!text || [...text].length > MESSAGE_MAX_LENGTH) throw invalidState();

      const exchange = await this.exchange(tx, id);
      this.participant(exchange, actor._id);

      const now = await tx.now();
      await checkMessageSendRate(tx, actor._id, now);
      const messageId = randomUUID();
      await tx.c.exchange_messages.insertOne({
        memberAuthored: true,
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
        const current = await this.exchange(tx, id);
        this.participant(current, actor._id);
        return current;
      },
      mutate: async (tx, actor, initialExchange) => {
        member(actor);
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
          requireActive(actor);
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
            throw invalidState('Không thể hủy giao dịch khi đã có bên gửi sách đi.');
          }

          // Case A: Đã hết thời hạn 72h gửi sách -> Hủy do quá hạn vận chuyển
          if (exchange.shippingDeadline && now >= exchange.shippingDeadline) {
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

          // Case B: Trong thời hạn 72h -> Đồng thuận hủy (Mutual Cancellation)
          if (!exchange.cancellationRequestedBy) {
            // Bước 1: Bên gọi gửi yêu cầu hủy giao dịch
            const next = await tx.c.exchanges.findOneAndUpdate(
              { _id: exchange._id, revision: exchange.revision, status: 'Preparing' },
              {
                $set: {
                  cancellationRequestedBy: cancelledBy,
                  cancellationRequestedAt: now,
                  updatedAt: now,
                },
                $inc: { revision: 1 },
              },
              { returnDocument: 'after' },
            );
            if (!next) throw conflict();

            const partnerId =
              actor._id === exchange.initiatorId
                ? exchange.recipientId
                : exchange.initiatorId;

            await notifyExchange(
              tx,
              next,
              'ExchangeCancelled',
              [partnerId],
              now,
              { reason: 'Đối tác đã đề nghị hủy giao dịch trước khi gửi sách. Hãy vào xác nhận nếu bạn đồng ý.' },
            );

            await tx.c.exchange_messages.insertOne({
              _id: randomUUID(),
              exchangeId: exchange._id,
              senderId: actor._id,
              body: `[Đề nghị hủy giao dịch]\nTôi đề nghị hủy giao dịch trao đổi này trước khi gửi sách. Nếu đối tác đồng ý xác nhận hủy, 100% tiền cọc và tiền bù sẽ được hoàn lại về ví của cả hai bên.`,
              sentAt: now,
            });

            return {
              entityType: 'Exchange',
              entityId: next._id,
              initiatorListingId: next.initiatorListingId,
              version: next.revision,
              state: next.status as Wire['ExchangeStatus'],
              decidedAt: now,
              event: 'ExchangeCancellationRequested',
              exchange: this.view(next),
            };
          }

          if (exchange.cancellationRequestedBy === cancelledBy) {
            throw invalidState('Bạn đã gửi yêu cầu hủy giao dịch. Đang chờ đối tác xác nhận.');
          }

          // Bước 2: Đối tác chấp thuận yêu cầu hủy -> Hai bên đồng thuận hủy thành công!
          const next = await this.cancelInternal(tx, exchange, {
            reason: 'MutualAgreement',
            cancelledBy: 'Both',
            now,
          });

          await tx.c.exchange_messages.insertOne({
            _id: randomUUID(),
            exchangeId: exchange._id,
            senderId: actor._id,
            body: `[Đồng thuận hủy thành công]\nHai bên đã đồng thuận hủy giao dịch trước khi gửi sách. Toàn bộ tiền cọc bảo chứng và tiền bù đã được hoàn lại 100% về ví của mỗi bên. Sách đã được mở lại trên kệ.`,
            sentAt: now,
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

        if (exchange.status === 'Preparing') {
          this.participant(exchange, actor._id);
          const callerRole: ExchangeCancelledBy =
            actor._id === exchange.initiatorId ? 'Initiator' : 'Recipient';
          if (
            !exchange.cancellationRequestedBy ||
            exchange.cancellationRequestedBy === callerRole
          ) {
            throw invalidState('Không có yêu cầu hủy nào từ đối tác để từ chối.');
          }
          if (exchange.revision !== body.expectedVersion) {
            throw conflict();
          }

          const now = await tx.now();
          const next = await tx.c.exchanges.findOneAndUpdate(
            { _id: exchange._id, revision: exchange.revision, status: 'Preparing' },
            {
              $set: {
                cancellationRequestedBy: null,
                cancellationRequestedAt: null,
                updatedAt: now,
              },
              $inc: { revision: 1 },
            },
            { returnDocument: 'after' },
          );
          if (!next) throw conflict();

          const partnerId =
            actor._id === exchange.initiatorId
              ? exchange.recipientId
              : exchange.initiatorId;

          await notifyExchange(
            tx,
            next,
            'ExchangeRejected',
            [partnerId],
            now,
            { reason: `Đối tác đã từ chối yêu cầu hủy: ${body.reason}` },
          );

          await tx.c.exchange_messages.insertOne({
            _id: randomUUID(),
            exchangeId: exchange._id,
            senderId: actor._id,
            body: `[Từ chối yêu cầu hủy giao dịch]\nLý do: ${body.reason}\nĐối tác không đồng ý hủy giao dịch. Giao dịch tiếp tục ở trạng thái Đang chuẩn bị, vui lòng chuẩn bị và gửi sách trước thời hạn.`,
            sentAt: now,
          });

          return {
            entityType: 'Exchange',
            entityId: next._id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status as Wire['ExchangeStatus'],
            decidedAt: now,
            event: 'ExchangeCancellationDeclined',
            exchange: this.view(next),
          };
        }

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
        const current = await this.exchange(tx, id);
        this.participant(current, actor._id);
        return current;
      },
      mutate: async (tx, actor, exchange) => {
        member(actor);
        this.participant(exchange, actor._id);

        const isInitiator = exchange.initiatorId === actor._id;
        if (
          (isInitiator && exchange.initiatorShippedAt) ||
          (!isInitiator && exchange.recipientShippedAt)
        ) {
          throw invalidState();
        }

        // Allow expectedVersion to be either the current revision or the revision right before
        // the other party shipped their leg, as both parties ship independently.
        const minAcceptableVersion = exchange.revision - 1;
        if (
          !['Preparing', 'InTransit'].includes(exchange.status) ||
          body.expectedVersion < minAcceptableVersion ||
          body.expectedVersion > exchange.revision
        ) {
          throw conflict();
        }

        const now = await tx.now();
        if (!exchange.shippingDeadline || now >= exchange.shippingDeadline)
          throw invalidState('Đã hết hạn gửi sách. Hãy xem trạng thái mới trong phiếu trao đổi.');
        const setFields: Record<string, unknown> = { updatedAt: now };
        const shipmentSnapshot: ExchangeShipmentSnapshot = {
          method: (body.method as 'carrier' | 'direct') ?? 'carrier',
          carrierCode: body.carrierCode ?? null,
          carrierName: body.carrierName ?? null,
          trackingCode: body.trackingCode ?? null,
          meetupLocation: body.meetupLocation ?? null,
          notes: body.notes ?? null,
          packagingPhotoUrl: body.packagingPhotoUrl ?? null,
          packagingVideoUrl: body.packagingVideoUrl ?? null,
          packagingPhotoName: body.packagingPhotoName ?? null,
          packagingVideoName: body.packagingVideoName ?? null,
          shippedAt: now,
        };

        if (isInitiator) {
          setFields.initiatorShippedAt = now;
          setFields.initiatorShipment = shipmentSnapshot;
        } else {
          setFields.recipientShippedAt = now;
          setFields.recipientShipment = shipmentSnapshot;
        }

        if (exchange.cancellationRequestedBy) {
          setFields.cancellationRequestedBy = null;
          setFields.cancellationRequestedAt = null;
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
        const current = await this.exchange(tx, id);
        this.participant(current, actor._id);
        return current;
      },
      mutate: async (tx, actor, exchange) => {
        member(actor);
        this.participant(exchange, actor._id);

        const isInitiator = exchange.initiatorId === actor._id;
        if (
          (isInitiator && exchange.initiatorReceivedAt) ||
          (!isInitiator && exchange.recipientReceivedAt)
        ) {
          throw invalidState();
        }

        const incomingShipment = isInitiator ? exchange.recipientShippedAt : exchange.initiatorShippedAt;
        const canRecordReceipt = ['Preparing', 'InTransit', 'Delivered'].includes(exchange.status) ||
          (exchange.status === 'ResolutionPending' && !exchange.returnResolution && !exchange.outboundDeliveryVerification &&
            Boolean(exchange.shippingDeadline) &&
            Boolean(exchange.initiatorShippedAt) !== Boolean(exchange.recipientShippedAt));
        if (!incomingShipment || !canRecordReceipt) throw invalidState();
        const minAcceptableVersion = exchange.revision - 1;
        if (
          body.expectedVersion < minAcceptableVersion ||
          body.expectedVersion > exchange.revision ||
          (exchange.status === 'ResolutionPending' && body.expectedVersion !== exchange.revision)
        ) {
          throw conflict();
        }

        const now = await tx.now();
        const setFields: Record<string, unknown> = { updatedAt: now };
        if (isInitiator) setFields.initiatorReceivedAt = now;
        else setFields.recipientReceivedAt = now;
        const deadline = new Date(now.getTime() + EXCHANGE_INSPECTION_MS);
        if (isInitiator) setFields.initiatorInspectionDeadline = deadline;
        else setFields.recipientInspectionDeadline = deadline;

        const willBeBothReceived =
          (isInitiator
            ? exchange.recipientReceivedAt
            : exchange.initiatorReceivedAt) != null;

        if (willBeBothReceived) {
          setFields.status = 'Delivered';
          setFields.inspectionDeadline = inspectionDeadlines({ ...exchange, ...setFields } as ExchangeDoc).all;
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
        const current = await this.exchange(tx, id);
        this.participant(current, actor._id);
        return current;
      },
      mutate: async (tx, actor, initialExchange) => {
        member(actor);
        this.participant(initialExchange, actor._id);

        await tx.lock('exchanges', [initialExchange._id]);
        const exchange = await this.exchange(tx, initialExchange._id);

        if (
          exchange.status !== 'Delivered' ||
          hasExchangeDispute(exchange) ||
          !exchange.initiatorReceivedAt ||
          !exchange.recipientReceivedAt
        ) {
          throw invalidState();
        }
        const isInitiator = exchange.initiatorId === actor._id;
        if (
          (isInitiator && exchange.initiatorCompletedAt) ||
          (!isInitiator && exchange.recipientCompletedAt)
        ) {
          throw invalidState();
        }

        const minAcceptableVersion = exchange.revision - 1;
        if (
          body.expectedVersion < minAcceptableVersion ||
          body.expectedVersion > exchange.revision
        ) {
          throw conflict();
        }

        const now = await tx.now();
        const setFields: Record<string, unknown> = { updatedAt: now };
        if (isInitiator) {
          setFields.initiatorCompletedAt = now;
        } else {
          setFields.recipientCompletedAt = now;
        }

        const bothAcknowledged =
          (isInitiator
            ? exchange.recipientCompletedAt
            : exchange.initiatorCompletedAt) != null;
        // Acknowledgement never waives either participant's inspection window.
        const willBeBothCompleted = bothAcknowledged && inspectionMaySettle(exchange, now);

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
        !inspectionMaySettle(exchange, now)
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
          const current = await this.exchange(tx, id);
        this.participant(current, actor._id);
        return current;
        },
        mutate: async (tx, actor, initialExchange) => {
          member(actor);
          this.participant(initialExchange, actor._id);

          await tx.lock('exchanges', [initialExchange._id]);
          const exchange = await this.exchange(tx, initialExchange._id);

          const now = await tx.now();
          const lateOneSided = exchange.status === 'Preparing' && exchange.shippingDeadline &&
            now >= exchange.shippingDeadline &&
            Boolean(exchange.initiatorShippedAt) !== Boolean(exchange.recipientShippedAt);
          if ((!['InTransit', 'Delivered'].includes(exchange.status) && !lateOneSided) || hasExchangeDispute(exchange)) {
            throw invalidState();
          }
          if (exchange.revision !== body.expectedVersion) {
            throw conflict();
          }

          const deadline = actor._id === exchange.initiatorId
            ? inspectionDeadlines(exchange).initiator
            : inspectionDeadlines(exchange).recipient;
          if (deadline && now >= deadline) throw invalidState();
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
              status: 'ResolutionPending',
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
        .find({
          status: 'ResolutionPending',
          initiatorId: { $ne: actor._id },
          recipientId: { $ne: actor._id },
        })
        .sort({ disputedAt: -1, updatedAt: -1 })
        .toArray();
      return rows.map((r) => this.view(r));
    });
  }

  // ADR 0057: retain historical receipt recovery, but fail closed for new
  // decisions. ADR 0089 uses a separate command and effective decision.
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
          const exchange = await this.exchange(tx, id);
          // Current independence is checked before receipt replay as well.
          if ([exchange.initiatorId, exchange.recipientId].includes(actor._id))
            throw new DomainError(
              403,
              'SelfReviewForbidden',
              'Bạn không thể phân xử giao dịch của chính mình.',
            );
          return exchange;
        },
        mutate: async () => {
          throw invalidState('Quyết định cũ chỉ dùng để đối chiếu kết quả đã ghi. Hãy xử lý trong hồ sơ trả sách.');
        },
      },
    );
  }

  getOperationsDispute(auth: Actor, id: string) {
    return this.commands.read(auth, async (tx, actor) => {
      staff(actor);
      const row = await this.exchange(tx, id);
      if ([row.initiatorId, row.recipientId].includes(actor._id))
        throw new DomainError(403, 'SelfReviewForbidden', 'Không được xử lý trao đổi của chính mình.');
      if (row.status !== 'ResolutionPending' && !row.returnResolution) throw notFound();
      return this.view(row);
    });
  }

  actOnReturn(context: CommandContext, id: string, body: Wire['ExchangeReturnCommand'], operations: boolean) {
    return this.commands.runExchange(
      context, operations ? 'actOnOperationsExchangeReturn' : 'actOnOwnExchangeReturn', id, body, {
        discover: async (tx) => {
          const row = await this.exchange(tx, id);
          return [row.initiatorId, row.recipientId];
        },
        authorize: async (tx, actor) => {
          await tx.lock('exchanges', [id]);
          const row = await this.exchange(tx, id);
          if (body.action === 'VerifyOutboundDelivery' &&
            (!operations || !actor.roles.some(({ role }) => role === 'ADMIN'))) {
            throw new DomainError(403, 'FORBIDDEN', 'Chỉ Admin phụ trách được xác minh giao sách.');
          }
          if (operations) {
            staff(actor);
            if ([row.initiatorId, row.recipientId].includes(actor._id))
              throw new DomainError(403, 'SelfReviewForbidden', 'Không được xử lý trao đổi của chính mình.');
            const assignment = await tx.c.exchange_evidence_assignments.findOne({ _id: id });
            if (assignment?.assigneeId !== actor._id)
              throw new DomainError(403, 'FORBIDDEN', 'Nhận phụ trách hồ sơ trước khi xử lý.');
          } else {
            member(actor);
            this.participant(row, actor._id);
          }
          return row;
        },
        mutate: async (tx, actor, row, receiptId) => {
          if (row.status !== 'ResolutionPending') throw invalidState();
          if (row.revision !== body.expectedVersion) throw conflict();
          const now = await tx.now();
          const verification = body.action === 'VerifyOutboundDelivery'
            ? await verifyOutboundDelivery(tx, row, actor, body, now)
            : undefined;
          const resolution = verification ? undefined : await exchangeReturnChange(tx, row, actor, body, operations, now);
          const closing = resolution?.phase === 'Closed';
          const scope = closing ? oneSidedReturn(row)! : undefined;
          if (scope && resolution) {
            const books = await this.lockAllListingsOrdered(tx, [scope.listingId, scope.otherListingId]);
            for (const listing of books.values()) {
              const isReturnedBook = listing._id === scope.listingId;
              const trade = isReturnedBook && resolution.outcome === 'Compensated' ? 'ClosedUnavailable' : 'Available';
              await this.listings.project(tx, listing._id, listing.version, 'Reserved', trade);
              if (isReturnedBook && trade === 'Available') await this.listings.requireRevision(tx, listing._id);
            }
            resolution.settlementReceiptId = receiptId;
          }
          const next = await tx.c.exchanges.findOneAndUpdate(
            { _id: id, revision: row.revision },
            {
              $set: {
                ...(verification ? { outboundDeliveryVerification: verification } : { returnResolution: resolution }),
                updatedAt: now,
                ...(closing ? {
                  status: 'Cancelled', cancelReason: 'DisputeResolvedRefund', cancelledAt: now, cancelledBy: 'Staff',
                  resolvedAt: now, resolvedBy: actor._id, resolutionReason: resolution.note,
                } : {}),
              },
              $inc: { revision: 1 },
            },
            { returnDocument: 'after' },
          );
          if (!next) throw conflict();
          if (scope && resolution) {
            await this.ledger.settleExchangeReturn(tx, next, receiptId, now);
            if (resolution.outcome === 'Compensated') {
              await recordViolation(tx, {
                userId: scope.holderId, kind: 'ExchangeReturnDefault',
                sourceId: id, recordedAt: now, receiptId,
              });
            }
          }
          const message = verification
            ? 'Admin đã xác minh sách gửi ban đầu đã đến người nhận. Hồ sơ tiếp tục giữ tiền trong lúc xử lý.'
            : resolution && resolutionMessage(body.action, resolution);
          if (message) {
            await notifyExchange(tx, next, closing ? 'ExchangeCancelled' : 'ExchangeDisputed',
              [next.initiatorId, next.recipientId], now, { reason: message, resolutionUpdate: !closing });
          }
          return {
            entityType: 'Exchange',
            entityId: id,
            initiatorListingId: next.initiatorListingId,
            version: next.revision,
            state: next.status,
            decidedAt: now,
            event: verification ? 'ExchangeOutboundDeliveryVerified' : 'ExchangeReturnUpdated',
            reason: body.note ?? body.action,
            before: {
              phase: row.returnResolution?.phase ?? null,
              action: body.action,
              evidenceId: body.evidenceId ?? null,
              returnTrackingCode: body.trackingCode ?? row.returnResolution?.trackingCode ?? null,
            },
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
