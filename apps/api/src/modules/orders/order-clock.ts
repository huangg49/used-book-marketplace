import { Injectable } from '@nestjs/common';
import type { Tx } from '../commands/command.service.js';
@Injectable()
export class OrderClock {
  async now(tx: Tx): Promise<Date> {
    const [row] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return row.now;
  }
}
