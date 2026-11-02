import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../commands/domain-error.js';

/** Explicitly enabled local demo only. Does not release DirectOrderReleasePolicy. */
@Injectable()
export class LocalDemoCompletionPolicy {
  constructor(private readonly config: ConfigService) {}
  enabled(): boolean {
    const mode = this.config.get<string>('NODE_ENV') ?? 'development';
    if (this.config.get<string>('LOCAL_DEMO_COMPLETION_ENABLED') !== 'true' ||
      !['development', 'test'].includes(mode) || !this.config.get('PAYMENT_SIMULATOR_SECRET')) return false;
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(this.config.getOrThrow<string>('MONGODB_URL')).hostname);
    } catch { return false; }
  }
  allows(_id: string): boolean { return this.enabled(); }
  assertAllowed(id: string): void {
    if (!this.allows(id)) throw new DomainError(403, 'FORBIDDEN', 'Chế độ hoàn tất nhanh cho demo local chưa được bật.');
  }
}
