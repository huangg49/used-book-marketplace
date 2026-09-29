import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { MongoService } from './mongo/mongo.service.js';

// Migration lane: MongoService is the target store. DatabaseService (Prisma)
// remains only for modules not yet ported (docs/refactor/MONGODB_PLAN.md).
@Module({
  providers: [DatabaseService, MongoService],
  exports: [DatabaseService, MongoService],
})
export class DatabaseModule {}
