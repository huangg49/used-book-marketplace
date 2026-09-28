import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { QuotesModule } from '../quotes/quotes.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { MediaModule } from '../media/media.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { OrderClock } from './order-clock.js';
import { OrderExpiryWorker } from './order-expiry.service.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { PackagingEvidenceService } from './packaging-evidence.service.js';
import { PackagingEvidenceController } from './packaging-evidence.controller.js';
@Module({
  imports: [
    DatabaseModule,
    CommandsModule,
    QuotesModule,
    ListingsModule,
    ReservationsModule,
    MediaModule,
    WalletModule,
  ],
  providers: [
    OrdersService,
    OrderClock,
    OrderExpiryWorker,
    PackagingEvidenceService,
  ],
  controllers: [OrdersController, PackagingEvidenceController],
  exports: [OrderExpiryWorker, OrdersService, OrderClock],
})
export class OrdersModule {}
