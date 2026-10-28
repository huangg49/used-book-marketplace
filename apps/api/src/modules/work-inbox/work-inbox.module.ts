import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { WorkInboxController } from './work-inbox.controller.js';
import { WorkInboxService } from './work-inbox.service.js';
@Module({
  imports: [CommandsModule],
  controllers: [WorkInboxController],
  providers: [WorkInboxService],
})
export class WorkInboxModule {}
