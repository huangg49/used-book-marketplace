import { Module } from '@nestjs/common';
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
import { HandoverPointsService } from './handover-points.service.js';
import { PointOrdersService } from './point-orders.service.js';
import { PointCollectionService } from './point-collection.service.js';
import { PointOrderResolutionService } from './point-order-resolution.service.js';
import { PointOrderCompletionService } from './point-order-completion.service.js';
import { PointAdministrationController } from './point-administration.controller.js';
import { PointAdministrationService } from './point-administration.service.js';

@Module({
  imports: [
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
    PointOrdersService,
    PointCollectionService,
    PointOrderResolutionService,
    PointOrderCompletionService,
    PointAdministrationService,
    AuctionClock,
    AuctionWorker,
    AuctionLiveService,
    AuctionGateway,
  ],
  controllers: [
    AuctionsController,
    AuctionOperationsController,
    PointAdministrationController,
  ],
  exports: [AuctionWorker, AuctionClock],
})
export class AuctionsModule {}
