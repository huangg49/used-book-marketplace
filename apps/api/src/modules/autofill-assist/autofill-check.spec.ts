import { describe, expect, it } from 'vitest';
import { checkAutofill, InvalidAutofillOutput } from './autofill-check.js';

const now = new Date('2026-10-27T00:00:00Z');

describe('autofill output check', () => {
  it('normalizes text, authors, language and a valid ISBN-10 to ISBN-13', () => {
    const out = checkAutofill(
      {
        // Decomposed "à" (a + combining grave) as some OCR output arrives.
        title: '  Nhà  giả kim ',
        authors: ['Tác giả: Paulo Coelho', 'Paulo Coelho', ''],
        publisher: 'NXB Hội Nhà Văn',
        publicationYear: 2020,
        language: 'Tiếng Việt',
        edition: 'Tái bản lần thứ 5',
        isbn: 'ISBN 0-306-40615-2',
        missing: ['Chụp rõ trang bản quyền'],
      },
      now,
    );
    expect(out.fields).toEqual({
      title: 'Nhà giả kim',
      authors: ['Paulo Coelho'],
      publisher: 'NXB Hội Nhà Văn',
      publicationYear: 2020,
      language: 'vi',
      edition: 'Tái bản lần thứ 5',
      isbn: '9780306406157',
    });
    expect(out.missing).toEqual(['Chụp rõ trang bản quyền']);
  });

  it('drops misread ISBNs, impossible years, bad languages and overlong text instead of repairing them', () => {
    const out = checkAutofill(
      {
        title: 'x'.repeat(301),
        authors: 'Nguyễn Nhật Ánh',
        publisher: 42,
        publicationYear: 2031,
        language: 'not a language tag!',
        edition: null,
        isbn: '9780306406158',
        missing: Array(9).fill('Chụp thêm'),
      },
      now,
    );
    expect(out.fields).toEqual({
      title: null,
      authors: [],
      publisher: null,
      publicationYear: null,
      language: null,
      edition: null,
      isbn: null,
    });
    expect(out.missing).toHaveLength(3);
  });

  it('rejects output that is not an object', () => {
    for (const bad of [null, 'text', [1], 3])
      expect(() => checkAutofill(bad, now)).toThrow(InvalidAutofillOutput);
  });
});
