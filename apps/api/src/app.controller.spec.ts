import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseService } from './database/database.service.js';
import { MongoService } from './database/mongo/mongo.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: DatabaseService, useValue: {} },
        { provide: MongoService, useValue: {} },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('returns service health', () => {
      expect(appController.getHealth()).toMatchObject({
        status: 'ok',
        service: 'used-book-api',
      });
    });
  });
});
