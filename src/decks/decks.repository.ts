import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { cards, deckEntries, decks, user } from '../database/schema/index.js';
import type { DeckCardFact } from './deck-card-summary.js';
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

/** Cambio de cartas: fija la cantidad de una carta en una zona; 0 la quita. */
export type EntryChange = NewDeckEntry;

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
      for (const { cardId, board, quantity } of changes) {
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
            .values({ deckId, cardId, board, quantity })
            .onConflictDoUpdate({
              target: [deckEntries.deckId, deckEntries.cardId, deckEntries.board],
              set: { quantity },
            });
        }
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(deckEntries)
        .where(eq(deckEntries.deckId, deckId));
      if (total > MAX_DECK_ENTRIES) throw new TooManyEntriesError();

      await tx.update(decks).set({ updatedAt: new Date() }).where(eq(decks.id, deckId));
    });
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
