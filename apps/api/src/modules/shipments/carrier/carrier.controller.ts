import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.guard.js';
import { Public } from '../../auth/public.decorator.js';
import { CarrierService } from './carrier.service.js';
import type { CarrierAddress, ShipmentOrderInput } from './carrier.interface.js';

interface CalculateFeeBody {
  fromAddress: CarrierAddress;
  toAddress: CarrierAddress;
  carrierCode?: string;
}

@Controller()
export class CarrierController {
  constructor(private readonly carrier: CarrierService) {}

  @Post('shipments/carrier/calculate-fee')
  @HttpCode(200)
  @Roles('MEMBER')
  async calculateFee(@Body() body: CalculateFeeBody) {
    const fee = await this.carrier.calculateFee(
      body.fromAddress,
      body.toAddress,
      body.carrierCode,
    );
    const adapter = this.carrier.getAdapter(body.carrierCode);
    return {
      fee,
      carrierCode: adapter.carrierCode,
      carrierName: adapter.carrierName,
    };
  }

  @Post('shipments/carrier/create')
  @HttpCode(200)
  @Roles('MEMBER')
  async createShipment(@Body() body: ShipmentOrderInput) {
    const result = await this.carrier.createShipment(body);
    const adapter = this.carrier.getAdapter(body.carrierCode);
    return {
      ...result,
      carrierCode: adapter.carrierCode,
      carrierName: adapter.carrierName,
    };
  }

  @Get('shipments/carrier/tracking/:code')
  @Roles('MEMBER')
  async getTracking(
    @Param('code') code: string,
    @Query('carrier') carrier?: string,
  ) {
    return this.carrier.getTrackingStatus(code, carrier);
  }

  /**
   * Endpoint tra cứu đơn hàng vận chuyển thật cho App Tài Xế / Bưu tá
   */
  @Get('shipments/carrier/orders/active')
  @Public()
  async getActiveShipmentOrder(@Query('trackingCode') trackingCode?: string) {
    return this.carrier.getShipmentOrder(trackingCode);
  }

  @Get('shipments/carrier/order/:code')
  @Public()
  async getShipmentOrderByCode(@Param('code') code: string) {
    return this.carrier.getShipmentOrder(code);
  }

  /**
   * Endpoint nhận Webhook callback từ các đơn vị vận chuyển (GHN/GHTK)
   */
  @Post('webhooks/carrier')
  @HttpCode(200)
  @Public()
  async webhookCallback(
    @Body()
    body: Record<string, unknown>,
  ) {
    const trackingCode = String(body.OrderCode || body.trackingCode || body.order_code || '');
    const rawStatus = String(body.Status || body.status || '').toUpperCase();
    const status =
      rawStatus === 'DELIVERED' || rawStatus === 'FINISH'
        ? 'DELIVERED'
        : rawStatus === 'PICKING' || rawStatus === 'PICKED'
          ? 'PICKING'
          : rawStatus === 'READY_TO_PICK'
            ? 'READY_TO_PICK'
            : 'IN_TRANSIT';
    const description = String(body.Description || body.description || '');

    if (trackingCode) {
      await this.carrier.processWebhook({
        trackingCode,
        status,
        description,
      });
    }
    return { received: true, timestamp: new Date().toISOString() };
  }
}
