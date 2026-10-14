import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';
import { CarrierSimulator } from './carrier-simulator.js';
import { CarrierSimulatorAdapter } from './carrier/carrier-simulator.adapter.js';
import { GhnAdapter } from './carrier/ghn.adapter.js';
import { CarrierService } from './carrier/carrier.service.js';
import { CarrierController } from './carrier/carrier.controller.js';

@Module({
  imports: [DatabaseModule, CommandsModule, OrdersModule, WalletModule],
  controllers: [ShipmentsController, CarrierController],
  providers: [
    ShipmentsService,
    CarrierSimulator,
    CarrierSimulatorAdapter,
    GhnAdapter,
    CarrierService,
  ],
  exports: [
    ShipmentsService,
    CarrierService,
    CarrierSimulatorAdapter,
    GhnAdapter,
  ],
})
export class ShipmentsModule {}
