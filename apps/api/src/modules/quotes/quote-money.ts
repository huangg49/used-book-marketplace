// VND half-up rounding, using integer arithmetic only (BR-20).
export function quoteAmounts(
  bookPrice: number,
  shippingFee: number,
  commissionBps: number,
) {
  if (
    !Number.isInteger(bookPrice) ||
    bookPrice < 10000 ||
    bookPrice > 1000000 ||
    !Number.isInteger(shippingFee) ||
    shippingFee < 0 ||
    shippingFee > 1000000 ||
    !Number.isInteger(commissionBps) ||
    commissionBps < 0 ||
    commissionBps > 10000
  )
    throw new Error('Invalid quote amounts');
  const commission = Number(
    (BigInt(bookPrice) * BigInt(commissionBps) + 5000n) / 10000n,
  );
  const buyerTotal = bookPrice + shippingFee;
  return {
    bookPrice,
    shippingFee,
    commissionBps,
    commission,
    buyerTotal,
    sellerProceeds: buyerTotal - commission,
  };
}
