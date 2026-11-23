import { Controller, Get, Param, Query, Req } from '@nestjs/common';
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
  @Get('revenue-overview')
  @Roles('STAFF', 'ADMIN')
  revenue(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.revenue(
      req.auth,
      this.input.query('getRevenueOverview', query),
    );
  }
  @Get('finance-overview')
  @Roles('ADMIN')
  finance(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.finance(
      req.auth,
      this.input.query('getFinanceOverview', query),
    );
  }
  @Get('finance-cashflow')
  @Roles('ADMIN')
  cashflow(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.cashflow(
      req.auth,
      this.input.query('getFinanceCashflow', query),
    );
  }
  @Get('finance-holds')
  @Roles('ADMIN')
  holds(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.holds(
      req.auth,
      this.input.query('getFinanceHolds', query),
    );
  }
  @Get('finance-hold-history')
  @Roles('ADMIN')
  holdHistory(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.holdHistory(
      req.auth,
      this.input.query('getFinanceHoldHistory', query),
    );
  }
  @Get('finance-hold-locks')
  @Roles('ADMIN')
  holdLocks(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.holdLocks(
      req.auth,
      this.input.query('getFinanceHoldLocks', query),
    );
  }
  @Get('finance-transfers')
  @Roles('ADMIN')
  transfers(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.transfers(
      req.auth,
      this.input.query('getFinanceTransfers', query),
    );
  }
  @Get('operations-analytics')
  @Roles('STAFF', 'ADMIN')
  analytics(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.dashboard.analytics(
      req.auth,
      this.input.query('getOperationsAnalytics', query),
    );
  }
  @Get('users/:userId/avatar/read')
  @Roles('STAFF', 'ADMIN')
  avatar(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.dashboard.readUserAvatar(req.auth, this.input.uuid(userId));
  }
}
