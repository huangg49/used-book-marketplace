import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';
@Module({
  imports: [CommandsModule, DatabaseModule],
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
