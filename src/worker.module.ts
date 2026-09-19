import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CardSyncModule } from './cards/sync/card-sync.module.js';
import { CardSyncScheduler } from './cards/sync/card-sync.scheduler.js';
import { ENV, loadWorkerEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';

/** Configuración del worker: solo las variables que usa (ver `loadWorkerEnv`). */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadWorkerEnv() }],
  exports: [ENV],
})
class WorkerConfigModule {}

/**
 * El worker: un proceso aparte de la API, sin servidor HTTP, para las tareas pesadas y
 * programadas. Así una importación de 100 000 cartas no le quita CPU a las peticiones.
 */
@Module({
  imports: [WorkerConfigModule, DatabaseModule, ScheduleModule.forRoot(), CardSyncModule],
  providers: [CardSyncScheduler],
})
export class WorkerModule {}

/** Lo mismo sin el programador: para lanzar una sincronización a mano y terminar. */
@Module({
  imports: [WorkerConfigModule, DatabaseModule, CardSyncModule],
})
export class CardSyncCommandModule {}
