import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { HandoverPointDoc, Json } from '../../database/mongo/documents.js';
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
  admin,
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
const refused = (message: string) =>
  new DomainError(409, 'InvalidState', message);
const isStaff = (u: CurrentActor) => u.roles.some((r) => r.role === 'STAFF');
const pointAdmin = (actor: CurrentActor) => {
  requireActive(actor);
  if (!actor.roles.some((r) => r.role === 'ADMIN'))
    throw forbidden('Chỉ quản trị viên được quản lý điểm giao nhận.');
};

// FR-H04 (N4-10/N4-11): Admin creates and edits the simulated points and
// assigns Staff. Every command locks the point and checks its version, so
// capacity, status and assignment rules are decided against one state.
// Opening hours stay the fixed POL-29 rule (ADR 0030); they are not editable.
@Injectable()
export class PointAdministrationService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly points: HandoverPointsService,
    private readonly clock: AuctionClock,
  ) {}

  private heldSlots(tx: Tx, pointId: string) {
    return tx.c.point_slots.countDocuments({ pointId, active: true });
  }
  private current(tx: Tx, pointId: string, now: Date) {
    return tx.c.point_staff_assignments
      .find({
        pointId,
        validFrom: { $lte: now },
        $or: [{ validTo: null }, { validTo: { $gt: now } }],
      })
      .toArray();
  }
  // Locks the point and checks the version the Admin decided on.
  private async lockVersion(tx: Tx, pointId: string, version: number) {
    const p = await this.points.lockPoint(tx, pointId);
    if (p.version !== version) throw conflict();
    return p;
  }
  private async bump(
    tx: Tx,
    p: HandoverPointDoc,
    set: Partial<HandoverPointDoc>,
    now: Date,
  ) {
    const next = await tx.c.handover_points.findOneAndUpdate(
      { _id: p._id, version: p.version },
      { $set: { ...set, updatedAt: now }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) throw conflict();
    return next;
  }
  private static snapshot(p: HandoverPointDoc): Json {
    return {
      name: p.name,
      displayAddress: p.displayAddress,
      capacity: p.capacity,
      status: p.status,
    };
  }

  // -------------------------------------------------------------- reads
  list(auth: Actor): Promise<Wire['OperationsPointList']> {
    return this.commands.read(auth, async (tx, actor) => {
      pointAdmin(actor);
      const now = await this.clock.now(tx);
      const points = await tx.c.handover_points
        .find({}, { sort: { code: 1 }, limit: 50 })
        .toArray();
      const items: Wire['OperationsPoint'][] = [];
      for (const p of points) {
        const rows = await this.current(tx, p._id, now);
        const users = await tx.c.users
          .find(
            { _id: { $in: rows.map((r) => r.userId) } },
            { projection: { displayName: 1 } },
          )
          .toArray();
        const names = new Map(users.map((u) => [u._id, u.displayName]));
        items.push({
          id: p._id,
          code: p.code,
          name: p.name,
          displayAddress: p.displayAddress,
          status: p.status,
          capacity: p.capacity,
          heldSlots: await this.heldSlots(tx, p._id),
          version: p.version,
          updatedAt: p.updatedAt.toISOString(),
          assignments: rows
            .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())
            .map((r) => ({
              id: r._id,
              userId: r.userId,
              displayName: names.get(r.userId) ?? '',
              validFrom: r.validFrom.toISOString(),
            })),
        });
      }
      return { items, serverTime: now.toISOString() };
    });
  }

  myAssignments(auth: Actor): Promise<Wire['MyPointAssignmentList']> {
    return this.commands.read(auth, async (tx, actor) => {
      requireActive(actor);
      if (!isStaff(actor))
        throw forbidden('Chỉ nhân viên điểm được xem phân công.');
      const now = await this.clock.now(tx);
      const rows = await tx.c.point_staff_assignments
        .find({
          userId: actor._id,
          validFrom: { $lte: now },
          $or: [{ validTo: null }, { validTo: { $gt: now } }],
        })
        .toArray();
      const points = await tx.c.handover_points
        .find({ _id: { $in: rows.map((r) => r.pointId) } })
        .toArray();
      const byId = new Map(points.map((p) => [p._id, p]));
      return {
        items: rows
          .filter((r) => byId.has(r.pointId))
          .map((r) => {
            const p = byId.get(r.pointId)!;
            return {
              pointId: p._id,
              code: p.code,
              name: p.name,
              status: p.status,
              validFrom: r.validFrom.toISOString(),
            };
          })
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    });
  }

  // ----------------------------------------------------------- commands
  create(context: CommandContext, body: Wire['CreateHandoverPoint']) {
    return this.commands.runPoint(context, 'createHandoverPoint', null, body, {
      authorize: async (_tx, actor) => pointAdmin(actor),
      mutate: async (tx, actor) => {
        const now = await this.clock.decision(tx, context.auth);
        pointAdmin(actor);
        if (await tx.c.handover_points.findOne({ code: body.code }))
          invalidField('code', 'Mã điểm đã tồn tại.');
        const p: HandoverPointDoc = {
          _id: randomUUID(),
          code: body.code,
          name: body.name.trim(),
          displayAddress: body.displayAddress.trim(),
          serviceAreaCode: 'HCM-DEMO-v1',
          capacity: body.capacity,
          status: 'Paused',
          demoOnly: true,
          version: 1,
          updatedAt: now,
          lockSeq: 0,
        };
        await tx.c.handover_points.insertOne(p);
        return this.change(
          'HandoverPoint',
          p._id,
          p,
          now,
          'HandoverPointCreated',
          {
            after: PointAdministrationService.snapshot(p),
          },
        );
      },
    });
  }

  update(
    context: CommandContext,
    pointId: string,
    body: Wire['UpdateHandoverPoint'],
  ) {
    return this.commands.runPoint(
      context,
      'updateHandoverPoint',
      pointId,
      body,
      {
        authorize: async (_tx, actor) => pointAdmin(actor),
        mutate: async (tx, actor) => {
          const p = await this.lockVersion(tx, pointId, body.expectedVersion);
          const now = await this.clock.decision(tx, context.auth);
          pointAdmin(actor);
          const held = await this.heldSlots(tx, p._id);
          if (body.capacity < held)
            invalidField(
              'capacity',
              `Sức chứa không được thấp hơn ${held} chỗ đang giữ.`,
            );
          if (body.status !== p.status) {
            if (body.status === 'Closed' && held > 0)
              throw refused(
                'Điểm còn sách hoặc chỗ đang giữ; chỉ đóng khi không còn nghĩa vụ.',
              );
            if (
              body.status === 'Active' &&
              !(await this.current(tx, p._id, now)).length
            )
              throw refused(
                'Cần phân công ít nhất một nhân viên trước khi mở điểm.',
              );
          }
          const next = await this.bump(
            tx,
            p,
            {
              name: body.name.trim(),
              displayAddress: body.displayAddress.trim(),
              capacity: body.capacity,
              status: body.status,
            },
            now,
          );
          return this.change(
            'HandoverPoint',
            p._id,
            next,
            now,
            'HandoverPointUpdated',
            {
              before: PointAdministrationService.snapshot(p),
              after: PointAdministrationService.snapshot(next),
              reason: body.reason.trim(),
            },
          );
        },
      },
    );
  }

  assign(
    context: CommandContext,
    pointId: string,
    body: Wire['AssignPointStaff'],
  ) {
    return this.commands.runPoint(context, 'assignPointStaff', pointId, body, {
      discover: async () => [body.userId],
      authorize: async (_tx, actor) => pointAdmin(actor),
      mutate: async (tx, actor) => {
        const p = await this.lockVersion(tx, pointId, body.expectedVersion);
        const now = await this.clock.decision(tx, context.auth);
        pointAdmin(actor);
        if (body.userId === actor._id)
          throw new DomainError(
            403,
            'SelfReviewForbidden',
            'Quản trị viên không được tự phân công mình.',
          );
        const staff = await tx.c.users.findOne({ _id: body.userId });
        if (!staff) throw notFound();
        if (staff.status !== 'ACTIVE' || !isStaff(staff))
          invalidField(
            'userId',
            'Chỉ phân công được tài khoản nhân viên đang hoạt động.',
          );
        if (
          (await this.current(tx, p._id, now)).some(
            (r) => r.userId === staff._id,
          )
        )
          throw refused('Nhân viên này đã được phân công tại điểm.');
        const id = randomUUID();
        await tx.c.point_staff_assignments.insertOne({
          _id: id,
          pointId: p._id,
          userId: staff._id,
          validFrom: now,
          validTo: null,
          createdAt: now,
        });
        const next = await this.bump(tx, p, {}, now);
        return this.change(
          'PointAssignment',
          id,
          next,
          now,
          'PointStaffAssigned',
          {
            state: 'Current',
            after: { userId: staff._id },
          },
        );
      },
    });
  }

  endAssignment(
    context: CommandContext,
    pointId: string,
    assignmentId: string,
    body: Wire['EndPointAssignment'],
  ) {
    return this.commands.runPoint(
      context,
      'endPointAssignment',
      assignmentId,
      body,
      {
        authorize: async (_tx, actor) => pointAdmin(actor),
        mutate: async (tx, actor) => {
          const p = await this.lockVersion(tx, pointId, body.expectedVersion);
          const now = await this.clock.decision(tx, context.auth);
          pointAdmin(actor);
          const rows = await this.current(tx, p._id, now);
          const row = rows.find((r) => r._id === assignmentId);
          if (!row) throw notFound();
          if (rows.length === 1 && (await this.heldSlots(tx, p._id)) > 0)
            throw refused(
              'Không thể kết thúc phân công cuối cùng khi điểm còn sách đang giữ.',
            );
          const ended = await tx.c.point_staff_assignments.updateOne(
            { _id: row._id, validTo: null },
            { $set: { validTo: now } },
          );
          if (ended.modifiedCount !== 1) throw conflict();
          const next = await this.bump(tx, p, {}, now);
          return this.change(
            'PointAssignment',
            row._id,
            next,
            now,
            'PointStaffUnassigned',
            {
              state: 'Ended',
              after: { userId: row.userId },
              reason: body.reason.trim(),
            },
          );
        },
      },
    );
  }

  private change(
    entityType: PointChange['entityType'],
    entityId: string,
    p: HandoverPointDoc,
    decidedAt: Date,
    event: string,
    extra: Partial<PointChange> = {},
  ): PointChange {
    return {
      entityType,
      entityId,
      pointId: p._id,
      version: p.version,
      state: p.status,
      decidedAt,
      event,
      ...extra,
    };
  }
}
