import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { Public } from './public.decorator.js';
import { LoginDto, RefreshDto } from './auth.dto.js';
import { ExistingObligation } from './obligations.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.auth.login(body.email, body.password, request.ip ?? 'unknown');
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Body() body: RefreshDto) {
    await this.auth.logout(body.refreshToken);
  }

  @Get('me')
  @ExistingObligation()
  me(@Req() request: AuthenticatedRequest) {
    return request.auth.user;
  }
}
