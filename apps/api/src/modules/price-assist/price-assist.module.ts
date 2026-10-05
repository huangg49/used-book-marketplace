import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { PriceAssistController } from './price-assist.controller.js';
import { PriceAssistService } from './price-assist.service.js';
import { PriceModel, priceModelFromConfig } from './price-model.js';

@Module({
  imports: [DatabaseModule, CommandsModule],
  providers: [
    PriceAssistService,
    {
      // null keeps the endpoint answering rule-only results and 503 for model calls.
      provide: PriceModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PriceModel | null =>
        priceModelFromConfig((key) => {
          const value = config.get<unknown>(key);
          return value === undefined || value === null ? undefined : String(value);
        }),
    },
  ],
  controllers: [PriceAssistController],
  exports: [PriceAssistService],
})
export class PriceAssistModule {}
