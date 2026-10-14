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
import { notifyExchange } from './exchange-notifications.js';

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
            inspectionDeadline: null,
            completedAt: null,
            initiatorAddress,
            recipientAddress: null,
            initiatorShipment: null,
            recipientShipment: null,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          };

          await tx.c.exchanges.insertOne(row);

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

        let recipientAddress: ExchangeAddressSnapshot | null = null;
        if (body.deliveryAddressId) {
          const addr = await tx.c.member_addresses.findOne({
            _id: body.deliveryAddressId,
            ownerId: actor._id,
          });
          if (addr) {
            recipientAddress = {
              recipientName: addr.recipientName,
              phone: addr.phone,
              detail: addr.detail,
              localityCode: addr.localityCode ?? null,
              serviceAreaCode: addr.serviceAreaCode ?? null,
            };
          }
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
          {
            $set: {
              status: 'AcceptedAwaitingFunding',
              fundingDeadline,
              recipientAddress: recipientAddress ?? exchange.recipientAddress ?? null,
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
}
