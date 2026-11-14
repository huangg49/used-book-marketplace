import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { MediaModule } from '../media/media.module.js';
import { AutofillAssistController } from './autofill-assist.controller.js';
import { AutofillAssistService } from './autofill-assist.service.js';
import { AutofillImages, StorageAutofillImages } from './autofill-images.js';
import {
  AutofillModel, autofillModelFromConfig, NvidiaAutofillModel, nvidiaAutofillModelFromConfig,
} from './autofill-model.js';
import { CatalogRecoveryService } from './catalog-recovery.service.js';
import { IsbnMatchesService } from './isbn-matches.service.js';
import { IsbnBarcodeReader } from './isbn-barcode-reader.js';

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
    CatalogRecoveryService,
    IsbnMatchesService,
    IsbnBarcodeReader,
    {
      provide: AutofillModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AutofillModel | null =>
        autofillModelFromConfig(reader(config)),
    },
    {
      provide: NvidiaAutofillModel,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => nvidiaAutofillModelFromConfig(reader(config)),
    },
    { provide: AutofillImages, useClass: StorageAutofillImages },
  ],
  controllers: [AutofillAssistController],
  // ADR 0061: the review worker stays on its validated NVIDIA pipeline.
  exports: [NvidiaAutofillModel, AutofillImages, IsbnBarcodeReader],
})
export class AutofillAssistModule {}
