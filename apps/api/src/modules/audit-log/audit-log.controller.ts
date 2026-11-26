import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { AuditLogService, type AuditQuery } from './audit-log.service.js';

// FR-G05: read-only Admin activity log. There is deliberately no write route.
@Controller('operations/audit-events')
export class AuditLogController {
  constructor(
    private readonly audit: AuditLogService,
    private readonly input: ContractInput,
  ) {}

  @Get()
  @Roles('ADMIN')
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.audit.list(
      req.auth,
      this.input.query('listAuditEvents', query) as unknown as AuditQuery,
    );
  }
}
