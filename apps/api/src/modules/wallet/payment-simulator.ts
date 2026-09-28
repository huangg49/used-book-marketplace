import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../commands/command.service.js';
import { DomainError, type Wire } from '../commands/domain-error.js';

// No network callback is exposed. The operator adapter uses this verifier too;
// an eventual provider adapter must still pass an authenticated envelope here.
@Injectable()
export class PaymentSimulator {
  constructor(private readonly config: ConfigService) {}
  enabled() {
    return !!this.config.get<string>('PAYMENT_SIMULATOR_SECRET');
  }
  private secret() {
    if (!this.enabled())
      throw new DomainError(
        503,
        'UNAVAILABLE',
        'Bộ nạp tiền mô phỏng chưa được bật.',
      );
    return this.config.getOrThrow<string>('PAYMENT_SIMULATOR_SECRET');
  }
  sign(event: Wire['SimulatedTopupEvent']) {
    return createHmac('sha256', this.secret())
      .update('LatLaiSimulator-v1\n' + canonicalJson(event))
      .digest('hex');
  }
  verify(event: Wire['SimulatedTopupEvent'], signature: string) {
    const expected = Buffer.from(this.sign(event), 'hex');
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(expected, Buffer.from(signature, 'hex'))
    )
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Sự kiện mô phỏng không được xác thực.',
      );
  }
}
