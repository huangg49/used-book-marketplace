import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ListingLifecycleService } from './listing-lifecycle.service.js';

@Controller()
export class ListingLifecycleController {
  constructor(
    private readonly lifecycle: ListingLifecycleService,
    private readonly input: ContractInput,
  ) {}
  @Post('listings/:listingId/revision')
  @Roles('MEMBER')
  @HttpCode(200)
  revise(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.lifecycle.revise(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('EditApproved', body),
      ),
      res,
    );
  }
  @Put('listings/:listingId/visibility')
  @Roles('MEMBER')
  @HttpCode(200)
  visibility(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.lifecycle.visibility(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SetVisibility', body),
      ),
      res,
    );
  }
  @Post('listings/:listingId/archive')
  @Roles('MEMBER')
  @HttpCode(200)
  archive(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.lifecycle.archive(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('VersionCommand', body),
      ),
      res,
    );
  }
  @Post('operations/listings/:listingId/remove')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  remove(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.lifecycle.remove(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('RemoveListing', body),
      ),
      res,
    );
  }
}
