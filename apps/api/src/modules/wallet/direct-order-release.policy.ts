import { Injectable } from '@nestjs/common';
import { invalidState } from '../commands/domain-error.js';

// READINESS / ADR0064: reopening carrier delivery / settlement requires an implementation
// with Buyer claims and settlement interlocks. No request or env flag enables it.
// Owner-approved Buyer receipt acknowledgement is separate (ADR0052 amendment 03/11).
@Injectable()
export class DirectOrderReleasePolicy {
  isReleased(): boolean {
    return false;
  }

  assertReleased(): void {
    if (!this.isReleased())
      throw invalidState(
        'Luồng xác nhận giao từ vận chuyển và quyết toán giao trực tiếp chưa được mở. Tiền và sách tiếp tục được giữ; chưa đủ quy trình bảo vệ người mua.',
      );
  }
}
