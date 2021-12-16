import { createMock } from '@golevelup/nestjs-testing';
import { INestApplication } from '@nestjs/common';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { sessionPrisma } from './session-prisma';

jest.mock('express-session');

describe('sessionPrisma', () => {
  it('should be defined', () => {
    const app = createMock<INestApplication>();
    const spy = jest.spyOn(app, 'use').mockReturnThis();
    jest.spyOn(PrismaSessionStore).mockReturnThis();
    sessionPrisma(app, 'test-session');
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
