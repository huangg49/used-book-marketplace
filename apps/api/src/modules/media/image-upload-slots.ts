import { Injectable } from '@nestjs/common';
import { DomainError } from '../commands/domain-error.js';

// One shared bound for listing and packaging ingestion in this API process.
@Injectable()
export class ImageUploadSlots {
  private active = 0;
  claim() {
    if (this.active >= 2)
      throw new DomainError(
        429,
        'MediaQuotaExceeded',
        'Có nhiều ảnh đang tải. Vui lòng thử lại.',
      );
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}
