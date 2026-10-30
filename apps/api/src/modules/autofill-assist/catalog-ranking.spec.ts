import { catalogPrefixes, rankCatalog } from './catalog-ranking.js';
import { recoveryKeys } from '../../common/catalog-recovery-keys.js';
import type { Wire } from '../commands/domain-error.js';
const hints = (
  title: string | null,
  authors: string[] = [],
): Wire['AutofillFields'] => ({
  title,
  authors,
  isbn: null,
  publisher: null,
  publicationYear: null,
  language: null,
  edition: null,
});
const book = (
  id: string,
  title: string,
  authors = ['Nguyễn Nhật Ánh'],
  edition: string | null = null,
): Wire['PublicBook'] => ({
  id,
  title,
  authors,
  publisher: 'NXB Trẻ',
  publicationYear: 2020,
  language: 'vi',
  edition,
  isbn: null,
  category: 'Văn học',
});
const wrap = (b: Wire['PublicBook']) => ({ book: b, pending: false });
describe('catalog recovery ranking', () => {
  it('recovers a character error without silently correcting the OCR text', () => {
    const query = hints('Chiếc bình cầu vồng', ['Andrea Hirata']);
    expect(
      rankCatalog(query, [
        wrap(book('1', 'Chiến binh cầu vồng', ['Andrea Hirata'])),
      ])[0],
    ).toMatchObject({ matchedBy: 'SimilarTitle', warnings: ['CheckEdition'] });
    expect(query.title).toBe('Chiếc bình cầu vồng');
  });
  it('recovers swapped OCR roles only with both independent clues', () => {
    const b = wrap(book('1', 'Mắt biếc'));
    expect(
      rankCatalog(hints('nguyên nhất ánh', ['mát biếc']), [b])[0].matchedBy,
    ).toBe('SwappedText');
    expect(rankCatalog(hints('Nguyễn Nhật Ánh'), [b])).toEqual([]);
    expect(
      rankCatalog(hints('Nguyễn Nhật Ánh mắt biếc'), [b])[0].matchedBy,
    ).toBe('SwappedText');
  });
  it('ranks shared authors above a same-title book by another writer', () => {
    const ranked = rankCatalog(hints('Mắt biếc', ['Nguyễn Nhật Ánh']), [
      wrap(book('a', 'Mắt biếc', ['Tác giả khác'])),
      wrap(book('b', 'Mắt biếc')),
    ]);
    expect(ranked.map((m) => m.book.id)).toEqual(['b', 'a']);
    expect(ranked[1].warnings).toContain('AuthorDiffers');
  });
  it('does not hide missing volume identity for a series-only OCR title', () => {
    const results = rankCatalog(hints('Doraemon', ['Fujiko F. Fujio']), [
      wrap(
        book('1', '45 chương mở đầu bộ truyện ngắn Doraemon - Tập 1', [
          'Fujiko F. Fujio',
        ]),
      ),
      wrap(
        book('2', '45 chương mở đầu bộ truyện ngắn Doraemon - Tập 2', [
          'Fujiko F. Fujio',
        ]),
      ),
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((m) => m.warnings.includes('VolumeUnclear'))).toBe(
      true,
    );
  });
  it('excludes explicitly conflicting volumes and ISBN even for an exact title', () => {
    const query = { ...hints('Doraemon', ['Fujiko']), edition: 'Tập 1' };
    expect(
      rankCatalog(query, [
        wrap(book('1', 'Doraemon', ['Fujiko'], 'Tập 1')),
        wrap(book('2', 'Doraemon', ['Fujiko'], 'Tập 2')),
      ]).map((m) => m.book.id),
    ).toEqual(['1']);
    expect(
      rankCatalog({ ...hints('Mắt biếc'), isbn: '9786041234567' }, [
        wrap(book('1', 'Mắt biếc')),
      ]),
    ).toEqual([]);
  });
  it('keeps metadata differences visible and does not invent a confidence score', () => {
    const result = rankCatalog(
      {
        ...hints('Mắt biếc'),
        publisher: 'NXB Khác',
        language: 'en',
        publicationYear: 2019,
      },
      [wrap(book('1', 'Mắt biếc'))],
    )[0];
    expect(result.warnings).toEqual([
      'CheckEdition',
      'PublisherDiffers',
      'YearDiffers',
      'LanguageDiffers',
    ]);
    expect(result).not.toHaveProperty('confidence');
  });
  it('normalizes Roman volume numerals and refuses contradictory hints', () => {
    const b = wrap(book('1', 'Doraemon', ['Fujiko'], 'Tập 1'));
    expect(
      rankCatalog({ ...hints('Doraemon'), edition: 'Tập I' }, [b]),
    ).toHaveLength(1);
    expect(
      rankCatalog({ ...hints('Doraemon - Tập 1'), edition: 'Tập II' }, [b]),
    ).toEqual([]);
  });
  it('derives stable indexed keys from interior title/author words without regex metacharacters', () => {
    expect(
      recoveryKeys('45 chương mở đầu Doraemon - Tập 1', ['FUJIKO F. FUJIO']),
    ).toContain('dor');
    expect(
      catalogPrefixes(hints('.* (Mắt biếc)', ['Nguyễn Nhật Ánh'])),
    ).toContain('mat');
    expect(
      catalogPrefixes(
        hints(
          'a'.repeat(300),
          Array.from({ length: 10 }, () => 'x'.repeat(200)),
        ),
      ).length,
    ).toBeLessThanOrEqual(12);
  });
});
