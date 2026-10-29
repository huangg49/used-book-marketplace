import { AssistTimings } from '../price-assist/assist-timings.js';
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
import { AutofillAssistService } from './autofill-assist.service.js';

@Controller()
@Roles('MEMBER')
export class AutofillAssistController {
  constructor(
    private readonly service: AutofillAssistService,
    private readonly input: ContractInput,
  ) {}

  @Post('listings/:listingId/autofill-suggestions')
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
        this.input.body('AutofillSuggestionRequest', body),
        timings,
      );
    } finally {
      res.setHeader('Server-Timing', timings.header());
    }
  }
}
