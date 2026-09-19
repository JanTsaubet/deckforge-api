import { NotFoundException } from '@nestjs/common';
import type { DecksRepository, DeckRow } from './decks.repository.js';
import { DecksService } from './decks.service.js';

function deckRow(overrides: Partial<DeckRow> = {}): DeckRow {
  return {
    id: 'mazo-1',
    ownerId: 'duena',
    ownerUsername: 'duena',
    name: 'Mazo de prueba',
    description: null,
    format: 'commander',
    visibility: 'private',
    cardCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('DecksService', () => {
  let repository: {
    listByOwner: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findOwnerId: ReturnType<typeof vi.fn>;
    findEntries: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let service: DecksService;

  beforeEach(() => {
    repository = {
      listByOwner: vi.fn(),
      findById: vi.fn(),
      findOwnerId: vi.fn(),
      findEntries: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    service = new DecksService(repository as unknown as DecksRepository);
  });

  it('al crear un mazo aplica Commander y privado por defecto', async () => {
    repository.create.mockResolvedValue('mazo-1');
    repository.findById.mockResolvedValue(deckRow());

    await service.create('duena', { name: 'Nuevo' });

    expect(repository.create).toHaveBeenCalledWith('duena', {
      name: 'Nuevo',
      description: null,
      format: 'commander',
      visibility: 'private',
    });
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

  it('devuelve las fechas en ISO 8601', async () => {
    repository.findById.mockResolvedValue(deckRow({ visibility: 'public' }));

    const deck = await service.getById('mazo-1');

    expect(deck.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
