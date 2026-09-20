import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { cards } from '../database/schema/index.js';
import type { CardDto } from './dto/card.dto.js';

/**
 * Tipos de "carta" que no se meten en un mazo: fichas, emblemas, planos… No aparecen en las
 * búsquedas del editor.
 */
const NON_DECK_LAYOUTS = [
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
  'planar',
  'scheme',
  'vanguard',
];

const cardColumns = {
  id: cards.id,
  oracleId: cards.oracleId,
  name: cards.name,
  layout: cards.layout,
  manaCost: cards.manaCost,
  manaValue: cards.manaValue,
  typeLine: cards.typeLine,
  oracleText: cards.oracleText,
  colors: cards.colors,
  colorIdentity: cards.colorIdentity,
  rarity: cards.rarity,
  setCode: cards.setCode,
  setName: cards.setName,
  collectorNumber: cards.collectorNumber,
  imageSmall: cards.imageSmall,
  imageNormal: cards.imageNormal,
  imageArtCrop: cards.imageArtCrop,
  priceEur: cards.priceEur,
  priceUsd: cards.priceUsd,
  legalities: cards.legalities,
  gameChanger: cards.gameChanger,
};

type CardRow = {
  [K in keyof typeof cardColumns]: (typeof cardColumns)[K]['_']['data'] | null;
};

export interface CardSearchOptions {
  query: string;
  limit: number;
  /**
   * Solo cartas cuya identidad de color quepa en esta (p. ej. `['R', 'G']` para un comandante
   * Gruul). `undefined` no filtra; `[]` deja solo las incoloras.
   */
  identity?: string[];
}

/** Lectura del catálogo local de cartas. */
@Injectable()
export class CardsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByIds(ids: string[]): Promise<CardDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select(cardColumns).from(cards).where(inArray(cards.id, ids));
    return rows.map(toCardDto);
  }

  /** Cuántos de estos ids existen en el catálogo (para validar cartas antes de guardarlas). */
  async findExistingIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db.select({ id: cards.id }).from(cards).where(inArray(cards.id, ids));
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Búsqueda por nombre para el editor. Devuelve una impresión por carta: en papel, no
   * promocional, de una colección normal (básica o de expansión) si la hay, con imagen y la
   * más reciente. Así "Lightning Bolt" no sale con el arte de una reimpresión rara.
   *
   * Orden de los resultados, por niveles:
   *  1. El nombre exacto.
   *  2. Alguna palabra del nombre empieza por el texto ("bolt" → "Lightning Bolt").
   *  3. El nombre solo contiene el texto.
   * Dentro de cada nivel, las más jugadas en Commander (EDHREC) primero: con "bolt", nadie
   * busca "Bolt Bend" antes que "Lightning Bolt".
   */
  async search({ query, limit, identity }: CardSearchOptions): Promise<CardDto[]> {
    const text = query.toLowerCase();
    const pattern = `%${escapeLike(text)}%`;
    const wordStart = `${escapeLike(text)}%`;
    const laterWordStart = `% ${escapeLike(text)}%`;

    const filters = [
      eq(cards.lang, 'en'),
      notInArray(cards.layout, NON_DECK_LAYOUTS),
      sql`lower(${cards.name}) like ${pattern}`,
    ];
    if (identity) {
      // `<@`: "está contenido en". `{}` (incolora) está contenido en cualquier identidad.
      filters.push(sql`${cards.colorIdentity} <@ ${sql.param(identity)}::text[]`);
    }

    // Una fila por carta, eligiendo su mejor impresión. Las cartas reversibles no tienen
    // `oracle_id`: sin el `coalesce`, todas ellas (NULL) contarían como una sola carta.
    const cardKey = sql`coalesce(${cards.oracleId}, ${cards.id})`;
    const printings = this.db
      .selectDistinctOn([cardKey], {
        ...cardColumns,
        edhrecRank: cards.edhrecRank,
        tier: sql<number>`case
          when lower(${cards.name}) = ${text} then 0
          when lower(${cards.name}) like ${wordStart} or lower(${cards.name}) like ${laterWordStart} then 1
          else 2 end`.as('tier'),
      })
      .from(cards)
      .where(and(...filters))
      .orderBy(
        cardKey,
        asc(cards.digital),
        asc(cards.promo),
        sql`${cards.setType} not in ('core', 'expansion')`,
        sql`${cards.imageNormal} is null`,
        sql`${cards.releasedAt} desc nulls last`,
      )
      .as('printings');

    // …y luego se ordenan las cartas por relevancia.
    const rows = await this.db
      .select()
      .from(printings)
      .orderBy(
        asc(printings.tier),
        sql`${printings.edhrecRank} asc nulls last`,
        asc(printings.name),
      )
      .limit(limit);

    return rows.map(toCardDto);
  }
}

/** En LIKE, `%` y `_` son comodines: si el usuario los escribe, se buscan literalmente. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Postgres devuelve los `numeric` como texto para no perder precisión; aquí basta un número. */
function toCardDto(row: CardRow): CardDto {
  return {
    id: row.id ?? '',
    oracleId: row.oracleId,
    name: row.name ?? '',
    layout: row.layout ?? 'normal',
    manaCost: row.manaCost,
    manaValue: row.manaValue ?? 0,
    typeLine: row.typeLine ?? '',
    oracleText: row.oracleText,
    colors: (row.colors ?? []) as CardDto['colors'],
    colorIdentity: (row.colorIdentity ?? []) as CardDto['colorIdentity'],
    rarity: row.rarity ?? 'common',
    setCode: row.setCode ?? '',
    setName: row.setName ?? '',
    collectorNumber: row.collectorNumber ?? '',
    imageSmall: row.imageSmall,
    imageNormal: row.imageNormal,
    imageArtCrop: row.imageArtCrop,
    priceEur: row.priceEur === null ? null : Number(row.priceEur),
    priceUsd: row.priceUsd === null ? null : Number(row.priceUsd),
    legalities: row.legalities ?? {},
    gameChanger: row.gameChanger ?? false,
  };
}
