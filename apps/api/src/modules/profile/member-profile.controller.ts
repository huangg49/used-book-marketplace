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
import { ExistingObligation } from '../auth/obligations.decorator.js';
import { Roles } from '../auth/roles.guard.js';
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { MemberProfileService } from './member-profile.service.js';

@Controller('me/profile')
@Roles('MEMBER')
export class MemberProfileController {
  constructor(
    private readonly profile: MemberProfileService,
    private readonly input: ContractInput,
  ) {}
  @Get()
  @ExistingObligation()
  read(@Req() req: AuthenticatedRequest) {
    return this.profile.read(req.auth);
  }
  @Post()
  @HttpCode(200)
  @ExistingObligation()
  update(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.profile.update(
        commandContext(this.input, req, res),
        this.input.body('UpdateMemberProfile', body),
      ),
      res,
    );
  }
  @Post('avatar-uploads')
  @HttpCode(200)
  @ExistingObligation()
  createAvatar(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.profile.createAvatar(
        commandContext(this.input, req, res),
        this.input.body('CreateProfileAvatar', body),
        req.ip ?? 'unknown',
      ),
      res,
    );
  }
  @Put('avatar-uploads/:avatarId/content')
  @HttpCode(200)
  @ExistingObligation()
  uploadAvatar(
    @Param('avatarId') id: string,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.profile.uploadAvatar(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        req,
      ),
      res,
    );
  }
  @Get('avatar-uploads/:avatarId/read')
  @ExistingObligation()
  readAvatar(@Param('avatarId') id: string, @Req() req: AuthenticatedRequest) {
    return this.profile.readAvatar(req.auth, this.input.uuid(id));
  }
  @Post('avatar-uploads/:avatarId/discard')
  @HttpCode(200)
  @ExistingObligation()
  discardAvatar(
    @Param('avatarId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.profile.discardAvatar(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('VersionCommand', body),
      ),
      res,
    );
  }
  @Post('email-changes')
  @HttpCode(200)
  @ExistingObligation()
  requestEmail(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.profile.requestEmail(
        commandContext(this.input, req, res),
        this.input.body('RequestMemberEmailChange', body),
        req.ip ?? 'unknown',
      ),
      res,
    );
  }
  @Post('email-changes/confirm')
  @HttpCode(200)
  @ExistingObligation()
  confirmEmail(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.profile.confirmEmail(
        commandContext(this.input, req, res),
        this.input.body('ConfirmMemberEmailChange', body),
      ),
      res,
    );
  }
}
