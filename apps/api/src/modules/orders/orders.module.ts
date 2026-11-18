import { LocalDemoCompletionWorker } from './local-demo-completion.worker.js';
import { PurchasesModule } from '../purchases/purchases.module.js';
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
import { CarrierSimulator } from '../shipments/carrier-simulator.js';
import { EvidenceStorage } from '../media/media-storage.js';
import { DirectOrderIssueEvidenceController } from './direct-order-issue-evidence.controller.js';
import { DirectOrderIssueEvidenceService } from './direct-order-issue-evidence.service.js';
@Module({
  imports: [PurchasesModule,
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
    LocalDemoCompletionWorker,
    PackagingEvidenceService,
    CarrierSimulator,
    EvidenceStorage,
    DirectOrderIssueEvidenceService,
  ],
  controllers: [OrdersController, PackagingEvidenceController, DirectOrderIssueEvidenceController],
  exports: [OrderExpiryWorker, OrdersService, OrderClock],
})
export class OrdersModule {}
