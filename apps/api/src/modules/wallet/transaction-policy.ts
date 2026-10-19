import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Listing submission is free, including on hosts with the old fee env value.
// Checkout configuration remains separate from the listing publication policy.
@Injectable()
export class TransactionPolicy {
  readonly listingFee = 0;
  readonly atomicCheckout: boolean;
  constructor(config: ConfigService) {
    const checkout = config.get<string>('ORDER_CHECKOUT_MODE', 'Wallet');
    if (!['Wallet', 'Unpaid'].includes(checkout))
      throw new Error('ORDER_CHECKOUT_MODE must be Wallet or Unpaid');
    this.atomicCheckout = checkout === 'Wallet';
  }
}
