import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext } from '../commands/command-http.js';
import { DirectOrderIssueEvidenceService } from './direct-order-issue-evidence.service.js';

@Controller('support-cases/:caseId/order-evidence')
@Roles('MEMBER', 'ADMIN')
export class DirectOrderIssueEvidenceController {
  constructor(private readonly evidence: DirectOrderIssueEvidenceService, private readonly input: ContractInput) {}

  @Get()
  @ExistingObligation()
  list(@Param('caseId') caseId: string, @Req() req: AuthenticatedRequest) {
    return this.evidence.list(req.auth, this.input.uuid(caseId));
  }

  @Post()
  @Roles('MEMBER')
  @ExistingObligation()
  @HttpCode(200)
  async reserve(@Param('caseId') caseId: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.evidence.reserve(commandContext(this.input, req, res), this.input.uuid(caseId), this.input.body('ReserveDirectOrderIssueEvidence', body));
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }

  @Put(':evidenceId/content')
  @Roles('MEMBER')
  @ExistingObligation()
  @HttpCode(200)
  async upload(@Param('caseId') caseId: string, @Param('evidenceId') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.evidence.upload(commandContext(this.input, req, res), this.input.uuid(caseId), this.input.uuid(id), req);
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }

  @Post(':evidenceId/read')
  @ExistingObligation()
  @HttpCode(200)
  read(@Param('caseId') caseId: string, @Param('evidenceId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return this.evidence.read(req.auth, this.input.uuid(caseId), this.input.uuid(id),
      res.locals.requestId as string, this.input.body('ReadDirectOrderIssueEvidence', body).reason);
  }
}
