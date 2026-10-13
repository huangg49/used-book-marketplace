import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../../common/canonical-json.js';
import { DomainError, type Wire } from '../commands/domain-error.js';

@Injectable()
export class CarrierSimulator {
  constructor(private readonly config: ConfigService) {}
  sign(event: Wire['SimulatedPickupEvent']) {
    const secret = this.config.get<string>('PAYMENT_SIMULATOR_SECRET');
    if (!secret)
      throw new DomainError(
        503,
        'UNAVAILABLE',
        'Bộ vận chuyển mô phỏng chưa được bật.',
      );
    // Separate protocol domain, even though local simulators share one configured secret.
    return createHmac('sha256', secret)
      .update('LatLaiCarrierPickup-v1\n' + canonicalJson(event))
      .digest('hex');
  }
  signDelivery(event: Wire['SimulatedDeliveryEvent']) {
    const secret = this.config.get<string>('PAYMENT_SIMULATOR_SECRET');
    if (!secret)
      throw new DomainError(503, 'UNAVAILABLE', 'Bộ vận chuyển mô phỏng chưa được bật.');
    return createHmac('sha256', secret)
      .update('LatLaiCarrierDelivery-v1\n' + canonicalJson(event))
      .digest('hex');
  }
  verify(event: Wire['SimulatedPickupEvent'], signature: string) {
    const expected = Buffer.from(this.sign(event), 'hex');
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(expected, Buffer.from(signature, 'hex'))
    )
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Sự kiện vận chuyển chưa được xác thực.',
      );
  }
  verifyDelivery(event: Wire['SimulatedDeliveryEvent'], signature: string) {
    const expected = Buffer.from(this.signDelivery(event), 'hex');
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(expected, Buffer.from(signature, 'hex'))
    )
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Sự kiện giao hàng chưa được xác thực.',
      );
  }
}
