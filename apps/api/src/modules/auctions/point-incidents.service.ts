import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PointIncidentDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  conflict,
  invalidField,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoCommandService,
  requireActive,
  type Actor,
  type CommandContext,
  type CurrentActor,
  type PointChange,
} from '../commands/mongo-command.service.js';
import { AuctionClock } from './auction-clock.js';
import { HandoverPointsService } from './handover-points.service.js';

const forbidden = (message: string) =>
  new DomainError(403, 'FORBIDDEN', message);
const has = (u: CurrentActor, role: string) =>
  u.roles.some((r) => r.role === role);
const FUND_LOCK = 'incident-fund-lock';

// N4-13 (FR-T04, FR-H07, POL-42). Incidents are opened by the point's Staff
// or an Admin, even before any Order. One independent Admin decides; the
// compensation is capped by the protected value snapshot and funded from the
// simulated fund while money is left. An unfunded part is recorded and the
// point stops taking new bookings; no money is created and no wallet is paid
// here (seller settlement keeps its own gate). Lock order: users -> session
// -> point -> incident -> fund.
@Injectable()
export class PointIncidentsService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly points: HandoverPointsService,
    private readonly clock: AuctionClock,
  ) {}

  private async lockFund(tx: Tx) {
    await tx.c.counters.updateOne(
      { _id: FUND_LOCK },
      { $inc: { value: 1 } },
      { upsert: true },
    );
    const last = await tx.c.incident_fund_journal.findOne(
      {},
      { sort: { sequence: -1 } },
    );
    if (!last) throw new Error('Incident fund journal has no opening row.');
    return last;
  }
  private async pauseNewBookings(tx: Tx, pointId: string, now: Date) {
    const p = (await tx.c.handover_points.findOne({ _id: pointId }))!;
    if (p.status !== 'Active') return p;
    const next = await tx.c.handover_points.findOneAndUpdate(
      { _id: p._id, version: p.version },
      { $set: { status: 'Paused', updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    return next;
  }

  // -------------------------------------------------------------- reads
  list(auth: Actor): Promise<Wire['PointIncidentList']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      const now = await this.clock.now(tx);
      let filter = {};
      if (!has(actor, 'ADMIN')) {
        if (!has(actor, 'STAFF'))
          throw forbidden(
            'Chỉ nhân viên điểm hoặc quản trị viên được xem sự cố.',
          );
        filter = {
          pointId: {
            $in: await this.points.assignedPointIds(tx, actor._id, now),
          },
        };
      }
      const open = await tx.c.point_incidents
        .find(
          { ...filter, state: 'Open' },
          { sort: { openedAt: 1 }, limit: 50 },
        )
        .toArray();
      const closed = await tx.c.point_incidents
        .find(
          { ...filter, state: { $ne: 'Open' } },
          { sort: { decidedAt: -1 }, limit: 50 - open.length },
        )
        .toArray();
      const rows = [...open, ...closed];
      const points = new Map(
        (
          await tx.c.handover_points
            .find({ _id: { $in: rows.map((r) => r.pointId) } })
            .toArray()
        ).map((p) => [p._id, p.name]),
      );
      const items: Wire['PointIncident'][] = [];
      for (const r of rows) {
        const intake = r.intakeId
          ? await tx.c.auction_intakes.findOne({ _id: r.intakeId })
          : null;
        const item = intake
          ? await tx.c.workflow_items.findOne({
              _id: `${intake.contextId}:${intake.listingId}`,
            })
          : null;
        items.push({
          id: r._id,
          pointId: r.pointId,
          pointName: points.get(r.pointId) ?? '',
          intakeId: r.intakeId,
          title: item
            ? String((item.snapshot as { title?: string }).title ?? '')
            : null,
          kind: r.kind,
          description: r.description,
          protectedValue: r.protectedValue,
          state: r.state,
          openedBy: r.openedBy,
          openedAt: r.openedAt.toISOString(),
          decision: r.decision,
          approvedAmount: r.approvedAmount,
          fundedAmount: r.fundedAmount,
          unfundedAmount: r.unfundedAmount,
          decidedAt: r.decidedAt?.toISOString() ?? null,
          decisionReason: r.decisionReason,
          version: r.version,
        });
      }
      return { items, serverTime: now.toISOString() };
    });
  }

  fund(auth: Actor): Promise<Wire['IncidentFund']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!has(actor, 'ADMIN'))
        throw forbidden('Chỉ quản trị viên được xem quỹ sự cố.');
      const entries = await tx.c.incident_fund_journal
        .find({}, { sort: { sequence: -1 }, limit: 100 })
        .toArray();
      const opening = entries.find((e) => e.type === 'Opening')?.amount ?? 0;
      const balance = entries[0]?.balanceAfter ?? 0;
      return {
        opening,
        approved: opening - balance,
        balance,
        entries: entries.map((e) => ({
          sequence: e.sequence,
          type: e.type,
          amount: e.amount,
          incidentId: e.incidentId,
          balanceAfter: e.balanceAfter,
          createdAt: e.createdAt.toISOString(),
        })),
        serverTime: (await this.clock.now(tx)).toISOString(),
      };
    });
  }

  // ----------------------------------------------------------- commands
  open(context: CommandContext, body: Wire['OpenPointIncident']) {
    return this.commands.runPoint(context, 'openPointIncident', null, body, {
      authorize: async (_tx, actor) => {
        requireActive(actor);
        if (!has(actor, 'STAFF') && !has(actor, 'ADMIN'))
          throw forbidden(
            'Chỉ nhân viên điểm hoặc quản trị viên được mở sự cố.',
          );
      },
      mutate: async (tx, actor) => {
        const p = await this.points.lockPoint(tx, body.pointId);
        const now = await this.clock.decision(tx, context.auth);
        requireActive(actor);
        if (body.kind === 'EmergencyClose') {
          if (!has(actor, 'ADMIN'))
            throw forbidden('Chỉ quản trị viên được đóng khẩn cấp điểm.');
        } else if (!has(actor, 'ADMIN'))
          await this.points.requireAssigned(tx, actor._id, p._id, now);
        let protectedValue: number | null = null;
        if (body.intakeId) {
          const i = await tx.c.auction_intakes.findOne({ _id: body.intakeId });
          if (!i || i.pointId !== p._id) throw notFound();
          if (i.sellerId === actor._id)
            throw new DomainError(
              403,
              'SelfReviewForbidden',
              'Không được mở sự cố cho sách của chính mình.',
            );
          // FR-T04: the Order book price once sold, else the approved sale
          // price snapshot; never a secret max bid or the Buy Now price.
          const auction = i.auctionId
            ? await tx.c.auctions.findOne({ _id: i.auctionId })
            : null;
          const order = auction?.orderId
            ? await tx.c.point_orders.findOne({ _id: auction.orderId })
            : null;
          protectedValue =
            order &&
            order.state !== 'Cancelled' &&
            order.state !== 'PaymentExpired'
              ? order.bookPrice
              : i.protectiveValue;
        }
        const incident: PointIncidentDoc = {
          _id: randomUUID(),
          pointId: p._id,
          intakeId: body.intakeId,
          kind: body.kind,
          description: body.description.trim(),
          protectedValue,
          state: 'Open',
          openedBy: actor._id,
          openedAt: now,
          decision: null,
          approvedAmount: null,
          fundedAmount: null,
          unfundedAmount: null,
          decidedBy: null,
          decidedAt: null,
          decisionReason: null,
          version: 1,
          updatedAt: now,
          lockSeq: 0,
        };
        await tx.c.point_incidents.insertOne(incident);
        // FR-H04: an emergency close stops new bookings at once; books and
        // existing obligations stay at the point for return or investigation.
        if (body.kind === 'EmergencyClose')
          await this.pauseNewBookings(tx, p._id, now);
        return this.change(incident, now, 'PointIncidentOpened');
      },
    });
  }

  decide(
    context: CommandContext,
    incidentId: string,
    body: Wire['DecidePointIncident'],
  ) {
    return this.commands.runPoint(
      context,
      'decidePointIncident',
      incidentId,
      body,
      {
        authorize: async (tx, actor) => {
          requireActive(actor);
          if (!has(actor, 'ADMIN'))
            throw forbidden('Chỉ quản trị viên được quyết định sự cố.');
          const r = await tx.c.point_incidents.findOne({ _id: incidentId });
          if (!r) throw notFound();
          return r;
        },
        mutate: async (tx, actor, before) => {
          await this.points.lockPoint(tx, before.pointId);
          await tx.lock('point_incidents', [before._id]);
          const r = (await tx.c.point_incidents.findOne({ _id: before._id }))!;
          if (r.version !== body.expectedVersion) throw conflict();
          const now = await this.clock.decision(tx, context.auth);
          // Independence: neither the opener nor Staff of this point.
          if (
            r.openedBy === actor._id ||
            (await this.points.assignedPointIds(tx, actor._id, now)).includes(
              r.pointId,
            )
          )
            throw new DomainError(
              403,
              'SelfReviewForbidden',
              'Quản trị viên phải độc lập với điểm và người mở sự cố.',
            );
          if (r.state !== 'Open')
            throw new DomainError(
              409,
              'InvalidState',
              'Sự cố đã có quyết định.',
            );
          const amount = body.decision === 'Compensate' ? body.amount : 0;
          if (body.decision === 'NoCompensation' && body.amount !== 0)
            invalidField('amount', 'Không bồi thường thì số tiền là 0.');
          if (body.decision === 'Compensate') {
            if (r.protectedValue === null)
              invalidField(
                'decision',
                'Sự cố không gắn sách nên không có giá trị bảo vệ để bồi thường.',
              );
            if (amount < 1 || amount > r.protectedValue!)
              invalidField(
                'amount',
                `Bồi thường từ 1đ đến giá trị bảo vệ ${r.protectedValue}đ.`,
              );
          }
          let funded = 0;
          if (amount > 0) {
            const last = await this.lockFund(tx);
            funded = Math.min(amount, last.balanceAfter);
            if (funded > 0)
              await tx.c.incident_fund_journal.insertOne({
                _id: randomUUID(),
                sequence: last.sequence + 1,
                type: 'CompensationApproved',
                amount: funded,
                incidentId: r._id,
                balanceAfter: last.balanceAfter - funded,
                createdAt: now,
              });
          }
          const unfunded = amount - funded;
          // POL-42: no top-up and no closing the gap; new bookings stop.
          if (unfunded > 0) await this.pauseNewBookings(tx, r.pointId, now);
          const next = await tx.c.point_incidents.findOneAndUpdate(
            { _id: r._id, version: r.version, state: 'Open' },
            {
              $set: {
                state: unfunded > 0 ? 'Underfunded' : 'Decided',
                decision: body.decision,
                approvedAmount: amount,
                fundedAmount: funded,
                unfundedAmount: unfunded,
                decidedBy: actor._id,
                decidedAt: now,
                decisionReason: body.reason.trim(),
                updatedAt: now,
              },
              $inc: { version: 1 },
            },
            { returnDocument: 'after' },
          );
          if (!next) throw conflict();
          return this.change(next, now, 'PointIncidentDecided', {
            reason: body.reason.trim(),
            after: {
              decision: body.decision,
              approvedAmount: amount,
              fundedAmount: funded,
              unfundedAmount: unfunded,
            },
          });
        },
      },
    );
  }

  private change(
    r: PointIncidentDoc,
    decidedAt: Date,
    event: string,
    extra: Partial<PointChange> = {},
  ): PointChange {
    return {
      entityType: 'PointIncident',
      entityId: r._id,
      pointId: r.pointId,
      version: r.version,
      state: r.state,
      decidedAt,
      event,
      after: { kind: r.kind, intakeId: r.intakeId },
      ...extra,
    };
  }
}
