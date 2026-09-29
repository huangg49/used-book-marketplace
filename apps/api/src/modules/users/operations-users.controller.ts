import { Controller, Get, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { OperationsUsersService } from './operations-users.service.js';

@Controller('operations/users')
export class OperationsUsersController {
  constructor(
    private readonly users: OperationsUsersService,
    private readonly input: ContractInput,
  ) {}

  @Get()
  @Roles('ADMIN')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.users.list(
      request.auth,
      this.input.query('listOperationsUsers', query),
    );
  }
}
