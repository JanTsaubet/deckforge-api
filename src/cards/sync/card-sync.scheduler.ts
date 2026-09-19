import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ENV, type WorkerEnv } from '../../config/env.js';
import { CardSyncService } from './card-sync.service.js';

const JOB_NAME = 'card-sync';

/**
 * Programa la sincronización diaria del catálogo. Se registra al arrancar (y no con el
 * decorador `@Cron`) porque la hora viene de la configuración, `CARD_SYNC_CRON`.
 *
 * Si el catálogo nunca se ha importado, lo hace también nada más arrancar: una base de datos
 * recién creada no tiene que esperar hasta el día siguiente.
 */
@Injectable()
export class CardSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(CardSyncScheduler.name);

  constructor(
    @Inject(ENV) private readonly env: WorkerEnv,
    private readonly sync: CardSyncService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const job = CronJob.from({
      cronTime: this.env.CARD_SYNC_CRON,
      timeZone: 'UTC',
      onTick: () => void this.runSafely(),
    });
    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `Sincronización programada (${this.env.CARD_SYNC_CRON}, UTC). Próxima: ${job.nextDate().toISO()}`,
    );

    if (!(await this.sync.hasEverSynced())) {
      this.logger.log('El catálogo está vacío: se importa ahora.');
      void this.runSafely();
    }
  }

  /** Un fallo (Scryfall caído, sin red…) se registra y se reintenta en la próxima ejecución. */
  private async runSafely(): Promise<void> {
    try {
      await this.sync.sync();
    } catch (error) {
      this.logger.error('La sincronización del catálogo ha fallado', error);
    }
  }
}
