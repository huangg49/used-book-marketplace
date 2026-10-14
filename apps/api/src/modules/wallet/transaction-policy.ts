import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Explicit legacy configuration supports staged rollout and historical fixtures.
// Member HTTP requests cannot choose a cheaper policy or bypass wallet funding.
@Injectable()
export class TransactionPolicy {
  readonly listingFee: number;
  readonly atomicCheckout: boolean;
  constructor(config: ConfigService) {
    const fee = String(config.get('LISTING_SUBMISSION_FEE_VND', '20000'));
    if (!/^\d+$/.test(fee) || Number(fee) > 1_000_000)
      throw new Error(
        'LISTING_SUBMISSION_FEE_VND must be an integer from 0 to 1000000',
      );
    this.listingFee = Number(fee);
    const checkout = config.get<string>('ORDER_CHECKOUT_MODE', 'Wallet');
    if (!['Wallet', 'Unpaid'].includes(checkout))
      throw new Error('ORDER_CHECKOUT_MODE must be Wallet or Unpaid');
    this.atomicCheckout = checkout === 'Wallet';
  }
}
