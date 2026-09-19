import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type DatabaseEnv } from '../config/env.js';
import {
  connectPostgres,
  DATABASE,
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from './database.js';

/** Cierra las conexiones al apagar la aplicación (y al terminar cada test). */
@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ENV],
      // Solo usa DATABASE_URL: sirve igual para la API que para el worker.
      useFactory: (env: DatabaseEnv) => connectPostgres(env.DATABASE_URL),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => connection.db,
    },
    DatabaseShutdown,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
