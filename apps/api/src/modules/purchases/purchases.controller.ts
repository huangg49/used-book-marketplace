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
  @Post('me/purchase-conversations/:conversationId/quote') @Roles('MEMBER') @HttpCode(200)
  attachQuote(@Param('conversationId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(this.purchases.attachQuote(commandContext(this.input, req, res), this.input.uuid(id), this.input.body('AttachPurchaseConversationQuote', body)), res);
  }
  @Get('me/purchase-conversations/:conversationId') @Roles('MEMBER')
  get(@Param('conversationId') id: string, @Req() req: AuthenticatedRequest) { return this.purchases.get(req.auth, this.input.uuid(id)); }
  @Get('me/purchase-conversations/:conversationId/events') @Roles('MEMBER')
  events(@Param('conversationId') id: string, @Req() req: AuthenticatedRequest) { return this.purchases.events(req.auth, this.input.uuid(id)); }
  @Post('me/purchase-conversations/:conversationId/terms') @Roles('MEMBER') @HttpCode(200)
  propose(@Param('conversationId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(this.purchases.terms(commandContext(this.input, req, res), this.input.uuid(id), this.input.body('ProposeConversationTerms', body), false), res);
  }
  @Post('me/purchase-conversations/:conversationId/terms/respond') @Roles('MEMBER') @HttpCode(200)
  respond(@Param('conversationId') id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    return commandResponse(this.purchases.terms(commandContext(this.input, req, res), this.input.uuid(id), this.input.body('RespondConversationTerms', body), true), res);
  }

}
