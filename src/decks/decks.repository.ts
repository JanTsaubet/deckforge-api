import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { deckEntries, decks, user } from '../database/schema/index.js';
import type { DeckBoard, DeckFormat, DeckVisibility } from './deck.constants.js';

export interface DeckRow {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  visibility: DeckVisibility;
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
}

export type DeckChanges = Partial<NewDeck>;

/** Columnas de un mazo con el nombre visible de su dueño y el total de cartas. */
const deckColumns = {
  id: decks.id,
  ownerId: decks.ownerId,
  ownerUsername: sql<string>`coalesce(${user.username}, ${user.name})`,
  name: decks.name,
  description: decks.description,
  format: decks.format,
  visibility: decks.visibility,
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

  async create(ownerId: string, deck: NewDeck): Promise<string> {
    const [row] = await this.db
      .insert(decks)
      .values({ ownerId, ...deck })
      .returning({ id: decks.id });
    return row.id;
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
   * Copia un mazo, con sus cartas, para `ownerId`. Va en una transacción: o se copia todo
   * o nada. La copia empieza siempre privada, aunque el original fuese público.
   */
  async duplicate(sourceId: string, ownerId: string, name: string): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [source] = await tx
        .select({ description: decks.description, format: decks.format })
        .from(decks)
        .where(eq(decks.id, sourceId));

      const [copy] = await tx
        .insert(decks)
        .values({
          ownerId,
          name,
          description: source.description,
          format: source.format,
          visibility: 'private',
        })
        .returning({ id: decks.id });

      const entries = await tx.select().from(deckEntries).where(eq(deckEntries.deckId, sourceId));
      if (entries.length > 0) {
        await tx
          .insert(deckEntries)
          .values(entries.map((entry) => ({ ...entry, deckId: copy.id })));
      }

      return copy.id;
    });
  }
}
