import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Copia local del catálogo de Scryfall: una fila por impresión en inglés (_bulk data_
 * `default_cards`). Solo las columnas que usa DeckForge; el resto del objeto de Scryfall no
 * se guarda.
 *
 * `id` es texto, como `deck_entries.card_id`, para poder unir las dos tablas sin conversiones.
 * No hay clave foránea entre ellas a propósito: un mazo puede tener una carta recién salida
 * que el catálogo local aún no conoce hasta la siguiente sincronización.
 */
export const cards = pgTable(
  'cards',
  {
    /** Id de Scryfall de la impresión. */
    id: text('id').primaryKey(),
    /** Id de la carta "abstracta". Las cartas reversibles no lo traen en la raíz. */
    oracleId: text('oracle_id'),
    name: text('name').notNull(),
    /** Casi siempre `en`; algunas cartas solo se imprimieron en otro idioma. */
    lang: text('lang').notNull(),
    setCode: text('set_code').notNull(),
    setName: text('set_name').notNull(),
    /** Tipo de colección (`core`, `expansion`, `commander`…): para elegir la impresión por defecto. */
    setType: text('set_type').notNull().default('expansion'),
    /** Impresión promocional (prerelease, premio de torneo…). */
    promo: boolean('promo').notNull().default(false),
    collectorNumber: text('collector_number').notNull(),
    releasedAt: date('released_at'),
    layout: text('layout').notNull(),
    /** En cartas de varias caras, el de la cara frontal. */
    manaCost: text('mana_cost'),
    manaValue: real('mana_value').notNull(),
    typeLine: text('type_line').notNull(),
    oracleText: text('oracle_text'),
    colors: text('colors').array().notNull(),
    colorIdentity: text('color_identity').array().notNull(),
    rarity: text('rarity').notNull(),
    imageSmall: text('image_small'),
    imageNormal: text('image_normal'),
    imageArtCrop: text('image_art_crop'),
    priceEur: numeric('price_eur', { precision: 10, scale: 2 }),
    priceUsd: numeric('price_usd', { precision: 10, scale: 2 }),
    legalities: jsonb('legalities').$type<Record<string, string>>().notNull(),
    /** Popularidad en EDHREC (1 = la más jugada). Para las recomendaciones. */
    edhrecRank: integer('edhrec_rank'),
    /** En la lista oficial de "Game Changers" de Commander (cuenta para el bracket). */
    gameChanger: boolean('game_changer').notNull().default(false),
    /** Solo existe en formato digital (Arena, MTGO). */
    digital: boolean('digital').notNull().default(false),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cards_oracle_id_idx').on(table.oracleId),
    // Búsquedas por nombre sin distinguir mayúsculas (importación, autocompletado).
    index('cards_name_lower_idx').on(sql`lower(${table.name})`),
  ],
);

/**
 * Estado de cada sincronización con Scryfall. Guarda la fecha del fichero importado: si
 * Scryfall no ha publicado uno nuevo, el worker no vuelve a descargar 80 MB para nada.
 */
export const cardSyncState = pgTable('card_sync_state', {
  /** Tipo de _bulk data_: `default_cards`. */
  source: text('source').primaryKey(),
  /** `updated_at` del fichero de Scryfall que se importó. */
  bulkUpdatedAt: timestamp('bulk_updated_at', { withTimezone: true }).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
  cardCount: integer('card_count').notNull(),
});
