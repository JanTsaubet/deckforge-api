import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CardsRepository } from '../cards/cards.repository.js';
import type { FoldersService } from '../folders/folders.service.js';
import type { DecksRepository, DeckRow } from './decks.repository.js';
import { DecksService, lastChangePerEntry, mergeEntries } from './decks.service.js';

function deckRow(overrides: Partial<DeckRow> = {}): DeckRow {
  return {
    id: 'mazo-1',
    ownerId: 'duena',
    ownerUsername: 'duena',
    name: 'Mazo de prueba',
    description: null,
    format: 'commander',
    visibility: 'private',
    folderId: null,
    tags: [],
    cardCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('DecksService', () => {
  let repository: {
    applyEntryChanges: ReturnType<typeof vi.fn>;
    listByOwner: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findOwnerId: ReturnType<typeof vi.fn>;
    findEntries: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    duplicate: ReturnType<typeof vi.fn>;
    findCardFacts: ReturnType<typeof vi.fn>;
  };
  let folders: { assertCanUse: ReturnType<typeof vi.fn> };
  let cards: { findByIds: ReturnType<typeof vi.fn>; findExistingIds: ReturnType<typeof vi.fn> };
  let service: DecksService;

  beforeEach(() => {
    repository = {
      applyEntryChanges: vi.fn(),
      listByOwner: vi.fn(),
      findById: vi.fn(),
      findOwnerId: vi.fn(),
      findEntries: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
      findCardFacts: vi.fn().mockResolvedValue([]),
    };
    folders = { assertCanUse: vi.fn() };
    cards = { findByIds: vi.fn().mockResolvedValue([]), findExistingIds: vi.fn() };
    service = new DecksService(
      repository as unknown as DecksRepository,
      folders as unknown as FoldersService,
      cards as unknown as CardsRepository,
    );
  });

  it('al crear un mazo aplica Commander y privado por defecto', async () => {
    repository.create.mockResolvedValue('mazo-1');
    repository.findById.mockResolvedValue(deckRow());

    await service.create('duena', { name: 'Nuevo' });

    expect(repository.create).toHaveBeenCalledWith(
      'duena',
      {
        name: 'Nuevo',
        description: null,
        format: 'commander',
        visibility: 'private',
        folderId: null,
        tags: [],
      },
      [],
    );
  });

  it('no deja crear un mazo dentro de una carpeta que no es tuya', async () => {
    folders.assertCanUse.mockRejectedValue(new BadRequestException('La carpeta no existe'));

    await expect(
      service.create('duena', { name: 'Nuevo', folderId: 'carpeta-ajena' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('sacar un mazo de su carpeta (folderId null) no necesita comprobar ninguna carpeta', async () => {
    repository.findOwnerId.mockResolvedValue('duena');
    repository.findById.mockResolvedValue(deckRow());

    await service.update('mazo-1', 'duena', { folderId: null });

    expect(folders.assertCanUse).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      'mazo-1',
      expect.objectContaining({ folderId: null }),
    );
  });

  it('un mazo privado ajeno responde como si no existiera', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'private', ownerId: 'duena' }));

    await expect(service.getById('mazo-1', 'otra-persona')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getById('mazo-1', undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un mazo oculto con enlace lo puede ver cualquiera que tenga el enlace', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'unlisted' }));

    await expect(service.getById('mazo-1', undefined)).resolves.toMatchObject({ id: 'mazo-1' });
  });

  it('no deja editar un mazo ajeno y ni siquiera llega a escribir', async () => {
    repository.findOwnerId.mockResolvedValue('duena');

    await expect(service.update('mazo-1', 'otra-persona', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('la dueña puede borrar su mazo', async () => {
    repository.findOwnerId.mockResolvedValue('duena');

    await service.remove('mazo-1', 'duena');

    expect(repository.delete).toHaveBeenCalledWith('mazo-1');
  });

  it('copiar un mazo público ajeno crea una copia a tu nombre', async () => {
    repository.findById
      .mockResolvedValueOnce(deckRow({ visibility: 'public', name: 'Atraxa' }))
      .mockResolvedValueOnce(
        deckRow({ id: 'copia-1', ownerId: 'otra-persona', name: 'Copia de Atraxa' }),
      );
    repository.duplicate.mockResolvedValue('copia-1');

    const copy = await service.duplicate('mazo-1', 'otra-persona');

    expect(repository.duplicate).toHaveBeenCalledWith('mazo-1', 'otra-persona', {
      name: 'Copia de Atraxa',
      folderId: null,
    });
    expect(copy.id).toBe('copia-1');
  });

  it('al duplicar un mazo propio, la copia se queda en la misma carpeta', async () => {
    repository.findById.mockResolvedValue(deckRow({ folderId: 'carpeta-1' }));
    repository.duplicate.mockResolvedValue('copia-1');

    await service.duplicate('mazo-1', 'duena');

    expect(repository.duplicate).toHaveBeenCalledWith(
      'mazo-1',
      'duena',
      expect.objectContaining({ folderId: 'carpeta-1' }),
    );
  });

  it('la copia de un mazo público ajeno no hereda la carpeta de su dueña', async () => {
    repository.findById.mockResolvedValue(
      deckRow({ visibility: 'public', folderId: 'carpeta-de-la-duena' }),
    );
    repository.duplicate.mockResolvedValue('copia-1');

    await service.duplicate('mazo-1', 'otra-persona');

    expect(repository.duplicate).toHaveBeenCalledWith(
      'mazo-1',
      'otra-persona',
      expect.objectContaining({ folderId: null }),
    );
  });

  it('no deja copiar un mazo privado ajeno', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'private', ownerId: 'duena' }));

    await expect(service.duplicate('mazo-1', 'otra-persona')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.duplicate).not.toHaveBeenCalled();
  });

  it('el nombre de la copia nunca pasa del máximo permitido', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'public', name: 'x'.repeat(100) }));
    repository.duplicate.mockResolvedValue('copia-1');

    await service.duplicate('mazo-1', 'duena');

    const [, , { name }] = repository.duplicate.mock.calls[0] as [string, string, { name: string }];
    expect(name).toHaveLength(100);
    expect(name.startsWith('Copia de ')).toBe(true);
  });

  it('solo su dueño puede editar el mazo (viewerCanEdit)', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'public', ownerId: 'duena' }));

    await expect(service.getById('mazo-1', 'duena')).resolves.toMatchObject({
      viewerCanEdit: true,
    });
    await expect(service.getById('mazo-1', 'otra')).resolves.toMatchObject({
      viewerCanEdit: false,
    });
    await expect(service.getById('mazo-1')).resolves.toMatchObject({ viewerCanEdit: false });
  });

  it('no deja añadir cartas que no están en el catálogo, y no escribe nada', async () => {
    repository.findOwnerId.mockResolvedValue('duena');
    cards.findExistingIds.mockResolvedValue(new Set(['conocida']));

    await expect(
      service.updateEntries('mazo-1', 'duena', {
        changes: [
          { cardId: 'conocida', board: 'main', quantity: 1 },
          { cardId: 'inventada', board: 'main', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(/inventada/);
    expect(repository.applyEntryChanges).not.toHaveBeenCalled();
  });

  it('quitar una carta no exige que siga en el catálogo', async () => {
    repository.findOwnerId.mockResolvedValue('duena');
    repository.findById.mockResolvedValue(deckRow());
    cards.findExistingIds.mockResolvedValue(new Set());

    await service.updateEntries('mazo-1', 'duena', {
      changes: [{ cardId: 'retirada', board: 'main', quantity: 0 }],
    });

    expect(repository.applyEntryChanges).toHaveBeenCalledWith('mazo-1', [
      { cardId: 'retirada', board: 'main', quantity: 0 },
    ]);
  });

  it('no deja editar las cartas de un mazo ajeno', async () => {
    repository.findOwnerId.mockResolvedValue('duena');

    await expect(
      service.updateEntries('mazo-1', 'otra', {
        changes: [{ cardId: 'x', board: 'main', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve las fechas en ISO 8601', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'public' }));

    const deck = await service.getById('mazo-1');

    expect(deck.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('mergeEntries', () => {
  it('suma las líneas repetidas de la misma carta en la misma zona', () => {
    const island = '00000000-0000-0000-0000-000000000001';

    expect(
      mergeEntries([
        { cardId: island, board: 'main', quantity: 2 },
        { cardId: island, board: 'main', quantity: 1 },
        { cardId: island, board: 'sideboard', quantity: 1 },
      ]),
    ).toEqual([
      { cardId: island, board: 'main', quantity: 3 },
      { cardId: island, board: 'sideboard', quantity: 1 },
    ]);
  });
});

describe('lastChangePerEntry', () => {
  it('si una carta y zona se repite, gana el último cambio', () => {
    expect(
      lastChangePerEntry([
        { cardId: 'a', board: 'main', quantity: 3 },
        { cardId: 'a', board: 'sideboard', quantity: 1 },
        { cardId: 'a', board: 'main', quantity: 0 },
      ]),
    ).toEqual([
      { cardId: 'a', board: 'main', quantity: 0 },
      { cardId: 'a', board: 'sideboard', quantity: 1 },
    ]);
  });
});
