import { Injectable } from '@nestjs/common';
import type { Tx } from '../../database/mongo/transaction.js';

// Server decision clock ($$NOW) read after the caller's locks. A separate
// provider so tests can pin decision time.
@Injectable()
export class OrderClock {
  now(tx: Tx): Promise<Date> {
    return tx.now();
  }
}
