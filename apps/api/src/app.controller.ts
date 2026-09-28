import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';
import { DatabaseService } from './database/database.service.js';
import { Public } from './modules/auth/public.decorator.js';

@Controller('health')
@Public()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  async readiness() {
    try {
      await this.database.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException();
    }
    return this.appService.getHealth();
  }
}
