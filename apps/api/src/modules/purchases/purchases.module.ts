import { ConversationAgreementsService } from './conversation-agreements.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchaseExpiryWorker } from './purchase-expiry.service.js';
import { PurchaseGateway } from './purchase.gateway.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, CommandsModule, ListingsModule],
  controllers: [PurchasesController],
  providers: [
    ConversationAgreementsService,
    PurchasesService,
    PurchaseExpiryWorker,
    PurchaseGateway,
  ],
  exports: [PurchaseExpiryWorker, ConversationAgreementsService],
})
export class PurchasesModule {}
