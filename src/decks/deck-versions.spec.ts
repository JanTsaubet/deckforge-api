import { mergeVersionChanges, versionChanges, type DeckVersionChange } from './deck-versions.js';
import type { EntryChange } from './decks.repository.js';

/** Una carta del mazo con sus copias, para describir cómo estaba antes de los cambios. */
const had = (cardId: string, quantity: number, board: EntryChange['board'] = 'main') => ({
  cardId,
  board,
  quantity,
});

const change = (
  cardId: string,
  quantity: number,
  board: EntryChange['board'] = 'main',
): EntryChange => ({ cardId, board, quantity });

const version = (
  cardId: string,
  from: number,
  to: number,
  board: DeckVersionChange['board'] = 'main',
): DeckVersionChange => ({ cardId, board, from, to });

describe('versionChanges', () => {
  it('anota de cuántas copias a cuántas, y de dónde salía cada carta', () => {
    const changes = versionChanges(
      [had('sol-ring', 1), had('forest', 10)],
      [change('sol-ring', 0), change('forest', 9), change('bolt', 1)],
    );

    expect(changes).toEqual([
      version('sol-ring', 1, 0),
      version('forest', 10, 9),
      version('bolt', 0, 1),
    ]);
  });

  it('mover una carta de zona son dos cambios, el que la quita y el que la pone', () => {
    const changes = versionChanges(
      [had('bolt', 1)],
      [change('bolt', 0), change('bolt', 1, 'sideboard')],
    );

    expect(changes).toEqual([version('bolt', 1, 0), version('bolt', 0, 1, 'sideboard')]);
  });

  it('lo que no toca las cantidades no es un cambio del mazo', () => {
    // Es lo que manda el editor al etiquetar una carta: la misma cantidad y otras etiquetas.
    const changes = versionChanges(
      [had('sol-ring', 1)],
      [{ ...change('sol-ring', 1), tags: ['rampa'] }],
    );

    expect(changes).toEqual([]);
  });

  it('encadena varios cambios de la misma carta en uno solo', () => {
    const changes = versionChanges([had('forest', 1)], [change('forest', 5), change('forest', 3)]);

    expect(changes).toEqual([version('forest', 1, 3)]);
  });
});

describe('mergeVersionChanges', () => {
  it('conserva de dónde partía cada carta y se queda con lo último', () => {
    const merged = mergeVersionChanges([version('forest', 10, 9)], [version('forest', 9, 7)]);

    expect(merged).toEqual([version('forest', 10, 7)]);
  });

  it('añade las cartas que la versión todavía no tenía', () => {
    const merged = mergeVersionChanges([version('forest', 10, 9)], [version('bolt', 0, 1)]);

    expect(merged).toEqual([version('forest', 10, 9), version('bolt', 0, 1)]);
  });

  it('una carta que vuelve a como estaba deja de aparecer', () => {
    const merged = mergeVersionChanges([version('bolt', 0, 1)], [version('bolt', 1, 0)]);

    expect(merged).toEqual([]);
  });

  it('distingue la misma carta en zonas distintas', () => {
    const merged = mergeVersionChanges(
      [version('bolt', 1, 0)],
      [version('bolt', 0, 1, 'sideboard')],
    );

    expect(merged).toEqual([version('bolt', 1, 0), version('bolt', 0, 1, 'sideboard')]);
  });
});
