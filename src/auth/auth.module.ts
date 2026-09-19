import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.js';
import { createAuth } from './auth.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import { AUTH } from './auth.tokens.js';

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [DATABASE, ENV],
      useFactory: (db: Database, env: Env) => createAuth(db, env),
    },
    AuthGuard,
    OptionalAuthGuard,
  ],
  exports: [AUTH, AuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
