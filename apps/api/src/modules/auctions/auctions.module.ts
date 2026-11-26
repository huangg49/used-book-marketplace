import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AuctionBookService } from './auction-book.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionClock } from './auction-clock.js';
import { AuctionGateway } from './auction.gateway.js';
import { AuctionLiveService } from './auction-live.service.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { AuctionOperationsController } from './auction-operations.controller.js';
import { AuctionWorker } from './auction-worker.service.js';
import { AuctionsController } from './auctions.controller.js';
import { AuctionDemoController } from './auction-demo.controller.js';
import { DemoSkipPolicy } from './demo-skip.policy.js';
import { HandoverPointsService } from './handover-points.service.js';
import { PointDeliveryPricingService } from './point-delivery-pricing.service.js';
import { PointOrdersService } from './point-orders.service.js';
import { PointCollectionService } from './point-collection.service.js';
import { PointOrderResolutionService } from './point-order-resolution.service.js';
import { PointOrderCompletionService } from './point-order-completion.service.js';
import { PointAdministrationController } from './point-administration.controller.js';
import { PointAdministrationService } from './point-administration.service.js';
import { PointIncidentsService } from './point-incidents.service.js';
import { PointOrderLiveService } from './point-order-live.service.js';
import { PointOrderGateway } from './point-order.gateway.js';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    CommandsModule,
    ListingsModule,
    ReservationsModule,
    WalletModule,
    MediaModule,
  ],
  providers: [
    AuctionIntakesService,
    AuctionBookService,
    AuctionBiddingService,
    HandoverPointsService,
    PointDeliveryPricingService,
    PointOrdersService,
    PointCollectionService,
    PointOrderResolutionService,
    PointOrderCompletionService,
    PointAdministrationService,
    PointIncidentsService,
    AuctionClock,
    AuctionWorker,
    AuctionLiveService,
    AuctionGateway,
    PointOrderLiveService,
    PointOrderGateway,
    DemoSkipPolicy,
  ],
  controllers: [
    AuctionsController,
    AuctionDemoController,
    AuctionOperationsController,
    PointAdministrationController,
  ],
  exports: [
    AuctionWorker,
    AuctionClock,
    AuctionBiddingService,
    AuctionLiveService,
    PointOrderLiveService,
  ],
})
export class AuctionsModule {}
