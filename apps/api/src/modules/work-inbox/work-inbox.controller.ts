import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { WorkInboxService } from './work-inbox.service.js';

@Controller()
export class WorkInboxController {
  constructor(
    private readonly service: WorkInboxService,
    private readonly input: ContractInput,
  ) {}
  @Get('me/work-items')
  @Roles('MEMBER')
  @ExistingObligation()
  member(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.member(
      req.auth,
      this.input.query('listMyWorkItems', query),
    );
  }
  @Get('operations/work-items')
  @Roles('STAFF', 'ADMIN')
  operations(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.operations(
      req.auth,
      this.input.query('listOperationsWorkItems', query),
    );
  }
}
