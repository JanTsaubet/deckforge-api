import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { WorkerEnv } from '../../config/env.js';
import { CardSyncScheduler } from './card-sync.scheduler.js';
import type { CardSyncService } from './card-sync.service.js';

const env: WorkerEnv = {
  DATABASE_URL: 'postgres://x',
  SCRYFALL_API_URL: 'https://api.scryfall.com',
  SCRYFALL_USER_AGENT: 'DeckForge/test',
  CARD_SYNC_CRON: '0 0 10 * * *',
};

describe('CardSyncScheduler', () => {
  let registry: SchedulerRegistry;
  let sync: { sync: ReturnType<typeof vi.fn>; hasEverSynced: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    registry = new SchedulerRegistry();
    sync = { sync: vi.fn().mockResolvedValue({ status: 'up-to-date' }), hasEverSynced: vi.fn() };
  });

  afterEach(() => {
    for (const job of registry.getCronJobs().values()) void job.stop();
  });

  const scheduler = () => new CardSyncScheduler(env, sync as unknown as CardSyncService, registry);

  it('programa la sincronización diaria con la hora de la configuración', async () => {
    sync.hasEverSynced.mockResolvedValue(true);

    await scheduler().onApplicationBootstrap();

    const job = registry.getCronJob('card-sync');
    expect(job.nextDate().toUTC().hour).toBe(10);
  });

  it('con el catálogo vacío importa nada más arrancar', async () => {
    sync.hasEverSynced.mockResolvedValue(false);

    await scheduler().onApplicationBootstrap();

    expect(sync.sync).toHaveBeenCalledTimes(1);
  });

  it('con el catálogo ya importado espera a la hora programada', async () => {
    sync.hasEverSynced.mockResolvedValue(true);

    await scheduler().onApplicationBootstrap();

    expect(sync.sync).not.toHaveBeenCalled();
  });

  it('un fallo de la sincronización no tumba el worker', async () => {
    sync.hasEverSynced.mockResolvedValue(false);
    sync.sync.mockRejectedValue(new Error('Scryfall caído'));
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    await expect(scheduler().onApplicationBootstrap()).resolves.toBeUndefined();
    // Deja que la sincronización lanzada en segundo plano termine (y falle).
    await new Promise((resolve) => setImmediate(resolve));

    expect(logError).toHaveBeenCalledWith(
      'La sincronización del catálogo ha fallado',
      expect.any(Error),
    );
    logError.mockRestore();
  });
});
