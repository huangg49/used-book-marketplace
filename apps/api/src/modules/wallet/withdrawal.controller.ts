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
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { WithdrawalService } from './withdrawal.service.js';

@Controller()
export class WithdrawalController {
  constructor(
    private readonly service: WithdrawalService,
    private readonly input: ContractInput,
  ) {}
  @Post('me/withdrawals')
  @HttpCode(200)
  @Roles('MEMBER')
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.create(
      commandContext(this.input, req, res),
      this.input.body('CreateWithdrawal', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/withdrawals')
  @ExistingObligation()
  @Roles('MEMBER')
  list(@Query() q: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.list(
      req.auth,
      this.input.query('listMyWithdrawals', q),
      'member',
    );
  }
  @Get('me/withdrawals/:withdrawalId')
  @ExistingObligation()
  @Roles('MEMBER')
  read(@Param('withdrawalId') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.read(req.auth, this.input.uuid(id));
  }
  @Get('admin/withdrawals')
  @Roles('ADMIN')
  adminList(@Query() q: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.list(
      req.auth,
      this.input.query('listAdminWithdrawals', q),
      'admin',
    );
  }
  @Get('admin/withdrawals/:withdrawalId')
  @Roles('ADMIN')
  adminRead(
    @Param('withdrawalId') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.read(req.auth, this.input.uuid(id), true);
  }
  @Post('admin/withdrawals/:withdrawalId/decision')
  @HttpCode(200)
  @Roles('ADMIN')
  async decision(
    @Param('withdrawalId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.action(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('DecideWithdrawal', body),
      'decision',
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('admin/withdrawals/:withdrawalId/process')
  @HttpCode(200)
  @Roles('ADMIN')
  async process(
    @Param('withdrawalId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.action(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('WithdrawalVersion', body),
      'process',
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('admin/withdrawals/:withdrawalId/refund')
  @HttpCode(200)
  @Roles('ADMIN')
  async refund(
    @Param('withdrawalId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.action(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('WithdrawalVersion', body),
      'refund',
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('operations/simulator/withdrawals')
  @Roles('TEST_OPERATOR')
  operatorList(@Query() q: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.list(
      req.auth,
      this.input.query('listSimulatedWithdrawals', q),
      'operator',
    );
  }
  @Post('operations/simulator/withdrawal-events')
  @HttpCode(200)
  @Roles('TEST_OPERATOR')
  async emit(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.emit(
      commandContext(this.input, req, res),
      this.input.body('SimulatedWithdrawalEvent', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
}
