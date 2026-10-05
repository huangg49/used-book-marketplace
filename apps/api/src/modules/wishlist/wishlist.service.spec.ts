import { Test } from '@nestjs/testing';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WishlistService } from './wishlist.service.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { CurrentUser } from '../auth/auth.service.js';

describe('WishlistService', () => {
  let service: WishlistService;
  let db: any;

  beforeEach(async () => {
    db = {
      c: {
        wishlist_items: {
          find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
          findOne: vi.fn(),
          findOneAndUpdate: vi.fn(),
          deleteOne: vi.fn(),
        },
        catalog_books: {
          findOne: vi.fn(),
        },
        listings: {
          findOne: vi.fn(),
        },
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        WishlistService,
        { provide: MongoService, useValue: db },
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

  it('should save a book to wishlist', async () => {
    const bookId = randomUUID();
    db.c.catalog_books.findOne.mockResolvedValue({ _id: bookId, status: 'Confirmed' });
    
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
