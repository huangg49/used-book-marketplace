import { Module } from '@nestjs/common';
import { AccountAuthController } from './account-auth.controller.js';
import { AccountAuthService } from './account-auth.service.js';
import { AuthMailService } from './auth-mail.service.js';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { LoginLimiter } from './login-limiter.service.js';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: 900,
          issuer: 'lat-lai-api',
          audience: 'lat-lai-clients',
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: 'lat-lai-api',
          audience: 'lat-lai-clients',
        },
      }),
    }),
  ],
  controllers: [AuthController, AccountAuthController],
  providers: [
    AuthService,
    AccountAuthService,
    AuthMailService,
    AuthGuard,
    RolesGuard,
    LoginLimiter,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [AuthGuard, RolesGuard, AuthService],
})
export class AuthModule {}
