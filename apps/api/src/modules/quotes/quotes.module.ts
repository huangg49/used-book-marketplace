import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { QuotesService } from './quotes.service.js';
import { QuotesController } from './quotes.controller.js';
import { QuoteClock } from './quote-clock.js';
@Module({
  imports: [CommandsModule, CatalogModule],
  providers: [QuotesService, QuoteClock],
  exports: [QuotesService],
  controllers: [QuotesController],
})
export class QuotesModule {}
