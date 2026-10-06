import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionClock } from './auction-clock.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { AuctionOperationsController } from './auction-operations.controller.js';
import { AuctionWorker } from './auction-worker.service.js';
import { AuctionsController } from './auctions.controller.js';
import { HandoverPointsService } from './handover-points.service.js';

@Module({
  imports: [DatabaseModule, CommandsModule, ListingsModule, ReservationsModule],
  providers: [
    AuctionIntakesService,
    AuctionBiddingService,
    HandoverPointsService,
    AuctionClock,
    AuctionWorker,
  ],
  controllers: [AuctionsController, AuctionOperationsController],
  exports: [AuctionWorker, AuctionClock],
})
export class AuctionsModule {}
