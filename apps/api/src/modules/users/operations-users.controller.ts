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
import { commandContext, commandResponse } from '../commands/command-http.js';
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
  @Get(':userId')
  @Roles('ADMIN')
  detail(@Req() req: AuthenticatedRequest, @Param('userId') id: string) {
    return this.users.detail(req.auth, this.input.uuid(id));
  }
  @Get(':userId/history')
  @Roles('ADMIN')
  history(
    @Req() req: AuthenticatedRequest,
    @Param('userId') id: string,
    @Query() query: unknown,
  ) {
    return this.users.history(
      req.auth,
      this.input.uuid(id),
      this.input.query('listAccountControlHistory', query),
    );
  }
  @Post(':userId/lock')
  @HttpCode(200)
  @Roles('ADMIN')
  lock(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('userId') id: string,
    @Body() body: unknown,
  ) {
    return commandResponse(
      this.users.change(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('LockUserAccount', body),
        true,
      ),
      res,
    );
  }
  @Post(':userId/unlock')
  @HttpCode(200)
  @Roles('ADMIN')
  unlock(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Param('userId') id: string,
    @Body() body: unknown,
  ) {
    return commandResponse(
      this.users.change(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('UnlockUserAccount', body),
        false,
      ),
      res,
    );
  }

  @Get()
  @Roles('ADMIN')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.users.list(
      request.auth,
      this.input.query('listOperationsUsers', query),
    );
  }
}
