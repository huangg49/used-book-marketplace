import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandService } from './command.service.js';
import { ContractInput } from './contract-input.service.js';
import { MongoCommandService } from './mongo-command.service.js';
import { MongoPageService } from './mongo-page.service.js';
import { PageService } from './page.service.js';
// CommandService/PageService (Prisma) remain until every module is ported.
@Module({
  imports: [DatabaseModule],
  providers: [
    CommandService,
    ContractInput,
    PageService,
    MongoCommandService,
    MongoPageService,
  ],
  exports: [
    CommandService,
    ContractInput,
    PageService,
    MongoCommandService,
    MongoPageService,
  ],
})
export class CommandsModule {}
