import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { OperationsDashboardService } from './operations-dashboard.service.js';

@Controller('operations')
export class OperationsDashboardController {
  constructor(
    private readonly dashboard: OperationsDashboardService,
    private readonly input: ContractInput,
  ) {}
  @Get('moderation-overview')
  @Roles('STAFF', 'ADMIN')
  overview(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.overview(
      req.auth,
      this.input.query('getModerationOverview', query),
    );
  }
}
