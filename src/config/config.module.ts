import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from './env.js';

/** Expone la configuración validada a toda la aplicación. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
