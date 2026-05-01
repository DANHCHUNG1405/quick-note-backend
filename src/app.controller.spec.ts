import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('me', () => {
    it('should return the current user payload', () => {
      const user = {
        userId: 'user-1',
        email: 'user@example.com',
      };

      expect(appController.me(user)).toEqual(user);
    });
  });
});
