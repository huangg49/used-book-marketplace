import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { MemberProfileService } from './member-profile.service.js';
import { MemberProfileController } from './member-profile.controller.js';
import { ProfileAvatarWorker } from './profile-avatar-worker.js';
@Module({
  imports: [DatabaseModule, CommandsModule, AuthModule, MediaModule],
  controllers: [MemberProfileController],
  providers: [MemberProfileService, ProfileAvatarWorker],
  exports: [ProfileAvatarWorker],
})
export class MemberProfileModule {}
