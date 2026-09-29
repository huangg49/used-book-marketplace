import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { LegacyCatalogLocks } from './legacy-catalog-locks.js';
@Module({
  imports: [DatabaseModule, CommandsModule],
  providers: [CatalogService, LegacyCatalogLocks],
  controllers: [CatalogController],
  exports: [CatalogService, LegacyCatalogLocks],
})
export class CatalogModule {}
