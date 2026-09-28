import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE } from './public.decorator.js';
import { AuthService, type CurrentUser } from './auth.service.js';
import { LOCKED_ACCESS } from './obligations.decorator.js';

export type AuthenticatedRequest = Request & {
  auth: { sessionId: string; user: CurrentUser };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match)
      throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục.');
    request.auth = await this.auth.authenticate(match[1]);
    if (
      request.auth.user.status === 'LOCKED' &&
      !this.reflector.get<boolean>(LOCKED_ACCESS, context.getHandler())
    )
      throw new ForbiddenException({
        code: 'AccountIneligible',
        message:
          'Tài khoản đang bị khóa. Bạn vẫn có thể xem ví và xử lý giao dịch đã có.',
      });
    return true;
  }
}
