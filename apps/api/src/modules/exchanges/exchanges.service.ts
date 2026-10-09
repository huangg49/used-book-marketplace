import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ExchangeDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { MongoCommandService, member, requireActive, type Actor, type CommandContext } from '../commands/mongo-command.service.js';
import { conflict, invalidState, notFound, type Wire } from '../commands/domain-error.js';
import { ListingCommitmentPolicy } from '../listings/listing-commitment-policy.service.js';
import { LedgerService } from '../wallet/ledger.service.js';

@Injectable()
export class ExchangesService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly listings: ListingCommitmentPolicy,
    private readonly ledger: LedgerService,
  ) {}

  private async exchange(tx: Tx, id: string) {
    const row = await tx.c.exchanges.findOne({ _id: id });
    if (!row) throw notFound();
    return row;
  }

  private participant(row: ExchangeDoc, userId: string) {
    if (row.initiatorId !== userId && row.recipientId !== userId) throw notFound();
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  create(context: CommandContext, body: Wire['CreateExchangeProposal']) {
    return this.commands.runExchange(context, 'createExchangeProposal', null, body, {
      discover: async (tx) => {
        const initiatorListing = await tx.c.listings.findOne({ _id: body.initiatorListingId });
        const recipientListing = await tx.c.listings.findOne({ _id: body.recipientListingId });
        return [initiatorListing?.ownerId, recipientListing?.ownerId].filter(Boolean) as string[];
      },
      authorize: async (tx, actor) => {
        member(actor);
        const initiatorListing = await tx.c.listings.findOne({ _id: body.initiatorListingId });
        const recipientListing = await tx.c.listings.findOne({ _id: body.recipientListingId });
        if (!initiatorListing || !recipientListing) throw notFound();
        return { initiatorListing, recipientListing };
      },
      mutate: async (tx, actor, { initiatorListing, recipientListing }) => {
        requireActive(actor);
        if (initiatorListing.ownerId !== actor._id || recipientListing.ownerId === actor._id) {
          throw invalidState();
        }

        const initiatorRev = await tx.c.listing_revisions.findOne({ _id: initiatorListing.currentRevisionId! });
        const recipientRev = await tx.c.listing_revisions.findOne({ _id: recipientListing.currentRevisionId! });
        
        if (!initiatorRev || !recipientRev) throw invalidState();

        if (
          initiatorListing.trade !== 'Available' || recipientListing.trade !== 'Available' ||
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
          createdAt: now,
          updatedAt: now,
          lockSeq: 0,
        };

        await tx.c.exchanges.insertOne(row);
        
        return {
          entityType: 'Exchange',
          entityId: row._id,
          version: row.revision,
          state: row.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeProposed',
          exchange: this.view(row),
        };
      },
    });
  }

  list(auth: Actor) {
    return this.commands.read(auth, async (tx, actor) => {
      const rows = await tx.c.exchanges
        .find({ $or: [{ initiatorId: actor._id }, { recipientId: actor._id }] }, { sort: { updatedAt: -1, _id: -1 }, limit: 100 })
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
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, exchange) => {
        requireActive(actor);
        this.participant(exchange, actor._id);
        
        if (exchange.recipientId !== actor._id || exchange.status !== 'Proposed' || exchange.revision !== body.revision) {
          throw conflict();
        }

        const initiatorListing = await tx.c.listings.findOne({ _id: exchange.initiatorListingId });
        const recipientListing = await tx.c.listings.findOne({ _id: exchange.recipientListingId });
        if (initiatorListing?.trade !== 'Available' || recipientListing?.trade !== 'Available') {
          throw invalidState();
        }

        const now = await tx.now();
        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision, status: 'Proposed' },
          { $set: { status: 'AcceptedAwaitingFunding', updatedAt: now }, $inc: { revision: 1 } },
          { returnDocument: 'after' }
        );
        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
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
      authorize: async (tx, actor) => {
        member(actor);
        return this.exchange(tx, id);
      },
      mutate: async (tx, actor, exchange, receiptId) => {
        requireActive(actor);
        this.participant(exchange, actor._id);
        
        if (exchange.status !== 'AcceptedAwaitingFunding') {
          throw invalidState();
        }

        // Logic for funding - locking available funds to hold
        // The actor needs to pay: their deposit + diffAmount (if they are the diffPayer)
        let amountToPay = 0;
        if (actor._id === exchange.initiatorId) {
          amountToPay += exchange.initiatorDeposit;
        } else {
          amountToPay += exchange.recipientDeposit;
        }

        if (exchange.diffPayerId === actor._id) {
          amountToPay += exchange.diffAmount;
        }

        const now = await tx.now();

        if (amountToPay > 0) {
          const accounts = await this.ledger.lockOrder(tx, actor._id, exchange._id, true);
          await this.ledger.postOrder(tx, exchange._id, receiptId, accounts, amountToPay, now);
        }

        // Check if both sides have funded
        // We can check if the total held in the OrderHold account for this exchange._id
        // equals initiatorDeposit + recipientDeposit + diffAmount
        const holdAccount = await tx.c.wallet_accounts.findOne({ orderId: exchange._id, purpose: 'OrderHold' });
        const currentHeld = holdAccount ? await this.ledger.balance(tx, holdAccount._id) : 0;
        
        const totalRequired = exchange.initiatorDeposit + exchange.recipientDeposit + exchange.diffAmount;

        let nextStatus: Wire['ExchangeStatus'] = exchange.status as Wire['ExchangeStatus'];
        if (currentHeld >= totalRequired) {
          nextStatus = 'Preparing';
          const initiatorListing = await this.listings.lock(tx, exchange.initiatorListingId);
          const recipientListing = await this.listings.lock(tx, exchange.recipientListingId);
          await this.listings.project(tx, initiatorListing._id, initiatorListing.version, 'Available', 'Reserved');
          await this.listings.project(tx, recipientListing._id, recipientListing.version, 'Available', 'Reserved');
        }

        const next = await tx.c.exchanges.findOneAndUpdate(
          { _id: exchange._id, revision: exchange.revision },
          { $set: { status: nextStatus, updatedAt: now }, $inc: { revision: 1 } },
          { returnDocument: 'after' }
        );

        if (!next) throw conflict();

        return {
          entityType: 'Exchange',
          entityId: next._id,
          version: next.revision,
          state: next.status as Wire['ExchangeStatus'],
          decidedAt: now,
          event: 'ExchangeFunded',
          exchange: this.view(next),
        };
      },
    });
  }
}
