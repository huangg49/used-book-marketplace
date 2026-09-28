import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext } from '../commands/command-http.js';
import { ShipmentsService } from './shipments.service.js';

@Controller()
@Roles('MEMBER')
export class ShipmentsController {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly input: ContractInput,
  ) {}
  @Post('orders/:orderId/shipment')
  @HttpCode(200)
  @ExistingObligation()
  async register(
    @Param('orderId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.shipments.register(
      commandContext(this.input, req, res),
      this.input.uuid(id),
      this.input.body('RegisterDirectShipment', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Get('me/orders/:orderId/shipment')
  @ExistingObligation()
  read(@Param('orderId') id: string, @Req() req: AuthenticatedRequest) {
    return this.shipments.read(req.auth, this.input.uuid(id));
  }
  @Get('me/orders/:orderId/shipment/pickup-events')
  @ExistingObligation()
  history(@Param('orderId') id: string, @Req() req: AuthenticatedRequest) {
    return this.shipments.history(req.auth, this.input.uuid(id));
  }
  @Post('operations/simulator/pickup-events')
  @HttpCode(200)
  @Roles('TEST_OPERATOR')
  async pickup(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.shipments.emit(
      commandContext(this.input, req, res),
      this.input.body('SimulatedPickupEvent', body),
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
}
