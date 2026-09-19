import { sortColors } from '../cards/colors.js';
import type { DeckBoard } from './deck.constants.js';

/** Lo que hace falta saber de cada carta de un mazo para resumirlo en la biblioteca. */
export interface DeckCardFact {
  deckId: string;
  board: DeckBoard;
  quantity: number;
  name: string;
  typeLine: string;
  manaValue: number;
  colorIdentity: string[];
  imageArtCrop: string | null;
}

export interface DeckCardSummary {
  /** En orden WUBRG. Vacío si ninguna carta está en el catálogo (o el mazo es incoloro). */
  colorIdentity: string[];
  coverImageUrl: string | null;
}

export const EMPTY_CARD_SUMMARY: DeckCardSummary = { colorIdentity: [], coverImageUrl: null };

/**
 * Identidad de color y portada de un mazo, a partir de sus cartas (solo comandante y mazo
 * principal: el banquillo y las "quizás" no definen el mazo).
 *
 * - **Identidad:** en Commander la marca el comandante, aunque el resto de cartas no use
 *   todos sus colores. Sin comandante, es la unión de las identidades de todas las cartas.
 * - **Portada:** la ilustración del comandante. Sin comandante, la carta de más valor de maná
 *   que no sea tierra, que suele ser la carta "estrella" del mazo.
 */
export function summarizeDeckCards(facts: DeckCardFact[]): DeckCardSummary {
  const playable = facts.filter((fact) => fact.board === 'commander' || fact.board === 'main');
  if (playable.length === 0) return EMPTY_CARD_SUMMARY;

  const commanders = playable
    .filter((fact) => fact.board === 'commander')
    .sort((a, b) => a.name.localeCompare(b.name));
  const identitySource = commanders.length > 0 ? commanders : playable;

  const cover =
    commanders.find((fact) => fact.imageArtCrop) ??
    playable
      .filter((fact) => fact.imageArtCrop && !isLand(fact))
      .sort((a, b) => b.manaValue - a.manaValue || a.name.localeCompare(b.name))[0] ??
    playable.find((fact) => fact.imageArtCrop);

  return {
    colorIdentity: sortColors(identitySource.flatMap((fact) => fact.colorIdentity)),
    coverImageUrl: cover?.imageArtCrop ?? null,
  };
}

/** Agrupa por mazo y resume cada uno. Los mazos sin cartas conocidas quedan fuera del mapa. */
export function summarizeByDeck(facts: DeckCardFact[]): Map<string, DeckCardSummary> {
  const byDeck = new Map<string, DeckCardFact[]>();
  for (const fact of facts) {
    const list = byDeck.get(fact.deckId);
    if (list) list.push(fact);
    else byDeck.set(fact.deckId, [fact]);
  }
  return new Map([...byDeck].map(([deckId, list]) => [deckId, summarizeDeckCards(list)]));
}

/** "Land", "Basic Land — Forest", "Artifact Land"… pero no "Land Creature // …" de frente. */
function isLand(fact: DeckCardFact): boolean {
  const front = fact.typeLine.split(' // ')[0] ?? '';
  return /\bLand\b/.test(front) && !/\bCreature\b/.test(front);
}
