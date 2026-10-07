import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  HandoverPointDoc,
  PointSlotDoc,
} from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  DomainError,
  conflict,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoCommandService,
  type Actor,
} from '../commands/mongo-command.service.js';

// The two simulated HCM points (LOCAL-AUCTION-01 DEC-03, FR-H04/H05). Slots
// are taken and counted under the point lock so two requests cannot both take
// the last place; a slot stays held until the book has left the point.
@Injectable()
export class HandoverPointsService {
  constructor(private readonly commands: MongoCommandService) {}

  list(auth: Actor): Promise<Wire['HandoverPointList']> {
    return this.commands.read(auth, async (tx) => {
      const points = await tx.c.handover_points
        .find({}, { sort: { code: 1 } })
        .toArray();
      const items = [];
      for (const p of points) items.push(await this.project(tx, p));
      return { items };
    });
  }

  private async project(
    tx: Tx,
    p: HandoverPointDoc,
  ): Promise<Wire['HandoverPoint']> {
    const used = await tx.c.point_slots.countDocuments({
      pointId: p._id,
      active: true,
    });
    return {
      id: p._id,
      code: p.code,
      name: p.name,
      displayAddress: p.displayAddress,
      status: p.status,
      capacity: p.capacity,
      availableSlots: Math.max(0, p.capacity - used),
      demoOnly: true,
    };
  }

  // Caller holds the user/session locks; points lock before catalog/listings.
  async lockPoint(tx: Tx, pointId: string) {
    if (!(await tx.lock('handover_points', [pointId])).size) throw notFound();
    return (await tx.c.handover_points.findOne({ _id: pointId }))!;
  }

  async reserveSlot(
    tx: Tx,
    point: HandoverPointDoc,
    listingId: string,
    contextId: string,
    now: Date,
  ): Promise<PointSlotDoc> {
    if (point.status !== 'Active') throw invalidState();
    const used = await tx.c.point_slots.countDocuments({
      pointId: point._id,
      active: true,
    });
    if (used >= point.capacity)
      throw new DomainError(
        409,
        'InvalidState',
        'Điểm giao nhận đã đủ sức chứa. Hãy chọn điểm khác.',
      );
    const slot: PointSlotDoc = {
      _id: randomUUID(),
      pointId: point._id,
      listingId,
      contextId,
      active: true,
      reservedAt: now,
      releasedAt: null,
      releaseReason: null,
      lockSeq: 0,
    };
    await tx.c.point_slots.insertOne(slot);
    return slot;
  }

  async releaseSlot(
    tx: Tx,
    slotId: string,
    contextId: string,
    reason: 'Cancelled' | 'Reclaimed' | 'Sold',
    now: Date,
  ) {
    await tx.lock('point_slots', [slotId]);
    const released = await tx.c.point_slots.findOneAndUpdate(
      { _id: slotId, contextId, active: true },
      { $set: { active: false, releasedAt: now, releaseReason: reason } },
      { returnDocument: 'after' },
    );
    if (!released) throw conflict();
  }

  async assignedPointIds(tx: Tx, userId: string, now: Date) {
    const rows = await tx.c.point_staff_assignments
      .find({
        userId,
        validFrom: { $lte: now },
        $or: [{ validTo: null }, { validTo: { $gt: now } }],
      })
      .toArray();
    return [...new Set(rows.map((r) => r.pointId))];
  }

  // STAFF role is not enough: the assignment must cover this point now.
  async requireAssigned(tx: Tx, userId: string, pointId: string, now: Date) {
    if (!(await this.assignedPointIds(tx, userId, now)).includes(pointId))
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Bạn không được phân công tại điểm giao nhận này.',
      );
  }
}
