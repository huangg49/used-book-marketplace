import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { SupportService } from './support.service.js';
import {
  SupportController,
  OperationsSupportController,
} from './support.controller.js';
@Module({
  imports: [CommandsModule],
  providers: [SupportService],
  controllers: [SupportController, OperationsSupportController],
})
export class SupportModule {}
