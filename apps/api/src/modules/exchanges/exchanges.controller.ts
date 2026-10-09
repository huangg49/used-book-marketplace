import { Controller, Get, HttpCode, Param, Post, Body, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { ExchangesService } from './exchanges.service.js';

@Controller('exchanges')
export class ExchangesController {
  constructor(
    private readonly exchanges: ExchangesService,
    private readonly input: ContractInput,
  ) {}

  @Post()
  @Roles('MEMBER')
  @HttpCode(201)
  create(@Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(
      this.exchanges.create(
        commandContext(this.input, req, res),
        this.input.body('CreateExchangeProposal', body),
      ),
      res,
    );
  }

  @Get()
  @Roles('MEMBER')
  list(@Req() req: AuthenticatedRequest) {
    return this.exchanges.list(req.auth);
  }

  @Get(':id')
  @Roles('MEMBER')
  getExchange(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.exchanges.getExchange(req.auth, this.input.uuid(id));
  }

  @Post(':id/accept')
  @Roles('MEMBER')
  @HttpCode(200)
  acceptExchange(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(
      this.exchanges.accept(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('AcceptExchange', body),
      ),
      res,
    );
  }

  @Post(':id/funding')
  @Roles('MEMBER')
  @HttpCode(200)
  fundExchange(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(
      this.exchanges.fund(
        commandContext(this.input, req, res),
        this.input.uuid(id),
      ),
      res,
    );
  }
}
