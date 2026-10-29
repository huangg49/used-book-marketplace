import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { ReviewQueries } from './review-queries.service.js';
import { TransactionReviewsController } from './transaction-reviews.controller.js';

@Module({
  imports: [DatabaseModule, CommandsModule],
  controllers: [ReviewsController, TransactionReviewsController],
  providers: [ReviewsService, ReviewQueries],
  exports: [ReviewsService, ReviewQueries],
})
export class ReviewsModule {}
