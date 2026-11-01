import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { CartService } from './cart.service.js';
@Controller('me/cart')
@Roles('MEMBER')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly input: ContractInput,
  ) {}
  @Get()
  @ExistingObligation()
  read(@Req() req: AuthenticatedRequest) {
    return this.cart.read(req.auth);
  }
  @Post('add')
  @HttpCode(200)
  add(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    return commandResponse(
      this.cart.change(
        commandContext(this.input, req, res),
        this.input.body('AddCartItem', body),
        true,
      ),
      res,
    );
  }
  @Post('remove')
  @HttpCode(200)
  @ExistingObligation()
  remove(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    return commandResponse(
      this.cart.change(
        commandContext(this.input, req, res),
        this.input.body('RemoveCartItem', body),
        false,
      ),
      res,
    );
  }
}
