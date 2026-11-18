import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../commands/domain-error.js';

/**
 * Explicitly enabled local demo only. Timing shortcuts and the demo delivery
 * command use the standard transitions, so ledger and state checks still apply.
 */
@Injectable()
export class DemoSkipPolicy {
  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    const mode = this.config.get<string>('NODE_ENV') ?? 'development';
    if (
      this.config.get<string>('DEMO_SKIP_ENABLED') !== 'true' ||
      !['development', 'test'].includes(mode) ||
      !this.config.get<string>('PAYMENT_SIMULATOR_SECRET')
    )
      return false;
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(this.config.getOrThrow<string>('MONGODB_URL')).hostname,
      );
    } catch {
      return false;
    }
  }

  assertEnabled(): void {
    if (!this.enabled())
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Chế độ bỏ qua chờ cho demo local chưa được bật.',
      );
  }
}
