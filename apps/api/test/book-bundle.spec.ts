import { bundleCondition, normalizeBundle, validateBundle } from '../src/modules/listings/book-bundle.js';
import { requireChannelContent } from '../src/modules/listings/listing-channel.js';
import type { Wire } from '../src/modules/commands/domain-error.js';
import { validates } from './helpers/contract.js';

const bundle = (): Wire['BookBundle'] => ({
  title: 'Naruto tập 1–2', wholeOnly: true, exclusiveOwnershipDeclared: true,
  items: [{ label: 'Tập 1', condition: 'Good', notes: '' }, { label: 'Tập 2', condition: 'Fair', notes: 'Bìa sờn' }],
});
describe('whole-only bundle contract and invariants', () => {
  it('keeps existing single-book content valid', () => expect(() => validateBundle({mode:'Both'})).not.toThrow());
  it('validates the manifest and takes the worst item condition', () => {
    validates('BookBundle', bundle());
    expect(bundleCondition(bundle())).toBe('Fair');
    expect(() => validateBundle({bundle:bundle(), mode:'Sale', condition:'Fair'})).not.toThrow();
  });
  it.each(['Exchange','Both',null])('rejects partial-sale channels/modes: %s', mode => {
    expect(() => validateBundle({bundle:bundle(),mode})).toThrow();
  });
  it('rejects auction bundles even before a draft is submitted', () => {
    expect(() => requireChannelContent('Auction',{bundle:bundle(),mode:'Sale'})).toThrow();
  });
  it('rejects blank, equivalent and misleading condition labels', () => {
    const value=bundle(); value.items[1].label='  TẬP 1 ';
    expect(() => validateBundle({bundle:value,mode:'Sale'})).toThrow();
    value.items[1].label=' ';
    expect(() => validateBundle({bundle:value,mode:'Sale'})).toThrow();
    expect(() => validateBundle({bundle:bundle(),mode:'Sale',condition:'LikeNew'})).toThrow();
  });
  it('does not let an older client silently drop a bundle during replacement', () => {
    expect(() => validateBundle({mode:'Sale'},{bundle:bundle()})).toThrow();
    expect(() => validateBundle({mode:'Sale',bundle:null},{bundle:bundle()})).not.toThrow();
  });
  it('normalizes a copy without modifying a frozen caller intent', () => {
    const value=bundle(); value.title='  Bộ sách  ';value.items[0].label=' Tập 1 ';
    expect(normalizeBundle(value)?.title).toBe('Bộ sách');
    expect(value.items[0].label).toBe(' Tập 1 ');
  });
});
