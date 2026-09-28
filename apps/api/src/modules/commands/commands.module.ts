import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandService } from './command.service.js';
import { ContractInput } from './contract-input.service.js';
import { PageService } from './page.service.js';
@Module({
  imports: [DatabaseModule],
  providers: [CommandService, ContractInput, PageService],
  exports: [CommandService, ContractInput, PageService],
})
export class CommandsModule {}
