import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../commands/domain-error.js';

/** Owner-selected local Orders only. Does not release DirectOrderReleasePolicy. */
@Injectable()
export class LocalDemoCompletionPolicy {
  constructor(private readonly config: ConfigService) {}
  ids(): string[] {
    const mode = this.config.get<string>('NODE_ENV') ?? 'development';
    if (!['development', 'test'].includes(mode) || !this.config.get('PAYMENT_SIMULATOR_SECRET')) return [];
    try {
      const host = new URL(this.config.getOrThrow<string>('MONGODB_URL')).hostname;
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return [];
    } catch { return []; }
    return (this.config.get<string>('LOCAL_DEMO_DIRECT_ORDER_IDS') ?? '').split(',')
      .map(id => id.trim().toLowerCase()).filter(id => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id));
  }
  allows(id: string): boolean { return this.ids().includes(id.toLowerCase()); }
  assertAllowed(id: string): void {
    if (!this.allows(id)) throw new DomainError(403, 'FORBIDDEN', 'Đơn này chưa được cấp quyền hoàn tất nhanh cho demo local.');
  }
}
