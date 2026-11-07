import { Test } from '@nestjs/testing';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WishlistService } from './wishlist.service.js';
import { PublicListingService } from '../listings/public-listing.service.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { CurrentUser } from '../auth/auth.service.js';

describe('WishlistService', () => {
  let service: WishlistService;
  let db: any;
  const publicViews = vi.fn();

  beforeEach(async () => {
    publicViews.mockReset().mockResolvedValue(new Map());
    db = {
      c: {
        wishlist_items: {
          find: vi
            .fn()
            .mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
          findOne: vi.fn(),
          findOneAndUpdate: vi.fn(),
          deleteOne: vi.fn(),
        },
        catalog_books: {
          find: vi.fn().mockReturnValue({ toArray: async () => [] }),
          findOne: vi.fn(),
        },
        listings: {
          findOne: vi.fn(),
        },
      },
    };

    db.tx = (callback: (tx: unknown) => unknown) =>
      callback({
        c: db.c,
        lock: vi.fn(),
        now: async () => new Date(),
      });
    const module = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: MongoService, useValue: db },
        { provide: PublicListingService, useValue: { publicViews } },
      ],
    }).compile();

    service = module.get(WishlistService);
  });

  const user = {
    id: randomUUID(),
    email: 'test@example.com',
    status: 'ACTIVE',
    sessionId: randomUUID(),
    roles: ['MEMBER'],
    hasRole: () => true,
  } as unknown as CurrentUser;

  it('should list wishlist items', async () => {
    const items = [
      {
        _id: randomUUID(),
        userId: user.id,
        subjectType: 'CATALOG_BOOK',
        subjectId: randomUUID(),
        wantsToExchange: true,
        receiveNotifications: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    db.c.wishlist_items.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(items),
    });

    const result = await service.read(user, { limit: 10 });
    expect(result.items.length).toBe(1);
    expect(result.items[0].subjectType).toBe('CATALOG_BOOK');
  });

  it('keeps saved references but only projects listings eligible for the public shelf', async () => {
    const ids = [randomUUID(), randomUUID()];
    const at = new Date();
    db.c.wishlist_items.find.mockReturnValue({
      toArray: async () =>
        ids.map((id) => ({
          _id: randomUUID(),
          subjectId: id,
          subjectType: 'LISTING',
          wantsToExchange: true,
          receiveNotifications: false,
          createdAt: at,
          updatedAt: at,
        })),
    });
    const publicListing = { id: ids[0], salePrice: 80000 };
    publicViews.mockResolvedValue(new Map([[ids[0], publicListing]]));
    const { items } = await service.read(user, { limit: 2 });
    expect(publicViews).toHaveBeenCalledWith(expect.anything(), ids);
    expect(items[0].listing).toEqual(publicListing);
    expect(items[1]).toMatchObject({
      subjectId: ids[1],
      wantsToExchange: true,
    });
    expect(items[1]).not.toHaveProperty('listing');
    expect(db.c.listings.findOne).not.toHaveBeenCalled();
  });

  it('uses the last row ID to continue across equal timestamps', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const [second, first] = [randomUUID(), randomUUID()].sort();
    const rows = [first, second].map((_id) => ({
      _id,
      subjectId: randomUUID(),
      subjectType: 'LISTING',
      wantsToExchange: false,
      receiveNotifications: true,
      createdAt,
      updatedAt: createdAt,
    }));
    db.c.wishlist_items.find
      .mockReturnValueOnce({ toArray: async () => rows })
      .mockReturnValueOnce({ toArray: async () => rows.slice(1) });
    const firstPage = await service.read(user, { limit: 1 });
    const nextPage = await service.read(user, {
      limit: 1,
      cursor: firstPage.nextCursor!,
    });
    expect(firstPage.items[0].id).toBe(first);
    expect(nextPage.items[0].id).toBe(second);
    expect(db.c.wishlist_items.find).toHaveBeenLastCalledWith(
      {
        userId: user.id,
        $or: [
          { createdAt: { $lt: createdAt } },
          { createdAt, _id: { $lt: first } },
        ],
      },
      { sort: { createdAt: -1, _id: -1 }, limit: 2 },
    );
  });

  it('still accepts older timestamp cursors and rejects invalid cursors', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    await service.read(user, { limit: 1, cursor: createdAt.toISOString() });
    expect(db.c.wishlist_items.find).toHaveBeenCalledWith(
      { userId: user.id, createdAt: { $lt: createdAt } },
      expect.anything(),
    );
    await expect(
      service.read(user, { limit: 1, cursor: 'invalid' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a new save of an ineligible listing and lets an existing item retain its preferences', async () => {
    const listingId = randomUUID();
    const preferences = { wantsToExchange: false, receiveNotifications: true };
    await expect(
      service.save(user, 'LISTING', listingId, preferences),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.c.wishlist_items.findOneAndUpdate).not.toHaveBeenCalled();
    const existing = {
      _id: randomUUID(),
      subjectType: 'LISTING',
      subjectId: listingId,
      ...preferences,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.c.wishlist_items.findOne.mockResolvedValue(existing);
    db.c.wishlist_items.findOneAndUpdate.mockResolvedValue(existing);
    await expect(
      service.save(user, 'LISTING', listingId, preferences),
    ).resolves.toMatchObject(preferences);
  });

  it('should save a book to wishlist', async () => {
    const bookId = randomUUID();
    db.c.catalog_books.findOne.mockResolvedValue({
      _id: bookId,
      status: 'Confirmed',
    });

    db.c.wishlist_items.findOneAndUpdate.mockResolvedValue({
      _id: randomUUID(),
      userId: user.id,
      subjectType: 'CATALOG_BOOK',
      subjectId: bookId,
      wantsToExchange: true,
      receiveNotifications: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.save(user, 'CATALOG_BOOK', bookId, {
      wantsToExchange: true,
      receiveNotifications: false,
    });

    expect(result.subjectType).toBe('CATALOG_BOOK');
    expect(result.subjectId).toBe(bookId);
  });

  it('should remove a book from wishlist', async () => {
    const bookId = randomUUID();
    await service.remove(user, 'CATALOG_BOOK', bookId);
    expect(db.c.wishlist_items.deleteOne).toHaveBeenCalledWith({
      userId: user.id,
      subjectType: 'CATALOG_BOOK',
      subjectId: bookId,
    });
  });
});
