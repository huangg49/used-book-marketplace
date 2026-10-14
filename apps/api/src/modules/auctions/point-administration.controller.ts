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
import { commandContext, commandResponse } from '../commands/command-http.js';
import { ContractInput } from '../commands/contract-input.service.js';
import { PointAdministrationService } from './point-administration.service.js';
import { PointIncidentsService } from './point-incidents.service.js';

// FR-H04: ADMIN manages points and Staff assignments; STAFF reads their own
// current assignments. The service rechecks role and status in the command.
@Controller()
export class PointAdministrationController {
  constructor(
    private readonly points: PointAdministrationService,
    private readonly incidents: PointIncidentsService,
    private readonly input: ContractInput,
  ) {}

  @Get('operations/points')
  @Roles('ADMIN')
  list(@Req() req: AuthenticatedRequest) {
    return this.points.list(req.auth);
  }
  @Post('operations/points')
  @Roles('ADMIN')
  @HttpCode(200)
  create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.points.create(
        commandContext(this.input, req, res),
        this.input.body('CreateHandoverPoint', body),
      ),
      res,
    );
  }
  @Post('operations/points/:pointId')
  @Roles('ADMIN')
  @HttpCode(200)
  update(
    @Param('pointId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.points.update(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('UpdateHandoverPoint', body),
      ),
      res,
    );
  }
  @Post('operations/points/:pointId/assignments')
  @Roles('ADMIN')
  @HttpCode(200)
  assign(
    @Param('pointId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.points.assign(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('AssignPointStaff', body),
      ),
      res,
    );
  }
  @Post('operations/points/:pointId/assignments/:assignmentId/end')
  @Roles('ADMIN')
  @HttpCode(200)
  end(
    @Param('pointId') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.points.endAssignment(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.uuid(assignmentId),
        this.input.body('EndPointAssignment', body),
      ),
      res,
    );
  }
  // N4-13: incidents and the simulated fund (FR-T04, POL-42).
  @Get('operations/incidents')
  @Roles('STAFF', 'ADMIN')
  listIncidents(@Req() req: AuthenticatedRequest) {
    return this.incidents.list(req.auth);
  }
  @Post('operations/incidents')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(200)
  openIncident(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.incidents.open(
        commandContext(this.input, req, res),
        this.input.body('OpenPointIncident', body),
      ),
      res,
    );
  }
  @Post('operations/incidents/:incidentId/decide')
  @Roles('ADMIN')
  @HttpCode(200)
  decideIncident(
    @Param('incidentId') id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return commandResponse(
      this.incidents.decide(
        commandContext(this.input, req, res),
        this.input.uuid(id),
        this.input.body('DecidePointIncident', body),
      ),
      res,
    );
  }
  @Get('operations/incident-fund')
  @Roles('ADMIN')
  incidentFund(@Req() req: AuthenticatedRequest) {
    return this.incidents.fund(req.auth);
  }
  @Get('me/point-assignments')
  @Roles('STAFF')
  mine(@Req() req: AuthenticatedRequest) {
    return this.points.myAssignments(req.auth);
  }
}
