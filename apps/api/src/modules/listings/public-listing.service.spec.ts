import { describe, expect, it, vi } from 'vitest';
import { PublicListingService } from './public-listing.service.js';
import type { MongoService } from '../../database/mongo/mongo.service.js';
import type { MongoPageService } from '../commands/mongo-page.service.js';
import type { MediaStorage } from '../media/media-storage.js';

// Query-count regression; real eligibility/snapshot races remain in listing-review E2E.
describe('bounded public listing projection', () => {
  function fixture(empty = false) {
    const row = (id: string) => ({
      _id: id,
      version: 1,
      trade: 'Available',
      publishedAt: new Date(),
      r: {
        _id: 'revision-' + id,
        mode: 'Both',
        condition: 'Good',
        salePrice: 75000,
        exchangeValue: 80000,
        originAddressId: 'origin',
        originAddressVersion: 1,
        pages: '',
        coverNote: '',
        notes: '',
        accessories: '',
        description: '',
        hasMissingPages: false,
      },
      b: { _id: 'book-' + id, currentRevisionId: 'metadata-' + id },
      u: { _id: 'owner', displayName: 'Synthetic reader' },
      rm: [],
      m: [],
      purchase: [],
      activeOrder: [],
    });
    const rows = empty ? [] : [row('a'), row('b')];
    const metadata = rows.map((r) => ({
      _id: r.b.currentRevisionId,
      title: 'Title ' + r._id,
      authors: [],
      language: 'vi',
    }));
    const aggregate = vi.fn((_pipeline: unknown[]) => ({ toArray: async () => rows }));
    const metadataFind = vi.fn(() => ({ toArray: async () => metadata }));
    const originFind = vi.fn(() => ({
      toArray: async () => [{ _id: 'origin', version: 1 }],
    }));
    const tx = {
      c: {
        listings: { aggregate },
        catalog_revisions: { find: metadataFind },
        member_addresses: { find: originFind },
      },
    };
    const mongo = {
      tx: async (work: (value: typeof tx) => Promise<unknown>) => work(tx),
    } as unknown as MongoService;
    const pages = {
      page: async () => ({
        ids: empty ? [] : ['b', 'a'],
        nextCursor: null,
        serverTime: new Date().toISOString(),
      }),
    } as unknown as MongoPageService;
    return {
      service: new PublicListingService(mongo, pages, {} as MediaStorage),
      aggregate,
      metadataFind,
      originFind,
    };
  }
  it('reads all metadata and origin versions once in the same snapshot, preserving cursor order and response content', async () => {
    const { service, aggregate, metadataFind, originFind } = fixture();
    const page = await service.list({ limit: 20 });
    expect(metadataFind).toHaveBeenCalledTimes(1);
    expect(originFind).toHaveBeenCalledTimes(1);
    expect(originFind).toHaveBeenCalledWith(
      { _id: { $in: ['origin'] } },
      { projection: { _id: 1, version: 1 } },
    );
    expect(aggregate.mock.calls[0][0][0]).toEqual({
      $match: { _id: { $in: ['b', 'a'] } },
    });
    expect(page.items.map((item) => [item.id, item.book.title])).toEqual([
      ['b', 'Title b'],
      ['a', 'Title a'],
    ]);
    expect(
      page.items.every((item) => item.fulfillment?.method === 'DirectDelivery'),
    ).toBe(true);
    expect(JSON.stringify(page)).not.toContain('originAddressId');
  });
  it('does not fetch metadata or origins for an empty page', async () => {
    const { service, aggregate, metadataFind, originFind } = fixture(true);
    expect((await service.list({ limit: 20 })).items).toEqual([]);
    expect(aggregate).not.toHaveBeenCalled();
    expect(metadataFind).not.toHaveBeenCalled();
    expect(originFind).not.toHaveBeenCalled();
  });
});
