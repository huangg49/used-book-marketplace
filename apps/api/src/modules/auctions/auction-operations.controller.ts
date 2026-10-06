import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionIntakesService } from './auction-intakes.service.js';

// Point Staff steps need STAFF plus a current point assignment, checked in the
// service; auction cancellation is ADMIN only.
@Controller('operations')
export class AuctionOperationsController {
  constructor(
    private readonly intakes: AuctionIntakesService,
    private readonly bidding: AuctionBiddingService,
    private readonly input: ContractInput,
  ) {}

  @Get('auction-intakes')
  @Roles('STAFF')
  list(@Req() req: AuthenticatedRequest) {
    return this.intakes.listForStaff(req.auth);
  }
  @Post('auction-intakes/:intakeId/receive')
  @Roles('STAFF')
  @HttpCode(200)
  receive(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.receive(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('ReceiveAuctionIntake', body),
      ),
      res,
    );
  }
  @Post('auction-intakes/:intakeId/inspect')
  @Roles('STAFF')
  @HttpCode(200)
  inspect(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.inspect(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('InspectAuctionIntake', body),
      ),
      res,
    );
  }
  @Post('auction-intakes/:intakeId/open')
  @Roles('STAFF')
  @HttpCode(200)
  open(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.open(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('AuctionVersionCommand', body),
      ),
      res,
    );
  }
  @Post('auction-intakes/:intakeId/reclaim')
  @Roles('STAFF')
  @HttpCode(200)
  reclaim(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.reclaim(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('AuctionVersionCommand', body),
      ),
      res,
    );
  }
  @Post('auctions/:auctionId/cancel')
  @Roles('ADMIN')
  @HttpCode(200)
  cancel(
    @Param('auctionId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.bidding.cancel(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('CancelAuction', body),
      ),
      res,
    );
  }
}
