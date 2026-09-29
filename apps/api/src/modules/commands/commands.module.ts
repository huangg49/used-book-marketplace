import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ContractInput } from './contract-input.service.js';
import { MongoCommandService } from './mongo-command.service.js';
import { MongoPageService } from './mongo-page.service.js';
@Module({
  imports: [DatabaseModule],
  providers: [ContractInput, MongoCommandService, MongoPageService],
  exports: [ContractInput, MongoCommandService, MongoPageService],
})
export class CommandsModule {}
