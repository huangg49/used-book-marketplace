import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { onMemberInboxChanged } from './member-inbox-signal.js';

export const transactionKinds = ['exchange', 'order', 'conversation', 'inbox'] as const;
export type TransactionKind = (typeof transactionKinds)[number];
export type TransactionTarget = { kind: TransactionKind; id: string };

// Same-process wake-up after commit. Subscribers still verify the stored state;
// another process or a missed signal is covered by the gateway's version check.
@Injectable()
export class TransactionChanges implements OnModuleDestroy {
  private readonly listeners = new Set<(target: TransactionTarget) => void>();
  private readonly entityListeners = new Set<(entityType: string) => void>();
  // Notification writes outside the command executor reach the same bus.
  private readonly stopInbox = onMemberInboxChanged(id => this.committed({ kind: 'inbox', id }));

  onModuleDestroy() {
    this.stopInbox();
  }

  subscribe(listener: (target: TransactionTarget) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  committed(target: TransactionTarget) {
    for (const listener of this.listeners) listener(target);
  }

  // Every command that commits a change, by entity type (staff queues).
  subscribeEntities(listener: (entityType: string) => void) {
    this.entityListeners.add(listener);
    return () => { this.entityListeners.delete(listener); };
  }

  entityCommitted(entityType: string) {
    for (const listener of this.entityListeners) listener(entityType);
  }
}
