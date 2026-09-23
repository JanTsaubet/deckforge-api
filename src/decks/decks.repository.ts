import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { cards, deckEntries, decks, deckVersions, user } from '../database/schema/index.js';
import type { DeckCardFact } from './deck-card-summary.js';
import {
  mergeVersionChanges,
  versionChanges,
  VERSION_WINDOW_MINUTES,
  type DeckVersionChange,
} from './deck-versions.js';
import {
  MAX_DECK_ENTRIES,
  type DeckBoard,
  type DeckFormat,
  type DeckVisibility,
} from './deck.constants.js';

export interface DeckRow {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  visibility: DeckVisibility;
  folderId: string | null;
  tags: string[];
  cardCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeckEntryRow {
  cardId: string;
  board: DeckBoard;
  quantity: number;
  tags: string[];
}

export interface NewDeck {
  name: string;
  description: string | null;
  format: DeckFormat;
  visibility: DeckVisibility;
  folderId: string | null;
  tags: string[];
}

export type DeckChanges = Partial<NewDeck>;

export type NewDeckEntry = Pick<DeckEntryRow, 'cardId' | 'board' | 'quantity'>;

/**
 * Cambio de cartas: fija la cantidad de una carta en una zona (0 la quita) y, si trae
 * etiquetas, también sus etiquetas. Sin `tags` se conservan las que tuviera.
 */
export type EntryChange = NewDeckEntry & { tags?: string[] };

/** Una versión del historial tal como está guardada. */
export interface DeckVersionRow {
  id: string;
  changes: DeckVersionChange[];
  createdAt: Date;
}

/** Lo que hay dentro de una transacción de Drizzle: la base de datos, con la misma forma. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** El mazo pasaría del máximo de cartas distintas: los cambios no se aplican. */
export class TooManyEntriesError extends Error {
  constructor() {
    super(`Un mazo admite como mucho ${MAX_DECK_ENTRIES} cartas distintas`);
  }
}

/** Columnas de un mazo con el nombre visible de su dueño y el total de cartas. */
const deckColumns = {
  id: decks.id,
  ownerId: decks.ownerId,
  ownerUsername: sql<string>`coalesce(${user.username}, ${user.name})`,
  name: decks.name,
  description: decks.description,
  format: decks.format,
  visibility: decks.visibility,
  folderId: decks.folderId,
  tags: decks.tags,
  cardCount: sql<number>`coalesce(sum(${deckEntries.quantity}), 0)::int`,
  createdAt: decks.createdAt,
  updatedAt: decks.updatedAt,
};

/** Acceso a los datos de mazos. Solo SQL: las reglas de negocio viven en `DecksService`. */
@Injectable()
export class DecksRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listByOwner(ownerId: string): Promise<DeckRow[]> {
    return this.db
      .select(deckColumns)
      .from(decks)
      .innerJoin(user, eq(user.id, decks.ownerId))
      .leftJoin(deckEntries, eq(deckEntries.deckId, decks.id))
      .where(eq(decks.ownerId, ownerId))
      .groupBy(decks.id, user.id)
      .orderBy(desc(decks.updatedAt));
  }

  async findById(id: string): Promise<DeckRow | undefined> {
    const [row] = await this.db
      .select(deckColumns)
      .from(decks)
      .innerJoin(user, eq(user.id, decks.ownerId))
      .leftJoin(deckEntries, eq(deckEntries.deckId, decks.id))
      .where(eq(decks.id, id))
      .groupBy(decks.id, user.id);
    return row;
  }

