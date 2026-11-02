import { Injectable } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { MediaStorage } from '../media/media-storage.js';

@Injectable()
export class ProfileAvatarWorker {
  constructor(
    private readonly mongo: MongoService,
    private readonly storage: MediaStorage,
  ) {}
  async cleanup() {
    const now = new Date();
    const candidates = await this.mongo.c.profile_avatars
      .find({
        $or: [
          { state: 'Deleting' },
          {
            state: { $in: ['Pending', 'Ready', 'Retired'] },
            gcAt: { $lte: new Date(now.getTime() - 300_000) },
            $or: [{ inFlightUntil: null }, { inFlightUntil: { $lt: now } }],
          },
        ],
      })
      .limit(20)
      .toArray();
    for (const candidate of candidates) {
      const key = await this.mongo.tx(async (tx) => {
        // Same users -> avatar lock order as attachment/upload commands.
        await tx.lock('users', [candidate.ownerId]);
        await tx.lock('profile_avatars', [candidate._id]);
        const user = await tx.c.users.findOne({ _id: candidate.ownerId });
        const row = await tx.c.profile_avatars.findOne({ _id: candidate._id });
        if (!row || user?.avatarId === row._id || row.state === 'Attached')
          return null;
        const clock = await tx.now();
        if (
          row.state !== 'Deleting' &&
          (!row.gcAt ||
            row.gcAt.getTime() + 300_000 > clock.getTime() ||
            (row.inFlightUntil && row.inFlightUntil >= clock))
        )
          return null;
        await tx.c.profile_avatars.updateOne(
          { _id: row._id },
          { $set: { state: 'Deleting', updatedAt: clock } },
        );
        return row.storageKey;
      });
      if (!key) continue;
      // Durable Deleting survives unavailable storage; no reattachment is allowed.
      await this.storage.remove([key]);
      await this.mongo.c.profile_avatars.deleteOne({
        _id: candidate._id,
        state: 'Deleting',
      });
    }
  }
}
