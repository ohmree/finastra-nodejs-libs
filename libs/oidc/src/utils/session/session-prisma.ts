import { PrismaSessionStore, IOptions as IPrismaSessionOptions } from '@quixo3/prisma-session-store';
import { INestApplication } from '@nestjs/common';
import session from 'express-session';
import passport from 'passport';
import { baseSession } from './base-session';

export const sessionPrisma = (app: INestApplication, name: string, options: IPrismaSessionOptions) => {
  app.use(
    session({
      name,
      ...baseSession,
      store: new PrismaSessionStore(options),
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
};
