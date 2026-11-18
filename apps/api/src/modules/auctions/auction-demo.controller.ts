import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.guard.js';
import type { Wire } from '../commands/domain-error.js';
import { DemoSkipPolicy } from './demo-skip.policy.js';

// Read-only capability probe for the visible demo Skip controls. It exposes
// no data and every command still rechecks the actor, the entity and the gate.
@Controller('demo')
export class AuctionDemoController {
  constructor(private readonly demo: DemoSkipPolicy) {}

  @Get('skip')
  @Roles('MEMBER')
  skip(): Wire['DemoSkipStatus'] {
    return { enabled: this.demo.enabled() };
  }
}
