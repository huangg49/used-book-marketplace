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
import { Public } from '../auth/public.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { AuctionBiddingService } from './auction-bidding.service.js';
import { AuctionBookService } from './auction-book.service.js';
import { AuctionIntakesService } from './auction-intakes.service.js';
import { AuctionLiveService } from './auction-live.service.js';
import { HandoverPointsService } from './handover-points.service.js';
import { PointOrdersService } from './point-orders.service.js';
import { PointCollectionService } from './point-collection.service.js';
import { PointOrderCompletionService } from './point-order-completion.service.js';

@Controller()
export class AuctionsController {
  constructor(
    private readonly intakes: AuctionIntakesService,
    private readonly bidding: AuctionBiddingService,
    private readonly points: HandoverPointsService,
    private readonly orders: PointOrdersService,
    private readonly collection: PointCollectionService,
    private readonly completion: PointOrderCompletionService,
    private readonly input: ContractInput,
    private readonly live: AuctionLiveService,
    private readonly books: AuctionBookService,
  ) {}

  // Push committed auction changes to live watchers without waiting for the poll.
  private async notify<T>(result: Promise<T>) {
    const receipt = await result;
    this.live.nudge();
    return receipt;
  }

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
  @Get('me/point-orders/:orderId/delivery-quote')
  @Roles('MEMBER')
  deliveryQuote(
    @Param('orderId') id: string,
    @Query('addressId') addressId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orders.deliveryQuote(
      req.auth,
      this.input.uuid(id),
      this.input.uuid(addressId),
    );
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
    return this.notify(
      commandResponse(
        this.orders.pay(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('PayPointOrder', body),
        ),
        res,
      ),
    );
  }

  @Post('point-orders/:orderId/claim')
  @Roles('MEMBER')
  @HttpCode(200)
  claim(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.completion.claim(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('ClaimPointOrder', body),
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
  @Post('me/auction-intakes/:intakeId/evidence')
  @Roles('MEMBER')
  @HttpCode(200)
  submitEvidence(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.intakes.submitEvidence(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SubmitAuctionIntakeEvidence', body),
      ),
      res,
    );
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

  @Post('auction-intakes/:intakeId/publish')
  @Roles('MEMBER')
  @HttpCode(200)
  publish(
    @Param('intakeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.notify(
      commandResponse(
        this.intakes.publish(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('PublishAuction', body),
        ),
        res,
      ),
    );
  }
  @Post('auctions/:auctionId/schedule')
  @Roles('MEMBER')
  @HttpCode(200)
  reschedule(
    @Param('auctionId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.notify(
      commandResponse(
        this.bidding.reschedule(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('RescheduleAuction', body),
        ),
        res,
      ),
    );
  }

  @Get('auctions')
  @Public()
  list(@Query() query: unknown) {
    return this.bidding.listPublic(this.input.query('listAuctions', query));
  }
  @Get('auctions/:auctionId')
  @Public()
  read(@Param('auctionId') id: string) {
    return this.bidding.readPublic(this.input.uuid(id));
  }
  @Get('auctions/:auctionId/photos/:mediaId')
  @Public()
  photo(@Param('auctionId') id: string, @Param('mediaId') mediaId: string) {
    return this.books.photo(this.input.uuid(id), this.input.uuid(mediaId));
  }
  @Get('me/auctions/:auctionId/participation')
  @Roles('MEMBER')
  participation(
    @Param('auctionId') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.bidding.participation(req.auth, this.input.uuid(id));
  }
  @Get('me/auctions')
  @Roles('MEMBER')
  mine(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.bidding.listMine(req.auth, this.input.query('listMyAuctions', query));
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
    return this.notify(
      commandResponse(
        this.bidding.bid(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('PlaceAuctionBid', body),
        ),
        res,
      ),
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
    return this.notify(
      commandResponse(
        this.bidding.setAuto(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('SetAuctionAutoBid', body),
        ),
        res,
      ),
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
    return this.notify(
      commandResponse(
        this.bidding.disableAuto(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('DisableAuctionAutoBid', body),
        ),
        res,
      ),
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
    return this.notify(
      commandResponse(
        this.bidding.buyNow(
          commandContext(this.input, req, res),
          this.input.uuid(id),
          this.input.body('BuyAuctionNow', body),
        ),
        res,
      ),
    );
  }
}
