import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ListingReviewService } from './listing-review.service.js';

@Controller()
export class ListingReviewController {
  constructor(
    private readonly review: ListingReviewService,
    private readonly input: ContractInput,
  ) {}
  @Post('listings/:listingId/submit')
  @Roles('MEMBER')
  @HttpCode(200)
  submit(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.review.submit(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SubmitListing', body),
      ),
      res,
    );
  }
  @Get('operations/listings')
  @Roles('STAFF', 'ADMIN')
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.review.list(
      req.auth,
      this.input.query('listListingReviewQueue', query),
    );
  }
  @Get('operations/listings/:listingId')
  @Roles('STAFF', 'ADMIN')
  detail(@Req() req: AuthenticatedRequest, @Param('listingId') id: string) {
    return this.review.detail(req.auth, this.input.uuid(id));
  }
  @Get('operations/listings/:listingId/revisions')
  @Roles('STAFF', 'ADMIN')
  history(
    @Req() req: AuthenticatedRequest,
    @Param('listingId') id: string,
    @Query() query: unknown,
  ) {
    return this.review.history(
      req.auth,
      this.input.uuid(id),
      this.input.query('listReviewRevisions', query),
    );
  }
  @Post('operations/listings/:listingId/decision')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  decide(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.review.decide(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('DecideListing', body),
      ),
      res,
    );
  }
}
