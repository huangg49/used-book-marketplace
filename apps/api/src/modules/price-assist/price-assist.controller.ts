import { AssistTimings } from './assist-timings.js';
import type { Response } from 'express';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { PriceAssistService } from './price-assist.service.js';

@Controller()
@Roles('MEMBER')
export class PriceAssistController {
  constructor(
    private readonly service: PriceAssistService,
    private readonly input: ContractInput,
  ) {}

  @Post('listings/:listingId/price-reference')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async reference(
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const started = performance.now();
    try {
      return await this.service.reference(
        req.auth,
        this.input.uuid(listingId),
        this.input.body('PriceSuggestionRequest', body),
      );
    } finally {
      res.setHeader(
        'Server-Timing',
        `price_reference;dur=${(performance.now() - started).toFixed(1)}`,
      );
    }
  }

  @Post('listings/:listingId/price-suggestions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async suggest(
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const timings = new AssistTimings();
    try {
      return await this.service.suggest(
        req.auth,
        this.input.uuid(listingId),
        this.input.uuid(req.headers['idempotency-key']),
        this.input.body('PriceSuggestionRequest', body),
        timings,
      );
    } finally {
      res.setHeader('Server-Timing', timings.header());
    }
  }
}
