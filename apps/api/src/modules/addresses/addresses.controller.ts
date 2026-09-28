import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext } from '../commands/command-http.js';
import { AddressesService } from './addresses.service.js';
@Controller()
@Roles('MEMBER')
export class AddressesController {
  constructor(
    private readonly service: AddressesService,
    private readonly input: ContractInput,
  ) {}
  @Get('service-areas') directory(@Req() req: AuthenticatedRequest) {
    return this.service.directory(req.auth);
  }
  @Get('me/addresses') read(@Req() req: AuthenticatedRequest) {
    return this.service.read(req.auth);
  }
  private async command(
    action: 'create' | 'update' | 'default' | 'archive',
    id: string | null,
    body: unknown,
    req: AuthenticatedRequest,
    res: Response,
  ) {
    const parsed =
      action === 'create' || action === 'update'
        ? this.input.body('SaveAddress', body)
        : this.input.body('AddressBookCommand', body);
    const result = await this.service.mutate(
      commandContext(this.input, req, res),
      action,
      id ? this.input.uuid(id) : null,
      parsed,
    );
    res.setHeader('Idempotency-Replayed', String(result.replayed));
    return result.receipt;
  }
  @Post('me/addresses')
  @HttpCode(200)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.command('create', null, body, req, res);
  }
  @Put('me/addresses/:addressId')
  update(
    @Param('addressId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.command('update', id, body, req, res);
  }
  @Post('me/addresses/:addressId/default')
  @HttpCode(200)
  default(
    @Param('addressId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.command('default', id, body, req, res);
  }
  @Post('me/addresses/:addressId/archive')
  @HttpCode(200)
  archive(
    @Param('addressId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.command('archive', id, body, req, res);
  }
}
