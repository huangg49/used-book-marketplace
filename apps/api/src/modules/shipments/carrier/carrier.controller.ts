import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.guard.js';
import { Public } from '../../auth/public.decorator.js';
import { invalidField } from '../../commands/domain-error.js';
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

  private requireLocalDriver(req: Request) {
    this.carrier.requireLocalDriver(req.socket.remoteAddress, [
      req.get('host'), req.get('x-forwarded-host'), req.get('origin'), req.get('referer'),
    ], req.get('x-forwarded-for'));
  }

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
  async createShipment(@Body() body: ShipmentOrderInput, @Req() req: Request) {
    if (body.carrierCode?.toUpperCase() === 'SIMULATOR') this.requireLocalDriver(req);
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
   * Endpoint tra cứu đơn hàng vận chuyển thật cho App Tài Xế / Bưu tá GHN
   */
  @Get('shipments/carrier/orders/active')
  @Public()
  async getActiveShipmentOrder(
    @Req() req: Request,
    @Query('trackingCode') trackingCode?: string,
    @Query('exchangeId') exchangeId?: string,
    @Query('leg') leg?: 'initiator' | 'recipient',
  ) {
    this.requireLocalDriver(req);
    return this.carrier.getShipmentOrder(trackingCode, exchangeId, leg);
  }

  @Get('shipments/carrier/orders/recent')
  @Public()
  async getRecentShipmentOrders(@Req() req: Request) {
    this.requireLocalDriver(req);
    return this.carrier.getRecentShipmentOrders();
  }

  @Post('shipments/carrier/orders/:id/reset-for-demo')
  @Public()
  async resetForDemo(@Req() req: Request) {
    this.requireLocalDriver(req);
    return this.carrier.resetForDemo();
  }

  @Post('shipments/carrier/orders/:id/auto-simulate')
  @Public()
  async autoSimulateExchange(@Param('id') id: string, @Req() req: Request) {
    this.requireLocalDriver(req);
    return this.carrier.autoSimulateExchange(id);
  }

  @Post('shipments/carrier/seed-demo-order')
  @Public()
  async seedDemoOrder(@Req() req: Request) {
    this.requireLocalDriver(req);
    return this.carrier.seedDemoOrder();
  }

  @Get('shipments/carrier/order/:code')
  @Public()
  async getShipmentOrderByCode(@Param('code') code: string, @Req() req: Request) {
    this.requireLocalDriver(req);
    return this.carrier.getShipmentOrder(code);
  }

  /** Legacy callback path used by the local driver simulator. */
  @Post('webhooks/carrier')
  @HttpCode(200)
  @Public()
  async webhookCallback(
    @Body()
    body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    this.requireLocalDriver(req);
    const trackingCode = String(body.OrderCode || body.trackingCode || body.order_code || '').trim().toUpperCase();
    const rawStatus = String(body.Status || body.status || '').toUpperCase();
    const status =
      rawStatus === 'DELIVERED' || rawStatus === 'FINISH'
        ? 'DELIVERED'
        : rawStatus === 'PICKING' || rawStatus === 'PICKED'
          ? 'PICKING'
          : rawStatus === 'IN_TRANSIT' ? 'IN_TRANSIT' : null;
    if (!trackingCode) throw invalidField('/trackingCode', 'Nhập mã vận đơn.');
    if (!status) throw invalidField('/status', 'Trạng thái mô phỏng không hợp lệ.');
    const description = String(body.Description || body.description || '');

    return this.carrier.processWebhook({ trackingCode, status, description });
  }
}
