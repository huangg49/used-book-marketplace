import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { ReviewsService } from './reviews.service.js';

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
  ) {
    return this.reviews.createExchangeReview(
      req.auth,
      this.input.uuid(id),
      this.input.body('CreateExchangeReview', body),
    );
  }
}
