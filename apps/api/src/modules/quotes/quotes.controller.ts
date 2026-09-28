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
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext } from '../commands/command-http.js';
import { QuotesService } from './quotes.service.js';
@Controller()
@Roles('MEMBER')
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly input: ContractInput,
  ) {}
  @Post('listings/:listingId/quotes')
  @HttpCode(200)
  async create(
    @Param('listingId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.quotes.create(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('CreateSaleQuote', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/quotes/:quoteId')
  read(@Param('quoteId') id: string, @Req() req: AuthenticatedRequest) {
    return this.quotes.read(req.auth, this.input.uuid(id));
  }
}
