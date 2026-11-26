import { keyWords, redactReason, redactSnapshot, sensitiveKey } from '../src/modules/audit-log/audit-redaction.js';

describe('Admin activity log redaction (FR-G05, NFR-13)', () => {
  it('splits camelCase and snake_case keys into words', () => {
    expect(keyWords('refreshTokenHash')).toEqual(['refresh', 'token', 'hash']);
    expect(keyWords('recipient_phone')).toEqual(['recipient', 'phone']);
    expect(keyWords('IBANNumber')).toEqual(['iban', 'number']);
  });

  it('drops credential, contact and address keys but keeps lookalikes', () => {
    for (const key of ['passwordHash', 'accessToken', 'phone', 'emailNormalized', 'shippingAddress',
      'recipientName', 'collectionCode', 'signedUrl', 'idempotencyKey', 'note', 'autoCeiling'])
      expect(sensitiveKey(key)).toBe(true);
    for (const key of ['state', 'version', 'entityId', 'relatedReference', 'unlockCondition',
      'currentPrice', 'status', 'decision'])
      expect(sensitiveKey(key)).toBe(false);
  });

  it('keeps scalars and scalar arrays, removes nested/personal values and counts them', () => {
    const { snapshot, redacted } = redactSnapshot({
      state: 'LOCKED',
      version: 2,
      ok: true,
      gone: null,
      at: new Date('2026-11-26T00:00:00Z'),
      tags: ['a', 1, false],
      passwordHash: 'x',
      profile: { displayName: 'A' },
      mixed: ['a', { b: 1 }],
      relatedReference: 'liên hệ qa@example.com',
      other: '0912345678',
      nan: Number.NaN,
    });
    expect(snapshot).toEqual({
      state: 'LOCKED',
      version: 2,
      ok: true,
      gone: null,
      at: '2026-11-26T00:00:00.000Z',
      tags: ['a', 1, false],
    });
    expect(redacted).toBe(6);
  });

  it('truncates long strings and caps arrays and field count', () => {
    const long = 'x'.repeat(900);
    const big = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`f${i}`, i]));
    const { snapshot } = redactSnapshot({ long, list: Array.from({ length: 30 }, (_, i) => i) });
    expect((snapshot!.long as string).length).toBe(500);
    expect(snapshot!.list).toHaveLength(20);
    const capped = redactSnapshot(big);
    expect(Object.keys(capped.snapshot!)).toHaveLength(60);
    expect(capped.redacted).toBe(10);
  });

  it('returns null for missing or non-object snapshots', () => {
    expect(redactSnapshot(null)).toEqual({ snapshot: null, redacted: 0 });
    expect(redactSnapshot(['a'])).toEqual({ snapshot: null, redacted: 0 });
    expect(redactSnapshot('text')).toEqual({ snapshot: null, redacted: 0 });
  });

  it('masks contact data quoted in a reason', () => {
    expect(redactReason('Gọi 0912345678 hoặc mail a.b@example.com')).toBe(
      'Gọi [SĐT đã ẩn] hoặc mail [email đã ẩn]',
    );
    expect(redactReason(null)).toBeNull();
  });
});
