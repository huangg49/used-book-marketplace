import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';
import { LedgerService } from './ledger.service.js';
import { PaymentSimulator } from './payment-simulator.js';
@Module({
  imports: [CommandsModule],
  controllers: [WalletController],
  providers: [WalletService, LedgerService, PaymentSimulator],
  exports: [LedgerService],
})
export class WalletModule {}
