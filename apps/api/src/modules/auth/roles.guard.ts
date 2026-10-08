import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.guard.js';

type Role = CurrentUser['roles'][number];
export const Roles = (...roles: Role[]) => SetMetadata('auth:roles', roles);

// Use after AuthGuard. Object ownership and transaction eligibility still belong to each feature.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    if (context.getType() === 'ws') return true;
    const roles = this.reflector.getAllAndOverride<Role[]>('auth:roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (roles?.length && !roles.some((role) => auth?.user.roles.includes(role)))
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện thao tác này.',
      );
    return true;
  }
}
