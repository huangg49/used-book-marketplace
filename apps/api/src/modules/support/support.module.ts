import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { SupportService } from './support.service.js';
import { SupportTargetsService } from './support-targets.service.js';
import {
  SupportController,
  OperationsSupportController,
  SupportTargetsController,
} from './support.controller.js';
@Module({
  imports: [CommandsModule],
  providers: [SupportService, SupportTargetsService],
  controllers: [
    SupportController,
    OperationsSupportController,
    SupportTargetsController,
  ],
})
export class SupportModule {}
