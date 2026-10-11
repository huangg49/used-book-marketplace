import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './public.decorator.js';
import { AccountAuthService } from './account-auth.service.js';
import {
  AccountEmailDto,
  AuthActionTokenDto,
  RegisterAccountDto,
  ResetPasswordDto,
} from './account-auth.dto.js';

@Controller('auth')
export class AccountAuthController {
  constructor(private readonly accounts: AccountAuthService) {}
  @Public()
  @Post('register')
  @HttpCode(202)
  register(@Body() body: RegisterAccountDto, @Req() req: Request) {
    return this.accounts.register(body, req.ip ?? 'unknown');
  }
  @Public()
  @Post('verification/resend')
  @HttpCode(202)
  resend(@Body() body: AccountEmailDto, @Req() req: Request) {
    return this.accounts.requestLink(
      body.email,
      req.ip ?? 'unknown',
      'VerifyEmail',
    );
  }
  @Public()
  @Post('verify-email')
  @HttpCode(204)
  verify(@Body() body: AuthActionTokenDto, @Req() req: Request) {
    return this.accounts.verify(body.token, req.ip ?? 'unknown');
  }
  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  forgot(@Body() body: AccountEmailDto, @Req() req: Request) {
    return this.accounts.requestLink(
      body.email,
      req.ip ?? 'unknown',
      'ResetPassword',
    );
  }
  @Public()
  @Post('reset-password')
  @HttpCode(204)
  reset(@Body() body: ResetPasswordDto, @Req() req: Request) {
    return this.accounts.reset(body.token, body.password, req.ip ?? 'unknown');
  }
}
