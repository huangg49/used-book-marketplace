import { Injectable } from '@nestjs/common';

export const transactionKinds = ['exchange', 'order', 'conversation', 'inbox'] as const;
export type TransactionKind = (typeof transactionKinds)[number];
export type TransactionTarget = { kind: TransactionKind; id: string };

// Same-process wake-up after commit. Subscribers still verify the stored state;
// another process or a missed signal is covered by the gateway's version check.
@Injectable()
export class TransactionChanges {
  private readonly listeners = new Set<(target: TransactionTarget) => void>();

  subscribe(listener: (target: TransactionTarget) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  committed(target: TransactionTarget) {
    for (const listener of this.listeners) listener(target);
  }
}
