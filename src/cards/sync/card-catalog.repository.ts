import { Inject, Injectable } from '@nestjs/common';
import { eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.js';
import { cards, cardSyncState } from '../../database/schema/index.js';
import type { CardRow } from './card-mapper.js';

export type CardSyncStateRow = typeof cardSyncState.$inferSelect;

/**
 * En un upsert, qué hacer si la carta ya existe: sobrescribir todas las columnas (salvo el
 * id) con los valores nuevos (`excluded` es la fila que se intentaba insertar).
 */
const OVERWRITE_ALL: Record<string, SQL> = Object.fromEntries(
  Object.entries(getTableColumns(cards))
    .filter(([key]) => key !== 'id')
    .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
);

/** Escritura del catálogo local de cartas. Solo SQL: las reglas viven en `CardSyncService`. */
@Injectable()
export class CardCatalogRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Inserta las cartas nuevas y actualiza las que ya existían (precios, legalidades…). */
  async upsert(rows: CardRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(cards).values(rows).onConflictDoUpdate({
      target: cards.id,
      set: OVERWRITE_ALL,
    });
  }

  async getState(source: string): Promise<CardSyncStateRow | undefined> {
    const [row] = await this.db
      .select()
      .from(cardSyncState)
      .where(eq(cardSyncState.source, source));
    return row;
  }

  async saveState(state: CardSyncStateRow): Promise<void> {
    await this.db
      .insert(cardSyncState)
      .values(state)
      .onConflictDoUpdate({ target: cardSyncState.source, set: state });
  }
}
