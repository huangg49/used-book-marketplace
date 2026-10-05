import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { PriceAssistController } from './price-assist.controller.js';
import { PriceAssistService } from './price-assist.service.js';
import { AnthropicPriceModel, PriceModel } from './price-model.js';

@Module({
  imports: [DatabaseModule, CommandsModule],
  providers: [
    PriceAssistService,
    {
      // null keeps the endpoint answering rule-only results and 503 for model calls.
      provide: PriceModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PriceModel | null => {
        const apiKey = config.get<string>('PRICE_ASSIST_API_KEY') ?? '';
        if (config.get('PRICE_ASSIST_ENABLED') !== 'true' || !apiKey) return null;
        const effort = config.get<string>('PRICE_ASSIST_EFFORT') ?? 'low';
        return new AnthropicPriceModel({
          apiKey,
          model: config.get<string>('PRICE_ASSIST_MODEL') ?? 'claude-opus-5-5',
          effort: effort === 'none' ? null : (effort as 'low' | 'medium' | 'high'),
          timeoutMs: Number(config.get('PRICE_ASSIST_TIMEOUT_MS') ?? 20_000),
        });
      },
    },
  ],
  controllers: [PriceAssistController],
  exports: [PriceAssistService],
})
export class PriceAssistModule {}
