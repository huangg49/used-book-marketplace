import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { PublicListingService } from './public-listing.service.js';

@Controller('listings')
export class PublicListingController {
  constructor(
    private readonly listings: PublicListingService,
    private readonly input: ContractInput,
  ) {}
  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) {
    return this.listings.list(this.input.query('listPublicListings', query));
  }
  @Get(':listingId')
  @Public()
  @Header('Cache-Control', 'no-store')
  detail(@Param('listingId') id: string, @Query() query: unknown) {
    const options = this.input.query('getPublicListing', query);
    return this.listings.detail(this.input.uuid(id), options.bundleSupport === 'whole-v1');
  }
  @Get(':listingId/media/:mediaId/read')
  @Public()
  @Header('Cache-Control', 'no-store')
  media(@Param('listingId') id: string, @Param('mediaId') mediaId: string) {
    return this.listings.media(this.input.uuid(id), this.input.uuid(mediaId));
  }
}
