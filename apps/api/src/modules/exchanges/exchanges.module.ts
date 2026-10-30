import { PurchasesModule } from '../purchases/purchases.module.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { ExchangesController } from './exchanges.controller.js';
import { ExchangeOperationsController } from './exchange-operations.controller.js';
import { ExchangesService } from './exchanges.service.js';
import { ExchangeExpiryWorker } from './exchange-expiry.service.js';

@Module({
  imports: [PurchasesModule, DatabaseModule, AuthModule, CommandsModule, ListingsModule, WalletModule],
  controllers: [ExchangesController, ExchangeOperationsController],
  providers: [ExchangesService, ExchangeExpiryWorker],
  exports: [ExchangesService, ExchangeExpiryWorker],
})
export class ExchangesModule {}
