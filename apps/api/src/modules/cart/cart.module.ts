import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { CartService } from './cart.service.js';
import { CartController } from './cart.controller.js';
@Module({
  imports: [CommandsModule, ListingsModule],
  providers: [CartService],
  controllers: [CartController],
})
export class CartModule {}
