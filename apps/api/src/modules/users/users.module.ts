import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { OperationsUsersController } from './operations-users.controller.js';
import { OperationsUsersService } from './operations-users.service.js';

@Module({
  imports: [CommandsModule],
  controllers: [OperationsUsersController],
  providers: [OperationsUsersService],
})
export class UsersModule {}
