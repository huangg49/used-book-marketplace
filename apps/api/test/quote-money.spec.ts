import { quoteAmounts } from '../src/modules/quotes/quote-money.js';
describe('DirectDelivery quote money', () => {
  it('matches the SRS example without commission on shipping', () => {
    expect(quoteAmounts(200000, 30000, 500)).toEqual({
      bookPrice: 200000,
      shippingFee: 30000,
      commissionBps: 500,
      commission: 10000,
      buyerTotal: 230000,
      sellerProceeds: 220000,
    });
  });
  it.each([
    [10009, 500],
    [10010, 501],
    [10011, 501],
    [10000, 500],
    [1000000, 50000],
  ])('rounds %i half up to integer VND', (price, fee) => {
    const a = quoteAmounts(price, 30000, 500);
    expect(a.commission).toBe(fee);
    expect(a.sellerProceeds + a.commission).toBe(a.buyerTotal);
  });
  it.each([
    [9999, 30000, 500],
    [1000001, 30000, 500],
    [10000, -1, 500],
    [10000, 30000, 10001],
    [10000.5, 30000, 500],
  ])('rejects invalid money inputs', (p, s, c) => {
    expect(() => quoteAmounts(p, s, c)).toThrow();
  });
});
