import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Public } from '../auth/public.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import { PointOrdersService } from './point-orders.service.js';
import { PointCollectionService } from './point-collection.service.js';

@Controller()
export class AuctionsController {
  constructor(
    private readonly intakes: AuctionIntakesService,
    private readonly bidding: AuctionBiddingService,
    private readonly points: HandoverPointsService,
    private readonly orders: PointOrdersService,
    private readonly collection: PointCollectionService,
    private readonly input: ContractInput,
  ) {}

  @Post('point-orders/:orderId/accept-report')
  @Roles('MEMBER')
  @HttpCode(200)
  acceptReport(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.collection.accept(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('AcceptPointOrderReport', body),
      ),
      res,
    );
  }
  @Post('point-orders/:orderId/reject-report')
  @Roles('MEMBER')
  @HttpCode(200)
  rejectReport(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.collection.reject(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('RejectPointOrderReport', body),
      ),
      res,
    );
  }
  @Post('point-orders/:orderId/collection-code')
  @Roles('MEMBER')
  @HttpCode(200)
  collectionCode(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.collection.requestCode(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('RequestCollectionCode', body),
      ),
      res,
    );
  }

  @Get('me/point-orders/:orderId')
  @Roles('MEMBER')
  readOrder(@Param('orderId') id: string, @Req() req: AuthenticatedRequest) {
    return this.orders.read(req.auth, this.input.uuid(id));
  }
  @Post('point-orders/:orderId/pay')
  @Roles('MEMBER')
  @HttpCode(200)
  pay(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.orders.pay(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('PayPointOrder', body),
      ),
      res,
    );
  }

  @Get('handover-points')
  @Roles('MEMBER', 'STAFF', 'ADMIN')
  listPoints(@Req() req: AuthenticatedRequest) {
    return this.points.list(req.auth);
  }

  @Post('auction-intakes')
  @Roles('MEMBER')
  @HttpCode(200)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.create(
        commandContext(this.input, req, res),
        this.input.body('CreateAuctionIntake', body),
      ),
      res,
    );
  }
  @Get('me/auction-intakes')
  @Roles('MEMBER')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.intakes.listMine(req.auth);
  }
  @Get('me/auction-intakes/:intakeId')
  @Roles('MEMBER')
  readMine(@Param('intakeId') id: string, @Req() req: AuthenticatedRequest) {
    return this.intakes.readMine(req.auth, this.input.uuid(id));
  }
  @Post('auction-intakes/:intakeId/cancel')
  @Roles('MEMBER')
  @HttpCode(200)
  cancelIntake(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.cancel(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('AuctionVersionCommand', body),
      ),
      res,
    );
  }

  @Get('auctions')
  @Public()
  list() {
    return this.bidding.listPublic();
  }
  @Get('auctions/:auctionId')
  @Public()
  read(@Param('auctionId') id: string) {
    return this.bidding.readPublic(this.input.uuid(id));
  }
  @Get('me/auctions/:auctionId/participation')
  @Roles('MEMBER')
  participation(
    @Param('auctionId') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.bidding.participation(req.auth, this.input.uuid(id));
  }
  @Post('auctions/:auctionId/bids')
  @Roles('MEMBER')
  @HttpCode(200)
  bid(
    @Param('auctionId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.bidding.bid(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('PlaceAuctionBid', body),
      ),
      res,
    );
  }
  @Put('auctions/:auctionId/auto-bid')
  @Roles('MEMBER')
  @HttpCode(200)
  setAuto(
    @Param('auctionId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.bidding.setAuto(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SetAuctionAutoBid', body),
      ),
      res,
    );
  }
  @Post('auctions/:auctionId/auto-bid/disable')
  @Roles('MEMBER')
  @HttpCode(200)
  disableAuto(
    @Param('auctionId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.bidding.disableAuto(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('DisableAuctionAutoBid', body),
      ),
      res,
    );
  }
  @Post('auctions/:auctionId/buy-now')
  @Roles('MEMBER')
  @HttpCode(200)
  buyNow(
    @Param('auctionId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.bidding.buyNow(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('BuyAuctionNow', body),
      ),
      res,
    );
  }
}
