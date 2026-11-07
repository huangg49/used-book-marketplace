import type { Filter, FindOptions } from 'mongodb';
import type { ExchangeMessageDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import type {
  Actor,
  CurrentActor,
  MongoCommandService,
} from '../commands/mongo-command.service.js';
import { ExchangesService } from './exchanges.service.js';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const exchangeId = uuid(1);
const memberId = uuid(2);
const at = new Date('2026-01-01T00:00:00.000Z');
const messages: ExchangeMessageDoc[] = Array.from(
  { length: 501 },
  (_, index) => ({
    _id: uuid(1000 + index),
    exchangeId,
    senderId: memberId,
    body: 'Synthetic fixture',
    sentAt: at,
  }),
);

function setup(actorId = memberId) {
  const find = vi.fn(
    (filter: Filter<ExchangeMessageDoc>, options: FindOptions) => {
      const beforeId = filter.$or?.[1]?._id as { $lt: string } | undefined;
      const rows = messages.filter(
        (row) =>
          row.exchangeId === filter.exchangeId &&
          (!beforeId || row._id < beforeId.$lt),
      );
      if ((options.sort as { sentAt: number }).sentAt === -1) rows.reverse();
      return { toArray: async () => rows.slice(0, options.limit) };
    },
  );
  const tx = {
    c: {
      exchanges: {
        findOne: async () => ({ initiatorId: memberId, recipientId: uuid(3) }),
      },
      exchange_messages: { find },
    },
  } as unknown as Tx;
  const commands = {
    read: (_auth: Actor, work: (tx: Tx, actor: CurrentActor) => unknown) =>
      work(tx, { _id: actorId } as CurrentActor),
  } as MongoCommandService;
  const service = new ExchangesService(
    null!,
    null!,
    commands,
    null!,
    null!,
    null!,
    null!,
  );
  return { service, find, auth: {} as Actor };
}

describe('exchange history', () => {
  it('returns the most recent 500 in reading order to legacy clients', async () => {
    const { service, auth } = setup();
    const result = await service.getMessages(auth, exchangeId);
    expect(result.items.map((message) => message.id)).toEqual(
      messages.slice(1).map((message) => message._id),
    );
    expect(result).not.toHaveProperty('olderCursor');
  });

  it('can walk the whole history with identical timestamps without gaps or repeats', async () => {
    const { service, auth, find } = setup();
    const read: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.getMessages(auth, exchangeId, cursor, 40);
      read.unshift(...page.items.map((message) => message.id));
      cursor = page.olderCursor ?? undefined;
    } while (cursor && read.length <= messages.length);
    expect(find).toHaveBeenCalledTimes(13);
    expect(read).toEqual(messages.map((message) => message._id));
  });

  it('checks participation first and refuses a cursor issued for a different exchange', async () => {
    const cursor = Buffer.from(
      `${uuid(4)}/${at.toISOString()}/${messages[0]._id}`,
    ).toString('base64url');
    const participant = setup();
    await expect(
      participant.service.getMessages(participant.auth, exchangeId, cursor, 40),
    ).rejects.toMatchObject({ status: 400 });
    const outsider = setup(uuid(5));
    await expect(
      outsider.service.getMessages(outsider.auth, exchangeId, cursor, 40),
    ).rejects.toMatchObject({ status: 404 });
    expect(outsider.find).not.toHaveBeenCalled();
  });
});
