import { Injectable } from '@nestjs/common';
import type { Tx } from '../../database/mongo/transaction.js';

// Mongo server decision time after locks; injectable for deadline/race tests.
@Injectable()
export class WalletClock {
  now(tx: Tx): Promise<Date> {
    return tx.now();
  }
}
