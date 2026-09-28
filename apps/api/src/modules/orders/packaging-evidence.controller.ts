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
import { PackagingEvidenceService } from './packaging-evidence.service.js';

@Controller()
@Roles('MEMBER')
export class PackagingEvidenceController {
  constructor(
    private readonly evidence: PackagingEvidenceService,
    private readonly input: ContractInput,
  ) {}
  @Post('orders/:orderId/packaging-evidence')
  @ExistingObligation()
  @HttpCode(200)
  async create(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.evidence.create(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('CreatePackagingEvidence', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Put('orders/:orderId/packaging-evidence/:evidenceId/content')
  @ExistingObligation()
  @HttpCode(200)
  async upload(
    @Param('orderId') id: string,
    @Param('evidenceId') eid: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.evidence.upload(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.uuid(eid),
      req,
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/orders/:orderId/packaging-evidence')
  @ExistingObligation()
  list(@Param('orderId') id: string, @Req() req: AuthenticatedRequest) {
    return this.evidence.list(req.auth, this.input.uuid(id));
  }
  @Get('me/orders/:orderId/packaging-evidence/:evidenceId/read')
  @ExistingObligation()
  read(
    @Param('orderId') id: string,
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
}
