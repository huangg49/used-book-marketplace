import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const contract = parse(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@used-books/api-contract/openapi.yaml',
    ),
    'utf8',
  ),
);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema({ $id: 'listing-contract', components: contract.components });
const validator = (name: string) =>
  ajv.compile({ $ref: `listing-contract#/components/schemas/${name}` });
const content = () => ({
  bookId: randomUUID(),
  mode: 'Both',
  condition: 'Good',
  pages: 'Đủ trang',
  coverNote: 'Góc bìa sờn',
  notes: 'Không có',
  accessories: 'Không có',
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  description:
    'Một cuốn sách đã đọc, bìa có dấu sử dụng nhưng nội dung rõ ràng.',
  salePrice: 125000,
  exchangeValue: 150000,
  mediaIds: [randomUUID()],
});

describe('listing design contract (not HTTP implementation tests)', () => {
  it('compiles every schema and resolves every local reference', () => {
    for (const name of Object.keys(contract.components.schemas))
      expect(() => validator(name)).not.toThrow();
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (
          key === '$ref' &&
          typeof value === 'string' &&
          value.startsWith('#/')
        ) {
          let found = contract;
          for (const part of value.slice(2).split('/')) found = found?.[part];
          expect(found, value).toBeDefined();
        } else visit(value);
      }
    };
    visit(contract);
  });

  it('keeps planned endpoints explicit, unique, private by default and mutations keyed', () => {
    const ids = new Set<string>();
    const publicIds = new Set([
      'getCatalogTaxonomy',
      'listBooks',
      'getBook',
      'listPublicListings',
      'getPublicListing',
      'getPublicListingMedia',
      'listAuctions',
      'getAuction',
      'getAuctionPhoto',
    ]);
    let planned = 0;
    for (const [path, item] of Object.entries(contract.paths)) {
      for (const [method, operation] of Object.entries(
        item as Record<string, Record<string, any>>,
      )) {
        expect(ids.has(operation.operationId)).toBe(false);
        ids.add(operation.operationId);
        if (!operation['x-implementation-status']) continue;
        planned++;
        expect(['planned', 'implemented']).toContain(
          operation['x-implementation-status'],
        );
        expect(operation.security, operation.operationId).toEqual(
          publicIds.has(operation.operationId) ? [] : [{ bearerAuth: [] }],
        );
        if (method !== 'get')
          expect(operation.parameters).toContainEqual(
            expect.objectContaining({
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
            }),
          );
        expect(
          operation.responses['200'].headers['Cache-Control'].schema.const,
        ).toBe('no-store');
        for (const match of path.matchAll(/\{([^}]+)\}/g))
          expect(operation.parameters).toContainEqual(
            expect.objectContaining({
              name: match[1],
              in: 'path',
              required: true,
            }),
          );
      }
    }
    expect(planned).toBeGreaterThanOrEqual(30);
  });

  it('allows partial drafts but does not accept server-owned or unknown fields', () => {
    const draft = {
      ...content(),
      bookId: null,
      mode: null,
      condition: null,
      pages: '',
      description: '',
      readable: null,
      hasMissingPages: null,
      missingEssentialContent: null,
      salePrice: null,
      exchangeValue: null,
      mediaIds: [],
    };
    expect(validator('DraftContent')(draft)).toBe(true);
    expect(validator('CreateDraft')({ content: draft })).toBe(true);
    expect(
      validator('CreateDraft')({
        content: { ...draft, mediaIds: [randomUUID()] },
      }),
    ).toBe(false);
    expect(validator('SubmittedContent')(draft)).toBe(false);
    expect(validator('DraftContent')({ ...draft, salePrice: 10000 })).toBe(
      false,
    );
    expect(
      validator('CreateDraft')({ content: draft, ownerId: randomUUID() }),
    ).toBe(false);
  });

  it('enforces integer VND boundaries and all three mode combinations', () => {
    const validate = validator('SubmittedContent');
    for (const price of [10000, 1000000])
      expect(validate({ ...content(), salePrice: price })).toBe(true);
    for (const price of [9999, 1000001, 10000.5, '125000', null])
      expect(validate({ ...content(), salePrice: price })).toBe(false);
    expect(validate({ ...content(), mode: 'Sale', exchangeValue: null })).toBe(
      true,
    );
    expect(validate({ ...content(), mode: 'Exchange', salePrice: null })).toBe(
      true,
    );
    expect(validate({ ...content(), mode: 'Sale' })).toBe(false);
    expect(validate({ ...content(), mode: 'Exchange' })).toBe(false);
  });

  it('checks text code-point limits, media cardinality and readability declarations', () => {
    const validate = validator('SubmittedContent');
    for (const length of [30, 5000])
      expect(validate({ ...content(), description: '📚'.repeat(length) })).toBe(
        true,
      );
    for (const length of [29, 5001])
      expect(validate({ ...content(), description: 'a'.repeat(length) })).toBe(
        false,
      );
    for (const count of [0, 9])
      expect(
        validate({
          ...content(),
          mediaIds: Array.from({ length: count }, randomUUID),
        }),
      ).toBe(false);
    const id = randomUUID();
    expect(validate({ ...content(), mediaIds: [id, id] })).toBe(false);
    expect(validate({ ...content(), readable: false })).toBe(false);
    expect(validate({ ...content(), missingEssentialContent: true })).toBe(
      false,
    );
    expect(validate({ ...content(), hasMissingPages: true })).toBe(true);
  });

  it('requires exact review decisions/checklists and rejects arbitrary state injection', () => {
    const command = {
      expectedVersion: 2,
      revisionId: randomUUID(),
      decision: 'Reject',
      reason: 'Ảnh chưa thể hiện rõ tình trạng bìa.',
    };
    expect(validator('DecideListing')(command)).toBe(true);
    expect(validator('DecideListing')({ ...command, reason: '' })).toBe(false);
    expect(
      validator('DecideListing')({ ...command, decision: 'Approve' }),
    ).toBe(false);
    expect(
      validator('SetVisibility')({ expectedVersion: 2, visibility: 'Removed' }),
    ).toBe(false);
    expect(
      validator('SubmitListing')({
        expectedVersion: 2,
        ownershipDeclared: false,
      }),
    ).toBe(false);
    expect(validator('VersionCommand')({ expectedVersion: 0 })).toBe(false);
  });

  it('keeps the public projection closed and safe errors backwards compatible', () => {
    const {
      bookId: _bookId,
      mediaIds: _mediaIds,
      ...publicContent
    } = content();
    const listing = {
      ...publicContent,
      id: randomUUID(),
      revisionId: randomUUID(),
      version: 3,
      book: {
        id: randomUUID(),
        title: 'Sách',
        authors: ['Tác giả'],
        publisher: null,
        publicationYear: null,
        language: 'vi',
        edition: null,
        category: 'Văn học',
        isbn: null,
      },
      seller: { id: randomUUID(), displayName: 'Bạn đọc' },
      photos: [
        {
          id: randomUUID(),
          width: 800,
          height: 1200,
        },
      ],
      publishedAt: new Date().toISOString(),
      fulfillment: null,
      purchaseAvailability: { status: 'Available', expiresAt: null },
    };
    expect(validator('PublicListing')(listing)).toBe(true);
    expect(
      validator('PublicListing')({
        ...listing,
        photos: [
          { ...listing.photos[0], url: 'https://example.invalid/private' },
        ],
      }),
    ).toBe(false);
    expect(
      validator('PublicListing')({ ...listing, removalReason: 'private' }),
    ).toBe(false);
    expect(
      validator('PublicListing')({
        ...listing,
        seller: { ...listing.seller, email: 'private@example.com' },
      }),
    ).toBe(false);
    const error = {
      statusCode: 422,
      code: 'ListingInvalid',
      message: 'Kiểm tra thông tin.',
      requestId: randomUUID(),
    };
    expect(validator('ApiError')(error)).toBe(true);
    expect(validator('ListingApiError')(error)).toBe(true);
    expect(
      validator('ListingApiError')({
        ...error,
        code: 'UnspecifiedDatabaseError',
      }),
    ).toBe(false);
    expect(
      validator('ApiError')({
        ...error,
        fieldErrors: [
          {
            path: '/content/description',
            code: 'Required',
            message: 'Thêm mô tả.',
          },
        ],
      }),
    ).toBe(true);
    expect(validator('ApiError')({ ...error, stack: 'internal' })).toBe(false);
  });
});
