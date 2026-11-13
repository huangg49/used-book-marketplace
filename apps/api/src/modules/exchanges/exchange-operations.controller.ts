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
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { ExchangesService } from './exchanges.service.js';

@Controller('operations/exchanges')
export class ExchangeOperationsController {
  constructor(
    private readonly exchanges: ExchangesService,
    private readonly input: ContractInput,
  ) {}

  @Get('resolutions')
  @Roles('STAFF', 'ADMIN')
  listResolutions(@Req() req: AuthenticatedRequest) {
    return this.exchanges.listResolutions(req.auth);
  }

  @Get(':id/dispute')
  @Roles('STAFF', 'ADMIN')
  getOperationsExchangeDispute(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.exchanges.getOperationsDispute(req.auth, this.input.uuid(id));
  }

  @Post(':id/return-resolution')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  actOnOperationsExchangeReturn(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(this.exchanges.actOnReturn(
      commandContext(this.input, req, res), this.input.uuid(id),
      this.input.body('ExchangeReturnCommand', body), true,
    ), res);
  }

  @Post(':id/demo-advance')
  @Roles('ADMIN')
  @HttpCode(200)
  advanceOperationsDemoExchangeDeadline(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(this.exchanges.advanceDemoDeadline(
      commandContext(this.input, req, res), this.input.uuid(id),
      this.input.body('DemoExchangeDeadlineCommand', body), true,
    ), res);
  }

  @Post(':id/resolve')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  resolveExchangeDispute(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.exchanges.resolveDispute(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('ResolveExchangeDisputeCommand', body),
      ),
      res,
    );
  }
}

