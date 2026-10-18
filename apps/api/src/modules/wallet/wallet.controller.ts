import {
  Body,
  BadRequestException,
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
import { WalletService } from './wallet.service.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { Public } from '../auth/public.decorator.js';

@Controller()
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly input: ContractInput,
  ) {}
  @Get('me/wallet')
  @ExistingObligation()
  @Roles('MEMBER')
  summary(@Req() req: AuthenticatedRequest) {
    return this.wallet.summary(req.auth);
  }
  @Post('me/topups')
  @HttpCode(200)
  @Roles('MEMBER')
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.wallet.create(
      commandContext(this.input, req, res),
      this.input.body('CreateTopupIntent', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/topups')
  // Existing topup history follows the provider-specific creation endpoint.
  @ExistingObligation()
  @Roles('MEMBER')
  list(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    return this.wallet.list(req.auth, this.input.query('listMyTopups', query));
  }
  @Post('me/topups/vnpay')
  @HttpCode(200)
  @Roles('MEMBER')
  async createVNPay(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.wallet.create(
      commandContext(this.input, req, res),
      this.input.body('CreateVNPayTopup', body),
      'VNPay',
      req.ip ?? '127.0.0.1',
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('payments/vnpay/ipn')
  @Public()
  ipn(@Query() query: unknown) {
    return this.wallet.receiveVNPay(query);
  }
  @Post('me/topups/:topupId/vnpay-query')
  @HttpCode(200)
  @ExistingObligation()
  @Roles('MEMBER')
  queryVNPay(@Param('topupId') id: string, @Req() req: AuthenticatedRequest) {
    const target = this.input.uuid(id);
    const key = this.input.uuid(req.headers['idempotency-key']);
    if (key !== target)
      throw new BadRequestException('Idempotency-Key phải là mã yêu cầu nạp.');
    return this.wallet.queryVNPay(req.auth, target);
  }
  @Get('me/topups/:topupId')
  @ExistingObligation()
  @Roles('MEMBER')
  read(@Param('topupId') id: string, @Req() req: AuthenticatedRequest) {
    return this.wallet.read(req.auth, this.input.uuid(id));
  }
  @Get('me/wallet/history')
  @ExistingObligation()
  @Roles('MEMBER')
  history(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    return this.wallet.history(
      req.auth,
      this.input.query('listMyWalletHistory', query),
    );
  }
  @Post('operations/simulator/topup-events')
  @HttpCode(200)
  @Roles('TEST_OPERATOR')
  async emit(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.wallet.emit(
      commandContext(this.input, req, res),
      this.input.body('SimulatedTopupEvent', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
}
