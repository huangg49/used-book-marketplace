import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MediaStorage } from './media-storage.js';
import { MediaWorker } from './media-worker.service.js';
import { ImageUploadSlots } from './image-upload-slots.js';
@Module({
  imports: [DatabaseModule, CommandsModule],
  controllers: [MediaController],
  providers: [MediaService, MediaStorage, MediaWorker, ImageUploadSlots],
  exports: [MediaWorker, MediaStorage, ImageUploadSlots],
})
export class MediaModule {}
