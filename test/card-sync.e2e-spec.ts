import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import {
  CARD_BULK_SOURCE,
  type BulkFile,
  type CardBulkSource,
} from '../src/cards/sync/card-bulk-source.js';
import { CardCatalogRepository } from '../src/cards/sync/card-catalog.repository.js';
import { CardSyncService } from '../src/cards/sync/card-sync.service.js';
import type { ScryfallCard } from '../src/cards/sync/scryfall-card.js';
import { DATABASE, type DatabaseConnection } from '../src/database/database.js';
import { cards, cardSyncState } from '../src/database/schema/index.js';
import { createTestDatabase } from './helpers/test-app.js';

function scryfallCard(id: string, overrides: Partial<ScryfallCard> = {}): ScryfallCard {
  return {
    id,
    oracle_id: `oracle-${id}`,
    name: `Carta ${id}`,
    lang: 'en',
    layout: 'normal',
    set: 'tst',
    set_name: 'Test',
    collector_number: id,
    mana_cost: '{1}',
    cmc: 1,
    type_line: 'Artifact',
    color_identity: [],
    rarity: 'common',
    prices: { eur: '1.00' },
    legalities: { commander: 'legal' },
    ...overrides,
  };
}

/** Fuente en memoria: lo que Scryfall publicaría, sin red. Cuenta cuántas veces se descarga. */
class FakeBulkSource implements CardBulkSource {
  downloads = 0;

  constructor(
    public file: BulkFile,
    public cards: ScryfallCard[],
  ) {}

  getLatest(): Promise<BulkFile> {
    return Promise.resolve(this.file);
  }

  async *readCards(): AsyncIterable<ScryfallCard> {
    this.downloads += 1;
    for (const card of this.cards) yield await Promise.resolve(card);
  }
}

describe('Sincronización del catálogo (e2e sobre Postgres)', () => {
  let connection: DatabaseConnection;
  let source: FakeBulkSource;
  let sync: CardSyncService;

  const TODAY: BulkFile = { updatedAt: new Date('2026-09-19T09:05:34Z'), downloadUri: 'x' };
  const TOMORROW: BulkFile = { updatedAt: new Date('2026-09-20T09:05:34Z'), downloadUri: 'y' };

  beforeEach(async () => {
    connection = await createTestDatabase();
    source = new FakeBulkSource(TODAY, []);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CardCatalogRepository,
        CardSyncService,
        { provide: CARD_BULK_SOURCE, useValue: source },
        { provide: DATABASE, useValue: connection.db },
      ],
    }).compile();
    sync = moduleRef.get(CardSyncService);
  });

  afterEach(async () => {
    await connection.close();
  });

  const countCards = async () => (await connection.db.select().from(cards)).length;

  it('importa todas las cartas, en lotes, y guarda de qué fichero vienen', async () => {
    // Más de un lote (500) para ejercitar el último lote incompleto.
    source.cards = Array.from({ length: 1234 }, (_, index) => scryfallCard(String(index)));

    const result = await sync.sync();

    expect(result).toMatchObject({ status: 'synced', cards: 1234, skipped: 0 });
    expect(await countCards()).toBe(1234);
    const [state] = await connection.db.select().from(cardSyncState);
    expect(state).toMatchObject({ source: 'default_cards', cardCount: 1234 });
    expect(state?.bulkUpdatedAt).toEqual(TODAY.updatedAt);
  });

  it('no vuelve a descargar si Scryfall no ha publicado un fichero nuevo', async () => {
    source.cards = [scryfallCard('1')];
    await sync.sync();

    const result = await sync.sync();

    expect(result.status).toBe('up-to-date');
    expect(source.downloads).toBe(1);
  });

  it('con un fichero nuevo actualiza las cartas que cambian y añade las nuevas', async () => {
    source.cards = [scryfallCard('1', { prices: { eur: '1.00' } })];
    await sync.sync();

    source.file = TOMORROW;
    source.cards = [scryfallCard('1', { prices: { eur: '2.50' } }), scryfallCard('2')];
    await sync.sync();

    const [card] = await connection.db.select().from(cards).where(eq(cards.id, '1'));
    expect(card?.priceEur).toBe('2.50');
    expect(await countCards()).toBe(2);
  });

  it('con --force reimporta aunque el fichero sea el mismo', async () => {
    source.cards = [scryfallCard('1')];
    await sync.sync();

    await sync.sync({ force: true });

    expect(source.downloads).toBe(2);
  });

  it('omite las láminas de arte y lo cuenta', async () => {
    source.cards = [scryfallCard('1'), scryfallCard('2', { layout: 'art_series' })];

    const result = await sync.sync();

    expect(result).toMatchObject({ cards: 1, skipped: 1 });
  });

  it('si la importación falla a medias no marca el catálogo como sincronizado', async () => {
    source.readCards = async function* () {
      yield await Promise.resolve(scryfallCard('1'));
      throw new Error('Conexión cortada');
    };

    await expect(sync.sync()).rejects.toThrow('Conexión cortada');

    expect(await sync.hasEverSynced()).toBe(false);
  });

  it('dos peticiones a la vez comparten la misma importación', async () => {
    source.cards = [scryfallCard('1')];

    const [first, second] = await Promise.all([sync.sync(), sync.sync()]);

    expect(first).toBe(second);
    expect(source.downloads).toBe(1);
  });
});
