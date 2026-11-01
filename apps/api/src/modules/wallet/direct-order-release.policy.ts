import { Injectable } from '@nestjs/common';
import { invalidState } from '../commands/domain-error.js';

// READINESS / ADR0061: reopening completion requires a reviewed implementation
// with Buyer claims and settlement interlocks. No request or env flag enables it.
@Injectable()
export class DirectOrderReleasePolicy {
  isReleased(): boolean {
    return false;
  }

  assertReleased(): void {
    if (!this.isReleased())
      throw invalidState(
        'Luồng nhận sách và quyết toán giao trực tiếp chưa được mở. Tiền và sách tiếp tục được giữ; chưa đủ quy trình bảo vệ người mua.',
      );
  }
}
