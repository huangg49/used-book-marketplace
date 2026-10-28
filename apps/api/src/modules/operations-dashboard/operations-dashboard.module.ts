import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { OperationsDashboardController } from './operations-dashboard.controller.js';
import { OperationsDashboardService } from './operations-dashboard.service.js';

@Module({
  imports: [CommandsModule],
  controllers: [OperationsDashboardController],
  providers: [OperationsDashboardService],
})
export class OperationsDashboardModule {}
