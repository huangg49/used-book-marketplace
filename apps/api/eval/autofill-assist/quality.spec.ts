import { qualityGate, scoreAutofill } from './quality.js';
const expected = {
  title: 'Mắt biếc',
  authors: ['Nguyễn Nhật Ánh'],
  isbn: '9786041234567',
  publisher: 'NXB Trẻ',
  publicationYear: 2024,
  edition: 'Lần 2',
  language: 'vi',
};
const fields = { ...expected };
describe('reviewed real-camera AI evaluation', () => {
  it('scores accents and metadata separately and catches a different valid-looking ISBN', () => {
    expect(
      scoreAutofill(expected, {
        ...fields,
        title: 'Mat biec',
        isbn: '9786041234574',
        publisher: 'NXB khác',
      }),
    ).toMatchObject({
      titleExact: false,
      titleIgnoringAccents: true,
      isbnWrong: true,
      publisherExact: false,
      editionExact: true,
    });
    expect(scoreAutofill({ title: 'Book' }, null)).toMatchObject({
      titleExact: false,
      isbnWrong: null,
      publisherExact: null,
    });
  });
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `case-${i}`,
    bookKey: `book-${i}`,
    reviewed: true,
    scored: true,
    titleExact: true,
    isbnWrong: false,
  }));
  it('never accepts synthetic, partial, unreviewed or duplicated-book evidence', () => {
    expect(qualityGate('synthetic', rows)).toMatch(/NOT EVIDENCE/);
    expect(
      qualityGate('real-camera', [...rows, { id: 'skip', skipped: 'budget' }]),
    ).toMatch(/NOT EVIDENCE/);
    expect(
      qualityGate(
        'real-camera',
        rows.map((r) => ({ ...r, reviewed: false })),
      ),
    ).toMatch(/NOT EVIDENCE/);
    expect(
      qualityGate(
        'real-camera',
        rows.map((r) => ({ ...r, bookKey: 'one-book' })),
      ),
    ).toMatch(/NOT EVIDENCE/);
    expect(
      qualityGate(
        'real-camera',
        rows.map((r) => ({ ...r, isbnWrong: undefined })),
      ),
    ).toMatch(/NOT EVIDENCE/);
    expect(qualityGate('real-camera', rows)).toBe(true);
    expect(
      qualityGate(
        'real-camera',
        rows.map((r, i) => ({ ...r, isbnWrong: i === 0 })),
      ),
    ).toBe(false);
  });
});
