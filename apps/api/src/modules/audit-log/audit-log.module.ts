import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';

@Module({
  imports: [CommandsModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
})
export class AuditLogModule {}
