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
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { ListingAutoReviewAdminService } from './listing-auto-review-admin.service.js';

@Controller()
export class ListingAutoReviewAdminController {
  constructor(
    private readonly admin: ListingAutoReviewAdminService,
    private readonly input: ContractInput,
  ) {}
  @Get('operations/auto-review/report')
  @Roles('STAFF', 'ADMIN')
  report(@Req() req: AuthenticatedRequest) {
    return this.admin.report(req.auth);
  }
  @Get('operations/auto-review/checks')
  @Roles('STAFF', 'ADMIN')
  checks(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.admin.listChecks(
      req.auth,
      this.input.query('listAutoReviewChecks', query),
    );
  }
  @Get('operations/listings/:listingId/auto-review/history')
  @Roles('STAFF', 'ADMIN')
  history(@Req() req: AuthenticatedRequest, @Param('listingId') id: string) {
    return this.admin.history(req.auth, this.input.uuid(id));
  }
  @Post('operations/listings/:listingId/auto-review/revoke')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  revoke(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.admin.revoke(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('RevokeAutoApproval', body),
      ),
      res,
    );
  }
  @Post('operations/listings/:listingId/auto-review/checks/:checkId/clear')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  clear(
    @Param('listingId') id: string,
    @Param('checkId') checkId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.admin.clearCheck(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.uuid(checkId),
        this.input.body('ClearAutoReviewCheck', body),
      ),
      res,
    );
  }
}
