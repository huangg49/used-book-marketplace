import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { MediaModule } from '../media/media.module.js';
import { AutofillAssistController } from './autofill-assist.controller.js';
import { AutofillAssistService } from './autofill-assist.service.js';
import { AutofillImages, StorageAutofillImages } from './autofill-images.js';
import { AutofillModel, autofillModelFromConfig } from './autofill-model.js';

const reader = (config: ConfigService) => (key: string) => {
  const value = config.get<unknown>(key);
  return value === undefined || value === null ? undefined : String(value);
};

// ADR 0048. A null model keeps the endpoint answering 503 so clients fall
// back to manual entry.
@Module({
  imports: [DatabaseModule, CommandsModule, MediaModule],
  providers: [
    AutofillAssistService,
    {
      provide: AutofillModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AutofillModel | null =>
        autofillModelFromConfig(reader(config)),
    },
    { provide: AutofillImages, useClass: StorageAutofillImages },
  ],
  controllers: [AutofillAssistController],
})
export class AutofillAssistModule {}
