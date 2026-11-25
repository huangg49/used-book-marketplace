import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ContractInput } from './contract-input.service.js';
import { MongoCommandService } from './mongo-command.service.js';
import { MongoPageService } from './mongo-page.service.js';
import { TransactionChanges } from './transaction-changes.js';
@Module({
  imports: [DatabaseModule],
  providers: [ContractInput, MongoCommandService, MongoPageService, TransactionChanges],
  exports: [ContractInput, MongoCommandService, MongoPageService, TransactionChanges],
})
export class CommandsModule {}
