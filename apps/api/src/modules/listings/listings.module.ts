import { Module } from '@nestjs/common';
import { ListingCommitmentPolicy } from './listing-commitment-policy.service.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { ListingDraftsService } from './listing-drafts.service.js';
import { ListingDraftsController } from './listing-drafts.controller.js';
import { ListingReviewController } from './listing-review.controller.js';
import { ListingReviewService } from './listing-review.service.js';
import { MediaModule } from '../media/media.module.js';
import { PublicListingService } from './public-listing.service.js';
import { PublicListingController } from './public-listing.controller.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ListingLifecycleService } from './listing-lifecycle.service.js';
import { ListingLifecycleController } from './listing-lifecycle.controller.js';
import { ListingFulfillmentService } from './listing-fulfillment.service.js';
import { PriceAssistModule } from '../price-assist/price-assist.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
@Module({
  imports: [
    CommandsModule,
    CatalogModule,
    MediaModule,
    DatabaseModule,
    PriceAssistModule,
    WalletModule,
  ],
  providers: [
    ListingCommitmentPolicy,
    ListingFulfillmentService,
    ListingDraftsService,
    ListingReviewService,
    PublicListingService,
    ListingLifecycleService,
  ],
  exports: [ListingCommitmentPolicy],
  controllers: [
    ListingDraftsController,
    ListingReviewController,
    PublicListingController,
    ListingLifecycleController,
  ],
})
export class ListingsModule {}
