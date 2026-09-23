import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
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

/**
 * Cuál de las impresiones de una carta se enseña: en papel, no promocional, de una colección
 * normal si la hay, con imagen y la más reciente. Así "Lightning Bolt" no sale con el arte de
 * una reimpresión rara. Va siempre detrás de la clave de la carta en el `distinct on`.
 */
const PRINTING_PREFERENCE = [
  asc(cards.digital),
  asc(cards.promo),
  sql`${cards.setType} not in ('core', 'expansion')`,
  sql`${cards.imageNormal} is null`,
  sql`${cards.releasedAt} desc nulls last`,
];

/** Una fila por carta: las reversibles no tienen `oracle_id` y contarían todas como una. */
const CARD_KEY = sql`coalesce(${cards.oracleId}, ${cards.id})`;

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

/**
 * Las funciones que casi todo mazo de Commander necesita, y cómo se reconocen en el texto de
 * una carta. No son categorías exactas —una carta puede hacer varias cosas— pero bastan para
 * proponer lo que más se juega de cada una.
 */
export const STAPLE_ROLES = ['ramp', 'draw', 'removal', 'land'] as const;
export type StapleRole = (typeof STAPLE_ROLES)[number];

/** Nombres de las tierras básicas, para descartar las que buscan colores de otro mazo. */
const BASIC_BY_COLOR: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

export interface StaplesOptions {
  role: StapleRole;
  limit: number;
  /** Identidad del comandante; `undefined` no filtra, `[]` deja solo lo incoloro. */
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

    const cardKey = CARD_KEY;
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
      .orderBy(cardKey, ...PRINTING_PREFERENCE)
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

  /**
   * Cartas "casi obligatorias" de una función para una identidad de color: las más jugadas
   * en Commander (ranking de EDHREC) que encajan en ese mazo. Es lo que propone el bloque de
   * recomendaciones del editor.
   *
   * La función se reconoce por el texto de la carta, que es lo que hay en el catálogo: no es
   * una clasificación perfecta, pero en las primeras posiciones —que es lo que se enseña—
   * acierta, porque ahí están las cartas que todo el mundo juega por ese motivo.
   */
  async findStaples({ role, limit, identity }: StaplesOptions): Promise<CardDto[]> {
    const filters = [
      eq(cards.lang, 'en'),
      notInArray(cards.layout, NON_DECK_LAYOUTS),
      sql`${cards.legalities}->>'commander' = 'legal'`,
      // Sin ranking no se puede saber si se juega mucho: se queda fuera.
      sql`${cards.edhrecRank} is not null`,
      ...roleFilters(role, identity),
    ];
    if (identity) {
      filters.push(sql`${cards.colorIdentity} <@ ${sql.param(identity)}::text[]`);
    }

    const printings = this.db
      .selectDistinctOn([CARD_KEY], { ...cardColumns, edhrecRank: cards.edhrecRank })
      .from(cards)
      .where(and(...filters))
      .orderBy(CARD_KEY, ...PRINTING_PREFERENCE)
      .as('printings');

    const rows = await this.db
      .select()
      .from(printings)
      .orderBy(sql`${printings.edhrecRank} asc`, asc(printings.name))
      .limit(limit);

    return rows.map(toCardDto);
  }
}

/** Lo que distingue a cada función en el texto y el tipo de una carta. */
function roleFilters(role: StapleRole, identity?: string[]): SQL[] {
  const notALand = sql`${cards.typeLine} !~* 'land'`;

  switch (role) {
    case 'ramp':
      // Produce maná (y es barata, o no sería rampa) o va a buscar tierras.
      return [
        notALand,
        sql`((${cards.oracleText} ~* '\\yadd\\y' and ${cards.manaValue} <= 4)
             or ${cards.oracleText} ~* 'search your library for .{0,40}land')`,
      ];
    case 'draw':
      return [
        notALand,
        sql`${cards.oracleText} ~* 'draws? (a|two|three|four|that many|\\d+) cards?'`,
      ];
    case 'removal':
      // "Destruye/exilia objetivo", pero no las que se exilian cosas propias (parpadeos).
      return [
        notALand,
        sql`${cards.oracleText} ~* '(destroy|exile) target'`,
        sql`${cards.oracleText} !~* '(destroy|exile) target [^.]{0,40}you control'`,
      ];
    case 'land':
      return [
        sql`${cards.typeLine} ~* 'land'`,
        sql`${cards.typeLine} !~* 'basic'`,
        // Las tierras que buscan básicas de otros colores (los "fetch" de otra identidad)
        // no pintan nada en este mazo, aunque técnicamente quepan por ser incoloras.
        ...offColorBasics(identity),
      ];
  }
}

function offColorBasics(identity?: string[]): SQL[] {
  if (!identity) return [];
  const offColor = Object.entries(BASIC_BY_COLOR)
    .filter(([color]) => !identity.includes(color))
    .map(([, basic]) => basic);
  if (offColor.length === 0) return [];
  return [sql`${cards.oracleText} !~* ${`\\y(${offColor.join('|')})\\y`}`];
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
