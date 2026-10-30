import { describe, expect, it, vi } from 'vitest';
import {
  PublicListingService,
  publicEligibleStages,
} from './public-listing.service.js';
import type { MongoService } from '../../database/mongo/mongo.service.js';
import type { MongoPageService } from '../commands/mongo-page.service.js';
import type { MediaStorage } from '../media/media-storage.js';

// Query-count regression; real eligibility/snapshot races remain in listing-review E2E.
describe('bounded public listing projection', () => {
  function fixture(
    options: {
      empty?: boolean;
      originVersion?: number;
      missingOrigin?: boolean;
      missingLocality?: boolean;
      localityCode?: string;
      localityLabel?: string;
    } = {},
  ) {
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
        exchangePreferences:
          id === 'a'
            ? {
                targetCategory: 'Văn học',
                targetAuthor: 'Haruki Murakami',
                targetDescription: 'Cần sách bìa cứng',
              }
            : null,
      },
      b: { _id: 'book-' + id, currentRevisionId: 'metadata-' + id },
      u: { _id: 'owner', displayName: 'Synthetic reader' },
      rm: [],
      m: [],
      purchase: [],
      activeOrder: [],
    });
    const rows = options.empty ? [] : [row('a'), row('b')];
    const metadata = rows.map((r) => ({
      _id: r.b.currentRevisionId,
      title: 'Title ' + r._id,
      authors: [],
      language: 'vi',
    }));
    const aggregate = vi.fn((_pipeline: unknown[]) => ({
      toArray: async () => rows,
    }));
    const metadataFind = vi.fn(() => ({ toArray: async () => metadata }));
    const origins = options.missingOrigin
      ? []
      : [
          {
            _id: 'origin',
            version: options.originVersion ?? 1,
            serviceAreaCode: 'HCM-DEMO-v1',
            localityCode: options.localityCode ?? 'DEMO-B',
            recipientName: 'Private contact',
            phone: 'private phone',
            detail: 'Private street',
          },
        ];
    const localities = options.missingLocality
      ? []
      : [
          {
            _id: `HCM-DEMO-v1:${options.localityCode ?? 'DEMO-B'}`,
            code: options.localityCode ?? 'DEMO-B',
            label: options.localityLabel ?? 'Bình Dương',
          },
        ];
    const originFind = vi.fn(() => ({ toArray: async () => origins }));
    const localityFind = vi.fn(() => ({ toArray: async () => localities }));
    const metadataFindOne = vi.fn(async () => metadata[0]);
    const originFindOne = vi.fn(async () => origins[0] ?? null);
    const localityFindOne = vi.fn(async () => localities[0] ?? null);
    const tx = {
      c: {
        listings: { aggregate },
        catalog_revisions: { find: metadataFind, findOne: metadataFindOne },
        member_addresses: { find: originFind, findOne: originFindOne },
        service_localities: { find: localityFind, findOne: localityFindOne },
      },
    };
    const mongo = {
      tx: async (work: (value: typeof tx) => Promise<unknown>) => work(tx),
    } as unknown as MongoService;
    const pages = {
      page: async () => ({
        ids: options.empty ? [] : ['b', 'a'],
        nextCursor: null,
        serverTime: new Date().toISOString(),
      }),
    } as unknown as MongoPageService;
    return {
      service: new PublicListingService(mongo, pages, {} as MediaStorage),
      aggregate,
      metadataFind,
      originFind,
      localityFind,
      originFindOne,
      localityFindOne,
    };
  }
  it('reads metadata, current origin zones and directory labels once per page while preserving cursor order and privacy', async () => {
    const { service, aggregate, metadataFind, originFind, localityFind } =
      fixture();
    const page = await service.list({ limit: 20 });
    expect(metadataFind).toHaveBeenCalledTimes(1);
    expect(originFind).toHaveBeenCalledTimes(1);
    expect(localityFind).toHaveBeenCalledTimes(1);
    expect(originFind).toHaveBeenCalledWith(
      { _id: { $in: ['origin'] } },
      {
        projection: { _id: 1, version: 1, serviceAreaCode: 1, localityCode: 1 },
      },
    );
    expect(localityFind).toHaveBeenCalledWith(
      { _id: { $in: ['HCM-DEMO-v1:DEMO-B'] } },
      { projection: { _id: 1, code: 1, label: 1 } },
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
    expect(page.items[0].fulfillment?.locality).toEqual({
      code: 'DEMO-B',
      label: 'Bình Dương',
    });
    expect(page.items[1].exchangePreferences).toEqual({
      targetCategory: 'Văn học',
      targetAuthor: 'Haruki Murakami',
      targetDescription: 'Cần sách bìa cứng',
    });
    expect(page.items[0].exchangePreferences).toBeNull();
    for (const privateValue of [
      'originAddressId',
      'originAddressVersion',
      'recipientName',
      'phone',
      'detail',
      'Private contact',
      'Private street',
    ]) {
      expect(JSON.stringify(page)).not.toContain(privateValue);
    }
  });
  it('does not fetch metadata or origins for an empty page', async () => {
    const { service, aggregate, metadataFind, originFind, localityFind } =
      fixture({ empty: true });
    expect((await service.list({ limit: 20 })).items).toEqual([]);
    expect(aggregate).not.toHaveBeenCalled();
    expect(metadataFind).not.toHaveBeenCalled();
    expect(originFind).not.toHaveBeenCalled();
    expect(localityFind).not.toHaveBeenCalled();
  });
  it.each([
    ['DEMO-A', 'TP.HCM'],
    ['DEMO-B', 'Bình Dương'],
    ['DEMO-C', 'Vũng Tàu'],
  ])(
    'uses the same coarse %s directory label for shelf and detail',
    async (localityCode, localityLabel) => {
      const { service } = fixture({ localityCode, localityLabel });
      const page = await service.list({ limit: 20 });
      const detail = await service.detail('a');
      expect(page.items[0].fulfillment?.locality).toEqual({
        code: localityCode,
        label: localityLabel,
      });
      expect(detail.fulfillment).toEqual(page.items[0].fulfillment);
    },
  );
  it.each([{ originVersion: 2 }, { missingOrigin: true }])(
    'keeps changed or deleted origins private without publishing their new zone (%j)',
    async (options) => {
      const { service, localityFind, localityFindOne } = fixture(options);
      const page = await service.list({ limit: 20 });
      expect(page.items.every((item) => item.fulfillment === null)).toBe(true);
      expect((await service.detail('a')).fulfillment).toBeNull();
      expect(localityFind).not.toHaveBeenCalled();
      expect(localityFindOne).not.toHaveBeenCalled();
    },
  );
  it('omits unavailable directory labels instead of inferring a zone from the legacy envelope', async () => {
    const { service } = fixture({ missingLocality: true });
    const page = await service.list({ limit: 20 });
    expect(page.items[0].fulfillment).toEqual({
      serviceAreaCode: 'HCM-DEMO-v1',
      name: 'TP.HCM',
      demoOnly: true,
      method: 'DirectDelivery',
    });
    expect((await service.detail('a')).fulfillment).toEqual(
      page.items[0].fulfillment,
    );
  });
  it('continues excluding auction-only listings from marketplace reads', () => {
    expect(publicEligibleStages()[0].$match.channel).toEqual({
      $ne: 'Auction',
    });
    expect(publicEligibleStages('Auction')[0].$match.channel).toBe('Auction');
  });
});
