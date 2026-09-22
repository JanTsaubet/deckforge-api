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
/** El texto de todas las caras, separado como lo imprime Scryfall; `null` si no hay ninguno. */
function joinFaces(texts: Array<string | undefined>): string | null {
  const written = texts.filter((text): text is string => Boolean(text));
  return written.length > 0 ? written.join(FACE_SEPARATOR) : null;
}

/** Como Scryfall separa las caras en el texto impreso. */
const FACE_SEPARATOR = '\n//\n';

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
    setType: card.set_type ?? 'expansion',
    promo: card.promo ?? false,
    collectorNumber: card.collector_number,
    releasedAt: card.released_at ?? null,
    layout: card.layout,
    // Scryfall usa "" para "sin coste" en algunas caras: se guarda como ausente.
    manaCost: card.mana_cost || front?.mana_cost || null,
    manaValue: card.cmc ?? front?.cmc ?? 0,
    typeLine: card.type_line ?? faces.map((face) => face.type_line ?? '').join(' // '),
    // Las cartas de dos caras no traen texto en la raíz: se unen las dos, como el tipo.
    // Sin esto, un comandante de doble cara o una tierra modal se quedarían sin texto de
    // reglas, que es de donde salen el maná que producen o si puede ser tu comandante.
    oracleText: card.oracle_text ?? joinFaces(faces.map((face) => face.oracle_text)),
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
