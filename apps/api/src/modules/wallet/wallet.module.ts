import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';
import { LedgerService } from './ledger.service.js';
import { PaymentSimulator } from './payment-simulator.js';
import { VNPaySandbox } from './vnpay-sandbox.js';
import { ListingFeeService } from './listing-fee.service.js';
import { TransactionPolicy } from './transaction-policy.js';
@Module({
  imports: [CommandsModule],
  controllers: [WalletController],
  providers: [
    WalletService,
    LedgerService,
    PaymentSimulator,
    VNPaySandbox,
    ListingFeeService,
    TransactionPolicy,
  ],
  exports: [LedgerService, ListingFeeService, TransactionPolicy],
})
export class WalletModule {}
