import type { Tx } from '../../database/mongo/transaction.js';
import { checkMessageSendRate } from './message-send-limits.js';

const sender = 'fixture-member';
const now = new Date('2026-01-01T00:01:00.000Z');

describe('shared purchase and exchange message limit', () => {
  it.each([
    [0, 19],
    [10, 9],
    [19, 0],
  ])(
    'allows message 20 after %s purchase and %s exchange sends',
    async (purchase, exchange) => {
      const purchaseCount = vi.fn().mockResolvedValue(purchase);
      const exchangeCount = vi.fn().mockResolvedValue(exchange);
      const tx = {
        c: {
          purchase_messages: { countDocuments: purchaseCount },
          exchange_messages: { countDocuments: exchangeCount },
        },
      } as unknown as Tx;
      await expect(
        checkMessageSendRate(tx, sender, now),
      ).resolves.toBeUndefined();
      const filter = {
        senderId: sender,
        sentAt: { $gt: new Date(now.getTime() - 60_000) },
      };
      expect(purchaseCount).toHaveBeenCalledWith(filter, { limit: 20 });
      expect(exchangeCount).toHaveBeenCalledWith(
        { ...filter, memberAuthored: true },
        { limit: 20 - purchase },
      );
    },
  );

  it.each([
    [20, 0],
    [10, 10],
    [0, 20],
  ])(
    'refuses message 21 after %s purchase and %s exchange sends',
    async (purchase, exchange) => {
      const tx = {
        c: {
          purchase_messages: {
            countDocuments: vi.fn().mockResolvedValue(purchase),
          },
          exchange_messages: {
            countDocuments: vi.fn().mockResolvedValue(exchange),
          },
        },
      } as unknown as Tx;
      await expect(checkMessageSendRate(tx, sender, now)).rejects.toMatchObject(
        { status: 429 },
      );
    },
  );
});
