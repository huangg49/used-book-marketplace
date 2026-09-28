import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { MediaService } from './media.service.js';

@Controller()
@Roles('MEMBER')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly input: ContractInput,
  ) {}
  @Post('listings/:listingId/media')
  @HttpCode(200)
  create(
    @Param('listingId') l: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.media.create(
        commandContext(this.input, req, res),
        this.input.uuid(l),
        this.input.body('CreateUpload', body),
      ),
      res,
    );
  }
  @Get('me/listings/:listingId/media')
  list(
    @Param('listingId') l: string,
    @Query() query: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.list(
      req.auth,
      this.input.uuid(l),
      this.input.query('listMyListingMedia', query),
    );
  }
  @Get('me/listings/:listingId/media/:mediaId')
  detail(
    @Param('listingId') l: string,
    @Param('mediaId') m: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.detail(req.auth, this.input.uuid(l), this.input.uuid(m));
  }
  @Get('listings/:listingId/media/:mediaId/upload-ticket')
  ticket(
    @Param('listingId') l: string,
    @Param('mediaId') m: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.ticket(req.auth, this.input.uuid(l), this.input.uuid(m));
  }
  @Put('listings/:listingId/media/:mediaId/content')
  @HttpCode(200)
  upload(
    @Param('listingId') l: string,
    @Param('mediaId') m: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.media.upload(
        commandContext(this.input, req, res),
        this.input.uuid(l),
        this.input.uuid(m),
        req,
      ),
      res,
    );
  }
  @Post('listings/:listingId/media/:mediaId/finalize')
  @HttpCode(200)
  finalize(
    @Param('listingId') l: string,
    @Param('mediaId') m: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.media.finalize(
        commandContext(this.input, req, res),
        this.input.uuid(l),
        this.input.uuid(m),
        this.input.body('VersionCommand', body),
      ),
      res,
    );
  }
  @Get('me/listings/:listingId/media/:mediaId/read')
  read(
    @Param('listingId') l: string,
    @Param('mediaId') m: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.media.read(req.auth, this.input.uuid(l), this.input.uuid(m));
  }
  @Get('operations/listings/:listingId/media/:mediaId/read')
  @Roles('STAFF', 'ADMIN')
  reviewRead(
    @Param('listingId') l: string,
    @Param('mediaId') m: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.media.read(
      req.auth,
      this.input.uuid(l),
      this.input.uuid(m),
      res.locals.requestId as string,
    );
  }
}
