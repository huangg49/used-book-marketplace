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
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { ReviewsService } from './reviews.service.js';
import type { Response } from 'express';
import { commandContext, commandResponse } from '../commands/command-http.js';

@Controller('exchanges')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly input: ContractInput,
  ) {}

  @Get(':id/reviews')
  @Roles('MEMBER')
  getExchangeReviews(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviews.getExchangeReviews(req.auth, this.input.uuid(id));
  }

  @Post(':id/reviews')
  @Roles('MEMBER')
  @HttpCode(201)
  createExchangeReview(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.reviews.createExchangeReview(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('CreateExchangeReview', body),
      ),
      res,
    );
  }
}
