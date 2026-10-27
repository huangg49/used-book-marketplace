import { describe, it, expect, vi } from 'vitest';
import {
  dailyPipeline,
  moderationWindow,
  OperationsDashboardService,
} from './operations-dashboard.service.js';
import type { MongoCommandService } from '../commands/mongo-command.service.js';

describe('moderation calendar and authorization', () => {
  it('uses local midnight, fills calendar days and ignores the host timezone', () => {
    const before = moderationWindow(new Date('2026-10-26T16:59:59Z'), 7);
    const after = moderationWindow(new Date('2026-10-26T17:00:00Z'), 7);
    expect(before.dates.at(-1)).toBe('2026-10-26');
    expect(after.dates.at(-1)).toBe('2026-10-27');
    expect(after.start.toISOString()).toBe('2026-10-20T17:00:00.000Z');
    expect(
      moderationWindow(new Date('2026-03-01T00:00:00Z'), 30).dates,
    ).toHaveLength(30);
  });
  it('bounds history at the server clock and groups submissions and decisions on their own dates', () => {
    const now = new Date(),
      start = new Date(now.getTime() - 1000);
    expect(dailyPipeline('decidedAt', start, now)[0]).toEqual({
      $match: { decidedAt: { $gte: start, $lte: now } },
    });
    expect(JSON.stringify(dailyPipeline('submittedAt', start, now))).toContain(
      'Asia/Ho_Chi_Minh',
    );
  });
  it.each(['MEMBER', 'TEST_OPERATOR'])(
    'rejects %s again in the service before touching collections',
    async (role) => {
      const read = vi.fn((_auth, callback) =>
        callback({}, { status: 'ACTIVE', roles: [{ role }] }),
      );
      const service = new OperationsDashboardService({
        read,
      } as unknown as MongoCommandService);
      await expect(service.overview({} as never, {})).rejects.toThrow();
    },
  );
  it.each(['LOCKED', 'RESTRICTED', 'DISABLED'])(
    'rejects a currently %s reviewer in the transaction',
    async (status) => {
      const read = vi.fn((_auth, callback) =>
        callback({}, { status, roles: [{ role: 'ADMIN' }] }),
      );
      await expect(
        new OperationsDashboardService({
          read,
        } as unknown as MongoCommandService).overview({} as never, {}),
      ).rejects.toThrow();
    },
  );
});
