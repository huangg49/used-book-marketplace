import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { SupportService } from './support.service.js';
import { SupportTargetsService } from './support-targets.service.js';

@Controller('me/support-targets')
@Roles('MEMBER')
export class SupportTargetsController {
  constructor(
    private readonly targets: SupportTargetsService,
    private readonly input: ContractInput,
  ) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.targets.list(
      req.auth,
      this.input.query('listMySupportTargets', req.query),
    );
  }
  @Get(':type/:id')
  get(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.targets.get(req.auth, type, this.input.uuid(id));
  }
}

@Controller('me/support-cases')
@Roles('MEMBER')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly input: ContractInput,
  ) {}
  @Get()
  @ExistingObligation()
  list(@Req() req: AuthenticatedRequest) {
    return this.support.list(
      req.auth,
      this.input.query('listMySupportCases', req.query),
      false,
    );
  }
  @Get(':caseId')
  @ExistingObligation()
  read(@Param('caseId') id: string, @Req() req: AuthenticatedRequest) {
    return this.support.read(req.auth, this.input.uuid(id), false);
  }
  @Post()
  @HttpCode(200)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.support.create(
        commandContext(this.input, req, res),
        this.input.body('CreateSupportCase', body),
      ),
      res,
    );
  }
  @Post(':caseId/messages')
  @HttpCode(200)
  @ExistingObligation()
  reply(
    @Param('caseId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.support.message(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SupportMessageCommand', body),
        false,
      ),
      res,
    );
  }
}
@Controller('operations/support-cases')
@Roles('ADMIN')
export class OperationsSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly input: ContractInput,
  ) {}
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.support.list(
      req.auth,
      this.input.query('listOperationsSupportCases', req.query),
      true,
    );
  }
  @Get(':caseId')
  read(@Param('caseId') id: string, @Req() req: AuthenticatedRequest) {
    return this.support.read(req.auth, this.input.uuid(id), true);
  }
  @Post(':caseId/messages')
  @HttpCode(200)
  message(
    @Param('caseId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.support.message(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SupportMessageCommand', body),
        true,
      ),
      res,
    );
  }
  // ADR 0079: close the reported auction with a message.
  @Post(':caseId/close-auction')
  @HttpCode(200)
  closeAuction(
    @Param('caseId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.support.closeAuction(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('CloseReportedAuction', body),
      ),
      res,
    );
  }
  @Post(':caseId/actions')
  @HttpCode(200)
  act(
    @Param('caseId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.support.act(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('SupportActionCommand', body),
      ),
      res,
    );
  }
}
