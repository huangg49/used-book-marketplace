import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ListingDraftsService } from './listing-drafts.service.js';
@Controller()
@Roles('MEMBER')
export class ListingDraftsController {
  constructor(
    private readonly drafts: ListingDraftsService,
    private readonly input: ContractInput,
  ) {}
  @Post('listings')
  @HttpCode(200)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.drafts.create(
        commandContext(this.input, req, res),
        this.input.body('CreateDraft', body),
      ),
      res,
    );
  }
  @Put('listings/:listingId/draft')
  @HttpCode(200)
  save(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.drafts.save(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SaveDraft', body),
      ),
      res,
    );
  }
  @Get('me/listings')
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.drafts.list(
      req.auth,
      this.input.query('listMyListings', query),
    );
  }
  @Get('me/listings/:listingId')
  detail(@Req() req: AuthenticatedRequest, @Param('listingId') id: string) {
    return this.drafts.detail(req.auth, this.input.uuid(id));
  }
  @Get('me/listings/:listingId/revisions')
  history(
    @Req() req: AuthenticatedRequest,
    @Param('listingId') id: string,
    @Query() query: unknown,
  ) {
    return this.drafts.history(
      req.auth,
      this.input.uuid(id),
      this.input.query('listMyListingRevisions', query),
    );
  }
}
