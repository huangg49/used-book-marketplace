import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';
import { CarrierSimulator } from './carrier-simulator.js';
@Module({
  imports: [CommandsModule, OrdersModule, WalletModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, CarrierSimulator],
})
export class ShipmentsModule {}
