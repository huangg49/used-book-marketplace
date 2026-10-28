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
import { Public } from '../auth/public.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ReviewsService } from './reviews.service.js';
import { ReviewQueries } from './review-queries.service.js';

@Controller()
export class TransactionReviewsController {
  constructor(
    private readonly service: ReviewsService,
    private readonly queries: ReviewQueries,
    private readonly input: ContractInput,
  ) {}
  @Get('transactions/:type/:id/reviews')
  @Roles('MEMBER')
  get(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.get(
      req.auth,
      this.service.type(type),
      this.input.uuid(id),
    );
  }
  @Post('transactions/:type/:id/reviews')
  @Roles('MEMBER')
  @HttpCode(200)
  create(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.service.create(
        commandContext(this.input, req, res),
        this.service.type(type),
        this.input.uuid(id),
        this.input.body('CreateTransactionReview', body),
      ),
      res,
    );
  }
  @Post('transaction-reviews/:reviewId/edit')
  @Roles('MEMBER')
  @HttpCode(200)
  edit(
    @Param('reviewId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.service.change(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        'edit',
        this.input.body('EditTransactionReview', body),
      ),
      res,
    );
  }
  @Post('transaction-reviews/:reviewId/delete')
  @Roles('MEMBER')
  @HttpCode(200)
  remove(
    @Param('reviewId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.service.change(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        'delete',
        this.input.body('ReviewVersion', body),
      ),
      res,
    );
  }
  @Post('transaction-reviews/:reviewId/reply')
  @Roles('MEMBER')
  @HttpCode(200)
  reply(
    @Param('reviewId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.service.change(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        'reply',
        this.input.body('ReplyTransactionReview', body),
      ),
      res,
    );
  }
  @Get('me/review-transactions')
  @Roles('MEMBER')
  transactions(@Req() req: AuthenticatedRequest) {
    return this.queries.listTransactions(
      req.auth,
      this.input.query('listMyReviewTransactions', req.query),
    );
  }
  @Public()
  @Get('members/:id/reputation')
  reputation(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.queries.reputation(
      this.input.uuid(id),
      this.input.query('getMemberReputation', req.query),
    );
  }
  @Get('operations/transaction-reviews')
  @Roles('STAFF', 'ADMIN')
  operations(@Req() req: AuthenticatedRequest) {
    return this.queries.listOperations(
      req.auth,
      this.input.query('listOperationsTransactionReviews', req.query),
    );
  }
  @Get('operations/transaction-reviews/:reviewId/revisions')
  @Roles('STAFF', 'ADMIN')
  revisions(@Param('reviewId') id: string, @Req() req: AuthenticatedRequest) {
    return this.queries.revisions(
      req.auth,
      this.input.uuid(id),
      this.input.query('listTransactionReviewRevisions', req.query),
    );
  }
  @Post('operations/transaction-reviews/:reviewId/decision')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  moderate(
    @Param('reviewId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.service.change(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        'moderate',
        this.input.body('ModerateTransactionReview', body),
      ),
      res,
    );
  }
}
