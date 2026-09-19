import type { cards } from '../../database/schema/index.js';
import { sortColors } from '../colors.js';
import type { ScryfallCard } from './scryfall-card.js';

export type CardRow = typeof cards.$inferInsert;

/**
 * Láminas de arte de las colecciones: comparten formato de carta, pero no son cartas de juego
 * (no tienen coste ni se pueden meter en un mazo). No se importan.
 */
const SKIPPED_LAYOUTS = new Set(['art_series']);

/**
 * Traduce una carta de Scryfall a una fila del catálogo, o `undefined` si no se importa.
 *
 * Varios datos no vienen en la raíz según el tipo de carta, y aquí se completan:
 *  - Cartas de dos caras: el coste y la imagen vienen por cara; los colores, también.
 *  - Cartas reversibles: ni coste, ni tipo, ni valor de maná, ni `oracle_id` en la raíz.
 */
export function toCardRow(card: ScryfallCard, syncedAt: Date): CardRow | undefined {
  if (SKIPPED_LAYOUTS.has(card.layout)) return undefined;

  const faces = card.card_faces ?? [];
  const front = faces[0];
  const images = card.image_uris ?? front?.image_uris;

  return {
    id: card.id,
    oracleId: card.oracle_id ?? front?.oracle_id ?? null,
    name: card.name,
    lang: card.lang,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    releasedAt: card.released_at ?? null,
    layout: card.layout,
    // Scryfall usa "" para "sin coste" en algunas caras: se guarda como ausente.
    manaCost: card.mana_cost || front?.mana_cost || null,
    manaValue: card.cmc ?? front?.cmc ?? 0,
    typeLine: card.type_line ?? faces.map((face) => face.type_line ?? '').join(' // '),
    oracleText: card.oracle_text ?? null,
    colors: sortColors(card.colors ?? faces.flatMap((face) => face.colors ?? [])),
    colorIdentity: sortColors(card.color_identity),
    rarity: card.rarity,
    imageSmall: images?.small ?? null,
    imageNormal: images?.normal ?? null,
    imageArtCrop: images?.art_crop ?? null,
    priceEur: card.prices.eur ?? null,
    priceUsd: card.prices.usd ?? null,
    legalities: card.legalities,
    edhrecRank: card.edhrec_rank ?? null,
    gameChanger: card.game_changer ?? false,
    digital: card.digital ?? false,
    syncedAt,
  };
}
