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
import { commandContext } from '../commands/command-http.js';
import { OrdersService } from './orders.service.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
@Controller()
@Roles('MEMBER')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly input: ContractInput,
  ) {}
  @Post('orders')
  @HttpCode(200)
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.create(
      commandContext(this.input, req, res),
      this.input.body('CreateDirectOrder', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/orders/:orderId')
  @ExistingObligation()
  read(@Param('orderId') id: string, @Req() req: AuthenticatedRequest) {
    return this.orders.read(req.auth, this.input.uuid(id));
  }
  @Post('orders/:orderId/pay')
  @HttpCode(200)
  async pay(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.pay(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('PayOrder', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('orders/:orderId/accept')
  @ExistingObligation()
  @HttpCode(200)
  async accept(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.accept(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('AcceptOrder', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('orders/:orderId/confirm-receipt')
  @ExistingObligation()
  @HttpCode(200)
  async confirmReceipt(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.confirmReceipt(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('ConfirmOrderReceipt', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('orders/:orderId/non-receipt')
  @ExistingObligation()
  @HttpCode(200)
  async nonReceipt(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.reportNonReceipt(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('ReportOrderNonReceipt', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('orders/:orderId/cancel-paid')
  @ExistingObligation()
  @HttpCode(200)
  async cancelPaid(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.cancelPaid(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('CancelPaidOrder', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('orders/:orderId/reject')
  @ExistingObligation()
  @HttpCode(200)
  async reject(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.cancelPaid(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('RejectPaidOrder', body),
      true,
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('orders/:orderId/cancel')
  @ExistingObligation()
  @HttpCode(200)
  async cancel(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.cancel(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('CancelUnpaidOrder', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/orders/:orderId/media/:mediaId/read')
  @ExistingObligation()
  media(
    @Param('orderId') id: string,
    @Param('mediaId') mediaId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.orders.mediaRead(
      req.auth,
      this.input.uuid(id),
      this.input.uuid(mediaId),
    );
  }
  @Get('me/orders')
  @ExistingObligation()
  list(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    return this.orders.list(req.auth, this.input.query('listMyOrders', query));
  }
}
