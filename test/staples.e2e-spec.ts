import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DATABASE, type Database } from '../src/database/database.js';
import { cards } from '../src/database/schema/index.js';
import { createTestApp } from './helpers/test-app.js';

type CardInsert = typeof cards.$inferInsert;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let next = 0;

/** Una carta del catálogo; lo que no se dice no importa para estas pruebas. */
function card(overrides: Partial<CardInsert> & { name: string }): CardInsert {
  next += 1;
  return {
    id: uuid(next),
    oracleId: `oracle-${next}`,
    lang: 'en',
    setCode: 'tst',
    setName: 'Test',
    setType: 'expansion',
    collectorNumber: String(next),
    layout: 'normal',
    manaValue: 2,
    typeLine: 'Artifact',
    colors: [],
    colorIdentity: [],
    rarity: 'rare',
    imageNormal: 'https://img/card.jpg',
    legalities: { commander: 'legal' },
    edhrecRank: 1000,
    ...overrides,
  };
}

interface StapleGroup {
  role: string;
  cards: Array<{ name: string }>;
}

describe('Quick adds (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await app
      .get<Database>(DATABASE)
      .insert(cards)
      .values([
        // Rampa: produce maná o busca tierras.
        card({ name: 'Sol Ring', oracleText: '{T}: Add {C}{C}.', manaValue: 1, edhrecRank: 1 }),
        card({
          name: 'Arcane Signet',
          oracleText: "{T}: Add one mana of any color in your commander's color identity.",
          edhrecRank: 3,
        }),
        card({
          name: 'Cultivate',
          typeLine: 'Sorcery',
          oracleText: 'Search your library for up to two basic land cards...',
          colors: ['G'],
          colorIdentity: ['G'],
          manaValue: 3,
          edhrecRank: 5,
        }),
        // Una carta que produce maná pero cuesta demasiado no es rampa.
        card({
          name: 'Gilded Lotus',
          oracleText: '{T}: Add three mana of any one color.',
          manaValue: 5,
          edhrecRank: 2,
        }),

        // Robo.
        card({
          name: 'Rhystic Study',
          typeLine: 'Enchantment',
          oracleText: 'Whenever an opponent casts a spell, you may draw a card...',
          colors: ['U'],
          colorIdentity: ['U'],
          edhrecRank: 4,
        }),
        card({
          name: 'Skullclamp',
          oracleText: 'Whenever equipped creature dies, draw two cards.',
          edhrecRank: 41,
        }),

        // Remoción, y un parpadeo que no lo es aunque exilie.
        card({
          name: 'Swords to Plowshares',
          typeLine: 'Instant',
          oracleText: 'Exile target creature. Its controller gains life...',
          colors: ['W'],
          colorIdentity: ['W'],
          edhrecRank: 6,
        }),
        card({
          name: "Conjurer's Closet",
          oracleText: 'At the beginning of your end step, exile target creature you control...',
          edhrecRank: 7,
        }),

        // Tierras: una incolora que vale para todos y un "fetch" de otros colores.
        card({
          name: 'Command Tower',
          typeLine: 'Land',
          oracleText: "{T}: Add one mana of any color in your commander's color identity.",
          manaValue: 0,
          edhrecRank: 2,
        }),
        card({
          name: 'Polluted Delta',
          typeLine: 'Land',
          oracleText:
            '{T}, Pay 1 life, Sacrifice: Search your library for an Island or Swamp card...',
          manaValue: 0,
          edhrecRank: 36,
        }),
        card({
          name: 'Plains',
          typeLine: 'Basic Land — Plains',
          manaValue: 0,
          colorIdentity: ['W'],
          edhrecRank: 100,
        }),

        // Fuera del catálogo jugable: ficha, sin ranking y no legal en Commander.
        card({ name: 'Treasure', layout: 'token', oracleText: '{T}, Sacrifice: Add one mana...' }),
        card({ name: 'Sin ranking', oracleText: '{T}: Add {C}.', edhrecRank: null }),
        card({
          name: 'Black Lotus',
          oracleText: '{T}, Sacrifice: Add three mana of any one color.',
          legalities: { commander: 'banned' },
          edhrecRank: 8,
        }),
      ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const staples = (query = '') =>
    request(app.getHttpServer()).get(`/v1/cards/staples${query}`).expect(200);

  const names = (body: StapleGroup[], role: string) =>
    body.find((group) => group.role === role)?.cards.map((staple) => staple.name) ?? [];

  it('propone las más jugadas de cada función, en el orden en que se monta un mazo', async () => {
    const { body } = await staples();

    expect((body as StapleGroup[]).map((group) => group.role)).toEqual([
      'ramp',
      'draw',
      'removal',
      'land',
    ]);
    expect(names(body as StapleGroup[], 'ramp')).toEqual([
      'Sol Ring',
      'Arcane Signet',
      'Cultivate',
    ]);
    expect(names(body as StapleGroup[], 'draw')).toEqual(['Rhystic Study', 'Skullclamp']);
  });

  it('solo propone cartas que quepan en la identidad del comandante', async () => {
    const { body } = await staples('?identity=R');

    // Cultivate (verde) y Rhystic Study (azul) no caben en un mazo mono rojo.
    expect(names(body as StapleGroup[], 'ramp')).toEqual(['Sol Ring', 'Arcane Signet']);
    expect(names(body as StapleGroup[], 'draw')).toEqual(['Skullclamp']);
  });

  it('no propone tierras que van a buscar básicas de otros colores', async () => {
    const mono = await staples('?identity=R');
    const dimir = await staples('?identity=UB');

    expect(names(mono.body as StapleGroup[], 'land')).toEqual(['Command Tower']);
    expect(names(dimir.body as StapleGroup[], 'land')).toEqual(['Command Tower', 'Polluted Delta']);
  });

  it('no propone básicas, fichas, prohibidas ni cartas sin ranking', async () => {
    const { body } = await staples();
    const all = (body as StapleGroup[]).flatMap((group) => group.cards.map((card) => card.name));

    expect(all).not.toContain('Plains');
    expect(all).not.toContain('Treasure');
    expect(all).not.toContain('Black Lotus');
    expect(all).not.toContain('Sin ranking');
  });

  it('no confunde con remoción lo que se exilia cosas propias', async () => {
    const { body } = await staples();

    expect(names(body as StapleGroup[], 'removal')).toEqual(['Swords to Plowshares']);
  });

  it('deja pedir menos cartas por función, y rechaza una identidad inválida', async () => {
    const { body } = await staples('?limit=1');

    expect(names(body as StapleGroup[], 'ramp')).toEqual(['Sol Ring']);
    await request(app.getHttpServer()).get('/v1/cards/staples?identity=XY').expect(400);
  });
});
