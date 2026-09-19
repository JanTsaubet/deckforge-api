import { Inject, Injectable, Logger } from '@nestjs/common';
import { CARD_BULK_SOURCE, type CardBulkSource } from './card-bulk-source.js';
import { CardCatalogRepository } from './card-catalog.repository.js';
import { toCardRow, type CardRow } from './card-mapper.js';

/** Identificador de esta sincronización en `card_sync_state`. */
export const CARD_SYNC_SOURCE = 'default_cards';

/** Cartas por sentencia: ~500 filas × 28 columnas queda lejos del límite de parámetros de Postgres. */
const BATCH_SIZE = 500;

/** Cada cuántas cartas se escribe en el log cómo va. */
const PROGRESS_EVERY = 20_000;

export type CardSyncResult =
  | { status: 'up-to-date'; bulkUpdatedAt: Date }
  | { status: 'synced'; bulkUpdatedAt: Date; cards: number; skipped: number; durationMs: number };

export interface CardSyncOptions {
  /** Importar aunque el fichero de Scryfall sea el mismo de la última vez. */
  force?: boolean;
}

/**
 * Copia el catálogo de Scryfall a la base de datos local.
 *
 * - **Solo si hay novedades:** compara la fecha del fichero de Scryfall con la de la última
 *   importación, y si es la misma no descarga nada.
 * - **Sin transacción gigante:** las cartas se escriben por lotes con upsert, que se puede
 *   repetir sin efectos. Si el proceso se corta a medias, el estado no se guarda y la
 *   siguiente ejecución vuelve a importar el fichero entero.
 * - **Una sola a la vez:** si se pide otra mientras corre, recibe el resultado de la que ya
 *   está en marcha.
 */
@Injectable()
export class CardSyncService {
  private readonly logger = new Logger(CardSyncService.name);
  private running?: Promise<CardSyncResult>;

  constructor(
    @Inject(CARD_BULK_SOURCE) private readonly source: CardBulkSource,
    private readonly catalog: CardCatalogRepository,
  ) {}

  sync(options: CardSyncOptions = {}): Promise<CardSyncResult> {
    this.running ??= this.run(options).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /** ¿Se ha importado el catálogo alguna vez? */
  async hasEverSynced(): Promise<boolean> {
    return (await this.catalog.getState(CARD_SYNC_SOURCE)) !== undefined;
  }

  private async run({ force = false }: CardSyncOptions): Promise<CardSyncResult> {
    const startedAt = Date.now();
    const latest = await this.source.getLatest();
    const previous = await this.catalog.getState(CARD_SYNC_SOURCE);

    if (!force && previous && previous.bulkUpdatedAt >= latest.updatedAt) {
      this.logger.log(`Catálogo al día (fichero de ${latest.updatedAt.toISOString()})`);
      return { status: 'up-to-date', bulkUpdatedAt: latest.updatedAt };
    }

    this.logger.log(`Importando el catálogo de Scryfall (${latest.updatedAt.toISOString()})…`);
    const syncedAt = new Date();
    let batch: CardRow[] = [];
    let imported = 0;
    let skipped = 0;

    for await (const card of this.source.readCards(latest)) {
      const row = toCardRow(card, syncedAt);
      if (!row) {
        skipped += 1;
        continue;
      }
      batch.push(row);
      if (batch.length === BATCH_SIZE) {
        await this.catalog.upsert(batch);
        imported += batch.length;
        batch = [];
        if (imported % PROGRESS_EVERY === 0) this.logger.log(`${imported} cartas…`);
      }
    }
    await this.catalog.upsert(batch);
    imported += batch.length;

    await this.catalog.saveState({
      source: CARD_SYNC_SOURCE,
      bulkUpdatedAt: latest.updatedAt,
      syncedAt,
      cardCount: imported,
    });

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `Catálogo importado: ${imported} cartas (${skipped} omitidas) en ${Math.round(durationMs / 1000)} s`,
    );
    return {
      status: 'synced',
      bulkUpdatedAt: latest.updatedAt,
      cards: imported,
      skipped,
      durationMs,
    };
  }
}
