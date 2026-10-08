import { Controller, Get, HttpCode, Param, Post, Body, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { PurchasesService } from './purchases.service.js';

@Controller()
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService, private readonly input: ContractInput) {}
  @Post('listings/:listingId/purchase-conversations') @Roles('MEMBER') @HttpCode(200)
  create(@Param('listingId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(this.purchases.create(commandContext(this.input, req, res), this.input.uuid(id), this.input.body('CreatePurchaseConversation', body),), res);
  }
  @Get('me/purchase-conversations') @Roles('MEMBER') list(@Req() req: AuthenticatedRequest) { return this.purchases.list(req.auth); }
  @Get('me/purchase-conversations/:conversationId/messages') @Roles('MEMBER') messages(@Param('conversationId') id: string, @Req() req: AuthenticatedRequest) { return this.purchases.messages(req.auth, this.input.uuid(id)); }
}
