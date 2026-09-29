import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';
@Module({
  imports: [DatabaseModule, CommandsModule],
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}
