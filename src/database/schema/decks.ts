import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  DECK_BOARDS,
  DECK_FORMATS,
  DECK_VISIBILITIES,
  DEFAULT_DECK_FORMAT,
  DEFAULT_DECK_VISIBILITY,
} from '../../decks/deck.constants.js';
import type { DeckVersionChange } from '../../decks/deck-versions.js';
import { user } from './auth.js';

export const deckFormat = pgEnum('deck_format', DECK_FORMATS);
export const deckVisibility = pgEnum('deck_visibility', DECK_VISIBILITIES);
export const deckBoard = pgEnum('deck_board', DECK_BOARDS);

/**
 * Carpetas de la biblioteca. Son planas (sin subcarpetas) y el nombre no se repite dentro de
 * la biblioteca de un mismo usuario, sin distinguir mayúsculas: "cEDH" y "cedh" serían dos
 * carpetas indistinguibles en la lista.
 */
export const deckFolders = pgTable(
  'deck_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('deck_folders_owner_name_unique').on(table.ownerId, sql`lower(${table.name})`),
  ],
);

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
    /** Al borrar la carpeta, sus mazos no se borran: vuelven a "sin carpeta". */
    folderId: uuid('folder_id').references(() => deckFolders.id, { onDelete: 'set null' }),
    /** Etiquetas del mazo ("cEDH", "presupuesto"…), en minúsculas y sin repetir. */
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
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

/**
 * Historial del mazo. Cada versión guarda **lo que cambió** —qué cartas y de cuántas copias a
 * cuántas—, no una copia del mazo entero: el historial de un mazo muy retocado pesa lo que
 * pesan sus cambios, y es justo lo que se quiere enseñar.
 *
 * Los cambios seguidos se agrupan en la misma versión (ver `VERSION_WINDOW_MINUTES`), porque
 * el guardado automático manda cambios cada pocos segundos.
 */
export const deckVersions = pgTable(
  'deck_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    changes: jsonb('changes').$type<DeckVersionChange[]>().notNull(),
    /** Cuándo empezaron los cambios de esta versión. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // El historial siempre se lee igual: las versiones de un mazo, la más reciente primero.
  (table) => [index('deck_versions_deck_created_idx').on(table.deckId, table.createdAt)],
);
