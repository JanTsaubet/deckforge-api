import { summarizeByDeck, summarizeDeckCards, type DeckCardFact } from './deck-card-summary.js';

function fact(overrides: Partial<DeckCardFact>): DeckCardFact {
  return {
    deckId: 'mazo-1',
    board: 'main',
    quantity: 1,
    name: 'Carta',
    typeLine: 'Creature — Goblin',
    manaValue: 2,
    colorIdentity: [],
    imageArtCrop: null,
    ...overrides,
  };
}

describe('summarizeDeckCards', () => {
  it('en Commander, la identidad y la portada son las del comandante', () => {
    const summary = summarizeDeckCards([
      fact({
        board: 'commander',
        name: 'Atraxa',
        colorIdentity: ['G', 'W', 'U', 'B'],
        imageArtCrop: 'atraxa.jpg',
      }),
      fact({ name: 'Craterhoof', manaValue: 8, colorIdentity: ['G'], imageArtCrop: 'hoof.jpg' }),
    ]);

    expect(summary).toEqual({ colorIdentity: ['W', 'U', 'B', 'G'], coverImageUrl: 'atraxa.jpg' });
  });

  it('con dos comandantes, une sus identidades', () => {
    const summary = summarizeDeckCards([
      fact({ board: 'commander', name: 'Tymna', colorIdentity: ['W', 'B'] }),
      fact({ board: 'commander', name: 'Kraum', colorIdentity: ['U', 'R'] }),
    ]);

    expect(summary.colorIdentity).toEqual(['W', 'U', 'B', 'R']);
  });

  it('sin comandante, la portada es la carta de más coste que no sea tierra', () => {
    const summary = summarizeDeckCards([
      fact({
        name: 'Mountain',
        typeLine: 'Basic Land — Mountain',
        manaValue: 0,
        imageArtCrop: 'm.jpg',
      }),
      fact({
        name: 'Lightning Bolt',
        manaValue: 1,
        colorIdentity: ['R'],
        imageArtCrop: 'bolt.jpg',
      }),
      fact({ name: 'Fireball', manaValue: 1, colorIdentity: ['R'], imageArtCrop: 'fireball.jpg' }),
      fact({ name: 'Ugin', manaValue: 8, imageArtCrop: 'ugin.jpg' }),
    ]);

    expect(summary).toEqual({ colorIdentity: ['R'], coverImageUrl: 'ugin.jpg' });
  });

  it('el banquillo y las "quizás" no cuentan', () => {
    const summary = summarizeDeckCards([
      fact({ board: 'sideboard', colorIdentity: ['U'], imageArtCrop: 'side.jpg' }),
      fact({ board: 'maybeboard', colorIdentity: ['B'], imageArtCrop: 'maybe.jpg' }),
    ]);

    expect(summary).toEqual({ colorIdentity: [], coverImageUrl: null });
  });

  it('un mazo solo de tierras usa una tierra como portada antes que ninguna', () => {
    const summary = summarizeDeckCards([
      fact({ name: 'Forest', typeLine: 'Basic Land — Forest', imageArtCrop: 'forest.jpg' }),
    ]);

    expect(summary.coverImageUrl).toBe('forest.jpg');
  });
});

describe('summarizeByDeck', () => {
  it('resume cada mazo por separado', () => {
    const summaries = summarizeByDeck([
      fact({ deckId: 'a', colorIdentity: ['G'] }),
      fact({ deckId: 'b', colorIdentity: ['U'] }),
      fact({ deckId: 'a', colorIdentity: ['W'] }),
    ]);

    expect(summaries.get('a')?.colorIdentity).toEqual(['W', 'G']);
    expect(summaries.get('b')?.colorIdentity).toEqual(['U']);
  });
});
