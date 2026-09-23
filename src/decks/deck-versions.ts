import type { DeckBoard } from './deck.constants.js';
import type { EntryChange } from './decks.repository.js';

/**
 * Un cambio en el historial: cuántas copias de una carta había en una zona y cuántas hay
 * ahora. `from: 0` es una carta que se añadió y `to: 0` una que se quitó; mover una carta de
 * zona son dos cambios, uno que la quita de una zona y otro que la pone en la otra.
 */
export interface DeckVersionChange {
  cardId: string;
  board: DeckBoard;
  from: number;
  to: number;
}

/** Cuántas copias tenía el mazo de cada carta y zona antes de los cambios. */
export interface EntryQuantity {
  cardId: string;
  board: DeckBoard;
  quantity: number;
}

/**
 * Cuántos minutos seguidos de edición caben en una misma versión. El guardado automático
 * manda cambios cada pocos segundos: sin agrupar, añadir diez cartas dejaría diez versiones
 * y el historial no se podría leer. Así una tarde de retoques es una entrada, no cien.
 */
export const VERSION_WINDOW_MINUTES = 10;

/**
 * Qué cambió de verdad en las cartas del mazo. Lo que no toca cantidades no sale en el
 * historial: cambiar solo las etiquetas de una carta no es un cambio en la lista.
 *
 * Si la misma carta y zona viene varias veces, se encadenan (vale el estado inicial del
 * primero y el final del último), que es lo que verá quien lea el historial.
 */
export function versionChanges(
  before: EntryQuantity[],
  changes: EntryChange[],
): DeckVersionChange[] {
  const quantities = new Map(before.map((entry) => [entryKey(entry), entry.quantity]));
  const diff = new Map<string, DeckVersionChange>();

  for (const change of changes) {
    const key = entryKey(change);
    const from = diff.get(key)?.from ?? quantities.get(key) ?? 0;
    diff.set(key, { cardId: change.cardId, board: change.board, from, to: change.quantity });
  }

  return [...diff.values()].filter(withEffect);
}

/**
 * Añade unos cambios a los que ya tenía una versión. De cada carta se conserva de dónde
 * partía y se queda con lo último: si se añade una carta y luego se quita, deja de aparecer,
 * porque el mazo está como estaba.
 */
export function mergeVersionChanges(
  stored: DeckVersionChange[],
  incoming: DeckVersionChange[],
): DeckVersionChange[] {
  const merged = new Map(stored.map((change) => [entryKey(change), change]));

  for (const change of incoming) {
    const key = entryKey(change);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...change, from: existing.from } : change);
  }

  return [...merged.values()].filter(withEffect);
}

function entryKey({ cardId, board }: Pick<DeckVersionChange, 'cardId' | 'board'>): string {
  return `${board}:${cardId}`;
}

function withEffect(change: DeckVersionChange): boolean {
  return change.from !== change.to;
}
