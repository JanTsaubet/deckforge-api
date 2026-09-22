import { sortColors } from '../colors.js';
import { toCardRow } from './card-mapper.js';
import type { ScryfallCard } from './scryfall-card.js';

const SYNCED_AT = new Date('2026-09-19T10:00:00Z');

function scryfallCard(overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id: '0000579f-7b35-4ed3-b44c-db2a538066fe',
    oracle_id: '44623693-51d6-49ad-8cd7-140505caf02f',
    name: 'Fury Sliver',
    lang: 'en',
    layout: 'normal',
    set: 'tsp',
    set_name: 'Time Spiral',
    set_type: 'expansion',
    collector_number: '157',
    released_at: '2006-10-06',
    mana_cost: '{5}{R}',
    cmc: 6,
    type_line: 'Creature — Sliver',
    oracle_text: 'All Sliver creatures have double strike.',
    colors: ['R'],
    color_identity: ['R'],
    rarity: 'uncommon',
    image_uris: { small: 's.jpg', normal: 'n.jpg', art_crop: 'a.jpg' },
    prices: { eur: '0.17', usd: '0.49' },
    legalities: { commander: 'legal' },
    edhrec_rank: 9000,
    ...overrides,
  };
}

describe('toCardRow', () => {
  it('guarda las columnas que usa DeckForge', () => {
    expect(toCardRow(scryfallCard(), SYNCED_AT)).toMatchObject({
      id: '0000579f-7b35-4ed3-b44c-db2a538066fe',
      name: 'Fury Sliver',
      setCode: 'tsp',
      setType: 'expansion',
      promo: false,
      manaCost: '{5}{R}',
      manaValue: 6,
      colorIdentity: ['R'],
      imageArtCrop: 'a.jpg',
      priceEur: '0.17',
      edhrecRank: 9000,
      gameChanger: false,
      syncedAt: SYNCED_AT,
    });
  });

  it('en una carta de dos caras toma coste e imagen de la cara frontal y une los colores', () => {
    const row = toCardRow(
      scryfallCard({
        layout: 'modal_dfc',
        name: 'Valki, God of Lies // Tibalt, Cosmic Impostor',
        mana_cost: undefined,
        colors: undefined,
        image_uris: undefined,
        color_identity: ['R', 'B'],
        card_faces: [
          {
            name: 'Valki, God of Lies',
            mana_cost: '{1}{B}',
            colors: ['B'],
            image_uris: { art_crop: 'valki.jpg' },
          },
          { name: 'Tibalt, Cosmic Impostor', mana_cost: '{5}{B}{R}', colors: ['B', 'R'] },
        ],
      }),
      SYNCED_AT,
    );

    expect(row).toMatchObject({
      manaCost: '{1}{B}',
      imageArtCrop: 'valki.jpg',
      colors: ['B', 'R'],
      colorIdentity: ['B', 'R'],
    });
  });

  it('en una carta de dos caras une el texto de las dos', () => {
    const row = toCardRow(
      scryfallCard({
        name: "Agadeem's Awakening // Agadeem, the Undercrypt",
        layout: 'modal_dfc',
        // Scryfall no pone texto en la raíz de las cartas de dos caras.
        oracle_text: undefined,
        card_faces: [
          { name: "Agadeem's Awakening", oracle_text: 'Return from your graveyard...' },
          { name: 'Agadeem, the Undercrypt', oracle_text: '{T}: Add {B}.' },
        ],
      }),
      SYNCED_AT,
    );

    expect(row?.oracleText).toBe('Return from your graveyard...\n//\n{T}: Add {B}.');
  });

  it('completa las cartas reversibles, que no traen casi nada en la raíz', () => {
    const row = toCardRow(
      scryfallCard({
        layout: 'reversible_card',
        oracle_id: undefined,
        cmc: undefined,
        type_line: undefined,
        mana_cost: undefined,
        colors: undefined,
        card_faces: [
          { name: 'Zndrsplt', oracle_id: 'oracle-z', cmc: 3, type_line: 'Legendary Creature' },
          { name: 'Zndrsplt', oracle_id: 'oracle-z', cmc: 3, type_line: 'Legendary Creature' },
        ],
      }),
      SYNCED_AT,
    );

    expect(row).toMatchObject({
      oracleId: 'oracle-z',
      manaValue: 3,
      typeLine: 'Legendary Creature // Legendary Creature',
      colors: [],
    });
  });

  it('no importa las láminas de arte, que no son cartas de juego', () => {
    expect(toCardRow(scryfallCard({ layout: 'art_series' }), SYNCED_AT)).toBeUndefined();
  });

  it('convierte los precios y costes ausentes en null', () => {
    expect(
      toCardRow(scryfallCard({ prices: { eur: null }, mana_cost: '' }), SYNCED_AT),
    ).toMatchObject({ priceEur: null, priceUsd: null, manaCost: null });
  });
});

describe('sortColors', () => {
  it('ordena en WUBRG y sin repetidos', () => {
    expect(sortColors(['G', 'W', 'B', 'W'])).toEqual(['W', 'B', 'G']);
  });
});
