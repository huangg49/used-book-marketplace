import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok' as const,
      service: 'used-book-api' as const,
      timestamp: new Date().toISOString(),
    };
  }
}