  /** Solo el dueño: suficiente para comprobar permisos sin traer el mazo entero. */
  async findOwnerId(id: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ ownerId: decks.ownerId })
      .from(decks)
      .where(eq(decks.id, id));
    return row?.ownerId;
  }

  findEntries(deckId: string): Promise<DeckEntryRow[]> {
    return this.db
      .select({
        cardId: deckEntries.cardId,
        board: deckEntries.board,
        quantity: deckEntries.quantity,
        tags: deckEntries.tags,
      })
      .from(deckEntries)
      .where(eq(deckEntries.deckId, deckId))
      .orderBy(asc(deckEntries.board), asc(deckEntries.cardId));
  }

  /**
   * Datos de catálogo de las cartas de comandante y mazo principal de varios mazos, en una
   * sola consulta (no una por mazo). Las cartas que el catálogo aún no conoce no aparecen.
   */
  async findCardFacts(deckIds: string[]): Promise<DeckCardFact[]> {
    if (deckIds.length === 0) return [];
    return this.db
      .select({
        deckId: deckEntries.deckId,
        board: deckEntries.board,
        quantity: deckEntries.quantity,
        name: cards.name,
        typeLine: cards.typeLine,
        manaValue: cards.manaValue,
        colorIdentity: cards.colorIdentity,
        imageArtCrop: cards.imageArtCrop,
      })
      .from(deckEntries)
      .innerJoin(cards, eq(cards.id, deckEntries.cardId))
      .where(
        and(
          inArray(deckEntries.deckId, deckIds),
          inArray(deckEntries.board, ['commander', 'main']),
        ),
      );
  }

  /** Crea el mazo con sus cartas iniciales en una transacción: o todo o nada. */
  async create(ownerId: string, deck: NewDeck, entries: NewDeckEntry[] = []): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(decks)
        .values({ ownerId, ...deck })
        .returning({ id: decks.id });

      if (entries.length > 0) {
        await tx.insert(deckEntries).values(entries.map((entry) => ({ ...entry, deckId: row.id })));
      }
      return row.id;
    });
  }

  async update(id: string, changes: DeckChanges): Promise<void> {
    // Drizzle ignora las claves con valor undefined: solo se tocan los campos enviados.
    await this.db
      .update(decks)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(decks.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(decks).where(eq(decks.id, id));
  }

  /**
   * Aplica cambios de cartas en una transacción: o todos o ninguno. Fijar una cantidad (y no
   * sumar o restar) hace que repetir el mismo cambio no tenga efectos, así que un reintento
   * tras un fallo de red no duplica cartas.
   */
  async applyEntryChanges(deckId: string, changes: EntryChange[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Cómo estaba el mazo antes, para anotar en el historial de dónde viene cada carta.
      const before = await tx
        .select({
          cardId: deckEntries.cardId,
          board: deckEntries.board,
          quantity: deckEntries.quantity,
        })
        .from(deckEntries)
        .where(eq(deckEntries.deckId, deckId));

      for (const { cardId, board, quantity, tags } of changes) {
        const entry = and(
          eq(deckEntries.deckId, deckId),
          eq(deckEntries.cardId, cardId),
          eq(deckEntries.board, board),
        );
        if (quantity === 0) {
          await tx.delete(deckEntries).where(entry);
        } else {
          await tx
            .insert(deckEntries)
            .values({ deckId, cardId, board, quantity, tags: tags ?? [] })
            .onConflictDoUpdate({
              target: [deckEntries.deckId, deckEntries.cardId, deckEntries.board],
              // Sin etiquetas en el cambio, las que ya tuviera la carta no se tocan.
              set: tags === undefined ? { quantity } : { quantity, tags },
            });
        }
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(deckEntries)
        .where(eq(deckEntries.deckId, deckId));
      if (total > MAX_DECK_ENTRIES) throw new TooManyEntriesError();

      await recordVersion(tx, deckId, versionChanges(before, changes));
      await tx.update(decks).set({ updatedAt: new Date() }).where(eq(decks.id, deckId));
    });
  }

  /** Historial del mazo, la versión más reciente primero. */
  listVersions(deckId: string, limit: number): Promise<DeckVersionRow[]> {
    return this.db
      .select({
        id: deckVersions.id,
        changes: deckVersions.changes,
        createdAt: deckVersions.createdAt,
      })
      .from(deckVersions)
      .where(eq(deckVersions.deckId, deckId))
      .orderBy(desc(deckVersions.createdAt))
      .limit(limit);
  }

  /**
   * Copia un mazo, con sus cartas, para `ownerId`. Va en una transacción: o se copia todo
   * o nada. La copia empieza siempre privada, aunque el original fuese público.
   */
  async duplicate(
    sourceId: string,
    ownerId: string,
    copy: Pick<NewDeck, 'name' | 'folderId'>,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [source] = await tx
        .select({ description: decks.description, format: decks.format, tags: decks.tags })
        .from(decks)
        .where(eq(decks.id, sourceId));

      const [created] = await tx
        .insert(decks)
        .values({
          ownerId,
          ...copy,
          description: source.description,
          format: source.format,
          tags: source.tags,
          visibility: 'private',
        })
        .returning({ id: decks.id });

      const entries = await tx.select().from(deckEntries).where(eq(deckEntries.deckId, sourceId));
      if (entries.length > 0) {
        await tx
          .insert(deckEntries)
          .values(entries.map((entry) => ({ ...entry, deckId: created.id })));
      }

      return created.id;
    });
  }
}

/**
 * Anota los cambios en el historial. Si la última versión es reciente, los cambios se suman a
 * ella en vez de crear otra: así una tanda de retoques seguidos es una sola entrada, y no una
 * por cada vez que el guardado automático manda cambios.
 *
 * Si al sumarlos la versión se queda sin nada (se añadió una carta y se volvió a quitar), se
 * borra: el mazo está como estaba y en el historial no debería quedar rastro.
 */
async function recordVersion(
  tx: Transaction,
  deckId: string,
  changes: DeckVersionChange[],
): Promise<void> {
  if (changes.length === 0) return;

  const openedAfter = new Date(Date.now() - VERSION_WINDOW_MINUTES * 60_000);
  const [latest] = await tx
    .select({ id: deckVersions.id, changes: deckVersions.changes })
    .from(deckVersions)
    .where(and(eq(deckVersions.deckId, deckId), gte(deckVersions.createdAt, openedAfter)))
    .orderBy(desc(deckVersions.createdAt))
    .limit(1);

  if (!latest) {
    await tx.insert(deckVersions).values({ deckId, changes });
    return;
  }

  const merged = mergeVersionChanges(latest.changes, changes);
  if (merged.length === 0) {
    await tx.delete(deckVersions).where(eq(deckVersions.id, latest.id));
  } else {
    await tx.update(deckVersions).set({ changes: merged }).where(eq(deckVersions.id, latest.id));
  }
}
