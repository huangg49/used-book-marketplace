import { Body, Controller, Header, HttpCode, Param, Post, Req } from '@nestjs/common';
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

  @Post('listings/:listingId/price-suggestions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  suggest(
    @Param('listingId') listingId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.suggest(
      req.auth,
      this.input.uuid(listingId),
      this.input.uuid(req.headers['idempotency-key']),
      this.input.body('PriceSuggestionRequest', body),
    );
  }
}
