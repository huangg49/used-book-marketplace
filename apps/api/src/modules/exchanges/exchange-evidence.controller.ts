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
import { Roles } from '../auth/roles.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext } from '../commands/command-http.js';
import { ExchangeEvidenceService } from './exchange-evidence.service.js';
@Controller()
export class ExchangeEvidenceController {
  constructor(
    private readonly evidence: ExchangeEvidenceService,
    private readonly input: ContractInput,
  ) {}
  @Post('exchanges/:exchangeId/evidence')
  @Roles('MEMBER')
  @ExistingObligation()
  @HttpCode(200)
  async create(
    @Param('exchangeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.evidence.create(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('CreateExchangeEvidence', body),
    );
    res.setHeader('Idempotency-Replayed', String(r.replayed));
    return r.receipt;
  }
  @Get('exchanges/:exchangeId/evidence')
  @Roles('MEMBER')
  @ExistingObligation()
  list(@Param('exchangeId') id: string, @Req() req: AuthenticatedRequest) {
    return this.evidence.list(req.auth, this.input.uuid(id));
  }
  @Put('exchanges/:exchangeId/evidence/:evidenceId/content')
  @Roles('MEMBER')
  @ExistingObligation()
  @HttpCode(200)
  async upload(
    @Param('exchangeId') id: string,
    @Param('evidenceId') eid: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.evidence.upload(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.uuid(eid),
      req,
    );
    res.setHeader('Idempotency-Replayed', String(r.replayed));
    return r.receipt;
  }
  @Post('exchanges/:exchangeId/evidence/:evidenceId/read')
  @Roles('MEMBER')
  @ExistingObligation()
  @HttpCode(200)
  read(
    @Param('exchangeId') id: string,
    @Param('evidenceId') eid: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.evidence.read(
      req.auth,
      this.input.uuid(id),
      this.input.uuid(eid),
      res.locals.requestId as string,
    );
  }
  @Get('operations/exchanges/:exchangeId/evidence-access')
  @Roles('STAFF', 'ADMIN')
  access(@Param('exchangeId') id: string, @Req() req: AuthenticatedRequest) {
    return this.evidence.access(req.auth, this.input.uuid(id));
  }
  @Post('operations/exchanges/:exchangeId/evidence-access')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  async assign(
    @Param('exchangeId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.evidence.assign(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('AssignExchangeEvidence', body),
    );
    res.setHeader('Idempotency-Replayed', String(r.replayed));
    return r.receipt;
  }
  @Get('operations/exchanges/:exchangeId/evidence')
  @Roles('STAFF', 'ADMIN')
  operationsList(
    @Param('exchangeId') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.evidence.list(req.auth, this.input.uuid(id), true);
  }
  @Post('operations/exchanges/:exchangeId/evidence/:evidenceId/read')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  operationsRead(
    @Param('exchangeId') id: string,
    @Param('evidenceId') eid: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.evidence.read(
      req.auth,
      this.input.uuid(id),
      this.input.uuid(eid),
      res.locals.requestId as string,
      true,
      this.input.body('ReadExchangeEvidence', body).reason,
    );
  }
}
