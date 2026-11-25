import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CommandsModule } from '../commands/commands.module.js';
import { TransactionLiveGateway } from './transaction-live.gateway.js';

@Module({
  imports: [DatabaseModule, AuthModule, CommandsModule],
  providers: [TransactionLiveGateway],
})
export class TransactionLiveModule {}
