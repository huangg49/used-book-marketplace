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
import { AutofillAssistModule } from '../autofill-assist/autofill-assist.module.js';
import { ListingAutoReviewService } from './listing-auto-review.service.js';
import { ListingAutoReviewAdminService } from './listing-auto-review-admin.service.js';
import { ListingAutoReviewAdminController } from './listing-auto-review-admin.controller.js';
@Module({
  imports: [
    AutofillAssistModule,
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
    ListingAutoReviewService,
    ListingAutoReviewAdminService,
    PublicListingService,
    ListingLifecycleService,
  ],
  exports: [
    ListingCommitmentPolicy,
    PublicListingService,
    ListingAutoReviewService,
  ],
  controllers: [
    ListingDraftsController,
    ListingReviewController,
    ListingAutoReviewAdminController,
    PublicListingController,
    ListingLifecycleController,
  ],
})
export class ListingsModule {}
