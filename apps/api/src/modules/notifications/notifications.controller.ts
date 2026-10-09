import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { NotificationsService } from './notifications.service.js';

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly input: ContractInput,
  ) {}

  // A LOCKED member must still learn about auctions/orders they are bound to
  // (FR-AU09 hold, payment deadlines); the service only reads their own rows.
  @Get('me/notifications')
  @ExistingObligation()
  list(@Query() raw: unknown, @Req() req: AuthenticatedRequest) {
    const query = this.input.query('listMyNotifications', raw);
    return this.notifications.list(
      req.auth,
      query.cursor as string | undefined,
      query.limit as number | undefined,
    );
  }

  @Post('me/notifications/read')
  @ExistingObligation()
  @HttpCode(200)
  markRead(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    // Required like every mutation; marking read is naturally idempotent.
    this.input.uuid(req.headers['idempotency-key']);
    return this.notifications.markRead(
      req.auth,
      this.input.body('MarkNotificationsRead', body),
    );
  }
}
