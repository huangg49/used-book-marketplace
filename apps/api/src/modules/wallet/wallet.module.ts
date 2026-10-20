import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';
import { LedgerService } from './ledger.service.js';
import { PaymentSimulator } from './payment-simulator.js';
import { VNPaySandbox } from './vnpay-sandbox.js';
import { ListingFeeService } from './listing-fee.service.js';
import { TransactionPolicy } from './transaction-policy.js';
import { WalletClock } from './wallet-clock.js';
import { WalletExpiryWorker } from './wallet-expiry.service.js';
@Module({
  imports: [CommandsModule, DatabaseModule],
  controllers: [WalletController],
  providers: [
    WalletService,
    LedgerService,
    PaymentSimulator,
    VNPaySandbox,
    ListingFeeService,
    TransactionPolicy,
    WalletClock,
    WalletExpiryWorker,
  ],
  exports: [
    LedgerService,
    ListingFeeService,
    TransactionPolicy,
    WalletExpiryWorker,
  ],
})
export class WalletModule {}
