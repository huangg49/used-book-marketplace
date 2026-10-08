import { Injectable } from '@nestjs/common';
import type { Tx } from '../../database/mongo/transaction.js';
import { DomainError } from '../commands/domain-error.js';
import type { Actor } from '../commands/mongo-command.service.js';

// Server decision clock read after every lock the decision depends on. A
// separate provider so tests can pin endAt/deadline boundaries.
@Injectable()
export class AuctionClock {
  now(tx: Tx): Promise<Date> {
    return tx.now();
  }
  // Decision time for a user command: the session must still be valid then.
  async decision(tx: Tx, auth: Actor) {
    const now = await this.now(tx);
    const session = await tx.c.auth_sessions.findOne({ _id: auth.sessionId });
    if (!session || session.revokedAt || session.expiresAt <= now)
      throw new DomainError(
        401,
        'SESSION_EXPIRED',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    return now;
  }
}
