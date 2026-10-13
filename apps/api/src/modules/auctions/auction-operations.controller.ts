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
import { PointCollectionService } from './point-collection.service.js';
import { PointOrderCompletionService } from './point-order-completion.service.js';
import { PointOrderResolutionService } from './point-order-resolution.service.js';

// Point Staff steps need STAFF plus a current point assignment, checked in the
// service; auction cancellation is ADMIN only.
@Controller('operations')
export class AuctionOperationsController {
  constructor(
    private readonly intakes: AuctionIntakesService,
    private readonly bidding: AuctionBiddingService,
    private readonly collection: PointCollectionService,
    private readonly resolutions: PointOrderResolutionService,
    private readonly completion: PointOrderCompletionService,
    private readonly input: ContractInput,
  ) {}

  @Get('point-order-resolutions')
  @Roles('ADMIN')
  resolutionQueue(@Req() req: AuthenticatedRequest) {
    return this.resolutions.queue(req.auth);
  }
  @Post('point-orders/:orderId/resolve')
  @Roles('ADMIN')
  @HttpCode(200)
  resolve(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.resolutions.resolve(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('ResolvePointOrder', body),
      ),
      res,
    );
  }

  @Get('point-orders')
  @Roles('STAFF')
  collectionQueue(@Req() req: AuthenticatedRequest) {
    return this.collection.queue(req.auth);
  }
  @Post('point-orders/:orderId/handover')
  @Roles('STAFF')
  @HttpCode(200)
  handover(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.collection.handover(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('HandOverPointOrder', body),
      ),
      res,
    );
  }

  @Post('point-orders/:orderId/receive-return')
  @Roles('STAFF')
  @HttpCode(200)
  receiveReturn(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.completion.receiveReturn(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('ReceivePointOrderReturn', body),
      ),
      res,
    );
  }

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
  @Post('auction-intakes/:intakeId/evidence-decision')
  @Roles('STAFF')
  @HttpCode(200)
  decideEvidence(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.decideEvidence(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('DecideAuctionIntakeEvidence', body),
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
  @Get('auctions')
  @Roles('ADMIN')
  auctionQueue(@Req() req: AuthenticatedRequest) {
    return this.bidding.listForAdmin(req.auth);
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
