import { Module } from '@nestjs/common';
import { MongoService } from './mongo/mongo.service.js';

// MongoDB is the only store (ADR 0027). PostgreSQL remains only as the source
// of the one-time import (src/mongo-import-postgres.ts), never at runtime.
@Module({
  providers: [MongoService],
  exports: [MongoService],
})
export class DatabaseModule {}
