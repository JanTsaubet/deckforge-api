import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DATABASE, type Database } from '../src/database/database.js';
import { cards } from '../src/database/schema/index.js';
import { createTestApp, signUp, type TestUser } from './helpers/test-app.js';

type CardInsert = typeof cards.$inferInsert;

/** Id de impresión con forma de UUID a partir de un número. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function card(n: number, overrides: Partial<CardInsert> = {}): CardInsert {
  return {
    id: uuid(n),
    oracleId: `oracle-${n}`,
    name: `Carta ${n}`,
    lang: 'en',
    setCode: 'tst',
    setName: 'Test',
    collectorNumber: String(n),
    layout: 'normal',
    manaValue: 2,
    typeLine: 'Creature — Goblin',
    colors: ['R'],
    colorIdentity: ['R'],
    rarity: 'common',
    imageNormal: `https://img/${n}.jpg`,
    legalities: { commander: 'legal' },
    ...overrides,
  };
}

const KRENKO = 1;
const SOL_RING = 2;
const GOBLIN_TOKEN = 3;

interface EntryResponse {
  cardId: string;
  board: string;
  quantity: number;
  card: { name: string; priceEur: number | null } | null;
}

describe('Editor de mazos (e2e)', () => {
  let app: NestExpressApplication;
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await signUp(app);
    stranger = await signUp(app);

    await app
      .get<Database>(DATABASE)
      .insert(cards)
      .values([
        card(KRENKO, {
          name: 'Krenko, Mob Boss',
          typeLine: 'Legendary Creature — Goblin Warrior',
          manaValue: 4,
          edhrecRank: 500,
          priceEur: '1.83',
        }),
        // Dos impresiones de la misma carta: el buscador solo debe devolver una.
        card(SOL_RING, {
          oracleId: 'oracle-sol-ring',
          name: 'Sol Ring',
          typeLine: 'Artifact',
          colors: [],
          colorIdentity: [],
          edhrecRank: 1,
          releasedAt: '2021-04-23',
        }),
        card(20, {
          oracleId: 'oracle-sol-ring',
          name: 'Sol Ring',
          typeLine: 'Artifact',
          colors: [],
          colorIdentity: [],
          edhrecRank: 1,
          releasedAt: '1993-08-05',
        }),
        card(GOBLIN_TOKEN, {
          name: 'Goblin',
          layout: 'token',
          typeLine: 'Token Creature — Goblin',
        }),
        card(4, { name: 'Goblin Matron', edhrecRank: 900 }),
        card(5, { name: 'Siege-Gang Commander', edhrecRank: 700, manaValue: 5 }),
        card(7, { name: 'Dragon Tempest', edhrecRank: 50 }),
        // Lightning Bolt: una impresión de colección normal y otra más nueva de una reimpresión
        // especial y promocional. El buscador debe elegir la normal.
        card(8, {
          oracleId: 'oracle-bolt',
          name: 'Lightning Bolt',
          setCode: 'm11',
          setType: 'core',
          releasedAt: '2010-07-16',
          edhrecRank: 5,
        }),
        card(9, {
          oracleId: 'oracle-bolt',
          name: 'Lightning Bolt',
          setCode: 'plst',
          setType: 'masters',
          promo: true,
          releasedAt: '2024-01-01',
          edhrecRank: 5,
        }),
        card(10, { name: 'Bolt Bend', edhrecRank: 5000 }),
        // Cartas reversibles: sin oracle_id; son cartas distintas y deben salir las dos.
        card(11, { oracleId: null, name: 'Reversible Uno' }),
        card(12, { oracleId: null, name: 'Reversible Dos' }),
        card(6, {
          name: 'Llanowar Elves',
          colors: ['G'],
          colorIdentity: ['G'],
          edhrecRank: 100,
        }),
      ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function createDeck(user: TestUser, body: object = { name: 'Goblins' }): Promise<string> {
    const response = await api()
      .post('/v1/decks')
      .set('Cookie', user.cookie)
      .send(body)
      .expect(201);
    return (response.body as { id: string }).id;
  }

  const patchEntries = (user: TestUser, deckId: string, changes: object[]) =>
    api().patch(`/v1/decks/${deckId}/entries`).set('Cookie', user.cookie).send({ changes });

  describe('cartas del mazo', () => {
    it('el mazo trae los datos de cada carta del catálogo', async () => {
      const deckId = await createDeck(owner, {
        name: 'Con datos',
        entries: [{ cardId: uuid(KRENKO), board: 'commander', quantity: 1 }],
      });

      const response = await api()
        .get(`/v1/decks/${deckId}`)
        .set('Cookie', owner.cookie)
        .expect(200);

      expect(response.body.viewerCanEdit).toBe(true);
      expect(response.body.entries[0]).toMatchObject({
        cardId: uuid(KRENKO),
        card: { name: 'Krenko, Mob Boss', manaValue: 4, priceEur: 1.83 },
      });
    });

    it('añade, mueve de zona y quita cartas; cada cambio fija la cantidad final', async () => {
      const deckId = await createDeck(owner);

      await patchEntries(owner, deckId, [
        { cardId: uuid(KRENKO), board: 'main', quantity: 1 },
        { cardId: uuid(4), board: 'main', quantity: 3 },
      ]).expect(200);
      // Mover Krenko al puesto de comandante: dos cambios en la misma petición.
      await patchEntries(owner, deckId, [
        { cardId: uuid(KRENKO), board: 'main', quantity: 0 },
        { cardId: uuid(KRENKO), board: 'commander', quantity: 1 },
      ]).expect(200);
      const response = await patchEntries(owner, deckId, [
        { cardId: uuid(4), board: 'main', quantity: 0 },
      ]).expect(200);

      const entries = response.body.entries as EntryResponse[];
      expect(entries.map(({ cardId, board, quantity }) => [cardId, board, quantity])).toEqual([
        [uuid(KRENKO), 'commander', 1],
      ]);
      expect(response.body.cardCount).toBe(1);
    });

    it('repetir el mismo cambio no duplica cartas (reintentos del guardado automático)', async () => {
      const deckId = await createDeck(owner);
      const change = [{ cardId: uuid(SOL_RING), board: 'main', quantity: 1 }];

      await patchEntries(owner, deckId, change).expect(200);
      const response = await patchEntries(owner, deckId, change).expect(200);

      expect(response.body.cardCount).toBe(1);
    });

    it('no deja añadir una carta que no existe en el catálogo', async () => {
      const deckId = await createDeck(owner);

      const response = await patchEntries(owner, deckId, [
        { cardId: uuid(999), board: 'main', quantity: 1 },
      ]).expect(400);

      expect(response.body.message).toContain(uuid(999));
    });

    it('no deja tocar las cartas de un mazo ajeno', async () => {
      const deckId = await createDeck(owner);

      await patchEntries(stranger, deckId, [
        { cardId: uuid(SOL_RING), board: 'main', quantity: 1 },
      ]).expect(404);
    });

    it('un mazo ajeno público se ve, pero no se puede editar', async () => {
      const deckId = await createDeck(owner, { name: 'Público', visibility: 'public' });

      const response = await api()
        .get(`/v1/decks/${deckId}`)
        .set('Cookie', stranger.cookie)
        .expect(200);

      expect(response.body.viewerCanEdit).toBe(false);
    });

    it('rechaza cambios inválidos', async () => {
      const deckId = await createDeck(owner);

      await patchEntries(owner, deckId, []).expect(400);
      await patchEntries(owner, deckId, [{ cardId: uuid(1), board: 'main', quantity: -1 }]).expect(
        400,
      );
      await patchEntries(owner, deckId, [{ cardId: uuid(1), board: 'mano', quantity: 1 }]).expect(
        400,
      );
    });

    it('si un cambio pasaría del máximo de cartas distintas, no se aplica ninguno', async () => {
      const extra = Array.from({ length: 501 }, (_, index) => card(10_000 + index));
      await app.get<Database>(DATABASE).insert(cards).values(extra);
      const deckId = await createDeck(owner);
      const add = (from: number, to: number) =>
        extra.slice(from, to).map((row) => ({ cardId: row.id, board: 'main', quantity: 1 }));

      await patchEntries(owner, deckId, add(0, 200)).expect(200);
      await patchEntries(owner, deckId, add(200, 400)).expect(200);
      await patchEntries(owner, deckId, add(400, 500)).expect(200);
      await patchEntries(owner, deckId, add(500, 501)).expect(400);

      const response = await api()
        .get(`/v1/decks/${deckId}`)
        .set('Cookie', owner.cookie)
        .expect(200);
      expect(response.body.entries).toHaveLength(500);
    });
  });

  describe('buscador de cartas', () => {
    const search = async (query: string) => {
      const response = await api().get(`/v1/cards/search?${query}`).expect(200);
      return (response.body as Array<{ id: string; name: string }>).map((card) => card.name);
    };

    it('pone primero las que empiezan por el texto, aunque sean menos jugadas', async () => {
      // "Goblin Matron" empieza por "go"; "Dragon Tempest" solo lo contiene ("dra-go-n"), y eso
      // que es mucho más jugada (EDHREC 50 frente a 900).
      await expect(search('q=go')).resolves.toEqual(['Goblin Matron', 'Dragon Tempest']);
    });

    it('entre las que solo contienen el texto, pone primero las más jugadas', async () => {
      // Ninguna empieza por "in": Sol Ring (EDHREC 1) va antes que Goblin Matron (900).
      const names = await search('q=in');

      expect(names.indexOf('Sol Ring')).toBeLessThan(names.indexOf('Goblin Matron'));
    });

    it('una palabra que empieza por el texto pesa igual que el principio del nombre', async () => {
      // "Bolt Bend" empieza por "bolt", pero "Lightning Bolt" tiene una palabra que empieza
      // por "bolt" y es muchísimo más jugada: va primero.
      const names = await search('q=bolt');

      expect(names.slice(0, 2)).toEqual(['Lightning Bolt', 'Bolt Bend']);
    });

    it('el nombre exacto va siempre primero', async () => {
      const names = await search('q=bolt%20bend');

      expect(names[0]).toBe('Bolt Bend');
    });

    it('elige la impresión de una colección normal antes que una reimpresión promocional', async () => {
      const response = await api().get('/v1/cards/search?q=lightning').expect(200);

      expect(response.body[0]).toMatchObject({ name: 'Lightning Bolt', setCode: 'm11' });
    });

    it('las cartas sin oracle_id (reversibles) no se agrupan entre sí', async () => {
      await expect(search('q=reversible')).resolves.toEqual(['Reversible Dos', 'Reversible Uno']);
    });

    it('devuelve una sola impresión por carta, la más reciente', async () => {
      const response = await api().get('/v1/cards/search?q=sol%20ring').expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(uuid(SOL_RING));
    });

    it('no ofrece fichas ni otras cartas que no van en un mazo', async () => {
      await expect(search('q=goblin')).resolves.toEqual(['Goblin Matron']);
    });

    it('filtra por la identidad de color del comandante; las incoloras siempre caben', async () => {
      await expect(search('q=sol&identity=G')).resolves.toEqual(['Sol Ring']);
      await expect(search('q=llanowar&identity=R')).resolves.toEqual([]);
      await expect(search('q=llanowar&identity=RG')).resolves.toEqual(['Llanowar Elves']);
      await expect(search('q=krenko&identity=C')).resolves.toEqual([]);
    });

    it('trata % y _ como texto, no como comodines', async () => {
      await expect(search('q=%25%25')).resolves.toEqual([]);
    });

    it('rechaza búsquedas demasiado cortas o una identidad inválida', async () => {
      await api().get('/v1/cards/search?q=a').expect(400);
      await api().get('/v1/cards/search?q=sol&identity=XYZ').expect(400);
    });
  });
});
