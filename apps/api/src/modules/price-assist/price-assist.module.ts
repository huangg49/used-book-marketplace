import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { PriceAssistController } from './price-assist.controller.js';
import { PriceAssistService } from './price-assist.service.js';
import { PriceFinder, priceFinderFromConfig } from './online/price-finder.js';
import {
  PageFetcher,
  PriceLookupService,
  SafePageFetcher,
} from './online/price-lookup.service.js';
import { PriceModel, priceModelFromConfig } from './price-model.js';

const reader = (config: ConfigService) => (key: string) => {
  const value = config.get<unknown>(key);
  return value === undefined || value === null ? undefined : String(value);
};

@Module({
  imports: [DatabaseModule, CommandsModule],
  providers: [
    PriceAssistService,
    {
      // null keeps the endpoint answering rule-only results and 503 for model calls.
      provide: PriceModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PriceModel | null =>
        priceModelFromConfig(reader(config)),
    },
    PriceLookupService,
    { provide: PageFetcher, useClass: SafePageFetcher },
    {
      provide: PriceFinder,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => priceFinderFromConfig(reader(config)),
    },
  ],
  controllers: [PriceAssistController],
  exports: [PriceAssistService],
})
export class PriceAssistModule {}
