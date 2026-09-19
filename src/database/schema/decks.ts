import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  DECK_BOARDS,
  DECK_FORMATS,
  DECK_VISIBILITIES,
  DEFAULT_DECK_FORMAT,
  DEFAULT_DECK_VISIBILITY,
} from '../../decks/deck.constants.js';
import { user } from './auth.js';

export const deckFormat = pgEnum('deck_format', DECK_FORMATS);
export const deckVisibility = pgEnum('deck_visibility', DECK_VISIBILITIES);
export const deckBoard = pgEnum('deck_board', DECK_BOARDS);

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    format: deckFormat('format').notNull().default(DEFAULT_DECK_FORMAT),
    visibility: deckVisibility('visibility').notNull().default(DEFAULT_DECK_VISIBILITY),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // La biblioteca siempre lista "los mazos de un usuario, los más recientes primero".
  (table) => [index('decks_owner_updated_idx').on(table.ownerId, table.updatedAt)],
);

/**
 * Cartas de un mazo. Guardamos el id de Scryfall de la impresión concreta: los datos de
 * la carta (nombre, coste, imagen…) se resuelven contra el catálogo, no se duplican aquí.
 */
export const deckEntries = pgTable(
  'deck_entries',
  {
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    cardId: text('card_id').notNull(),
    board: deckBoard('board').notNull().default('main'),
    quantity: integer('quantity').notNull().default(1),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [
    // La misma carta puede estar a la vez en el mazo principal y en el banquillo.
    primaryKey({ columns: [table.deckId, table.cardId, table.board] }),
    check('deck_entries_quantity_positive', sql`${table.quantity} > 0`),
  ],
);
