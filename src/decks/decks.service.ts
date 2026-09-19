import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_DECK_FORMAT,
  DEFAULT_DECK_VISIBILITY,
  MAX_DECK_NAME_LENGTH,
} from './deck.constants.js';
import { DecksRepository, type DeckEntryRow, type DeckRow } from './decks.repository.js';
import type { CreateDeckDto } from './dto/create-deck.dto.js';
import type { DeckDto, DeckSummaryDto } from './dto/deck.dto.js';
import type { UpdateDeckDto } from './dto/update-deck.dto.js';

/**
 * Reglas de negocio de los mazos.
 *
 * Un mazo privado solo existe para su dueño: a cualquier otro se le responde 404, no 403,
 * para no revelar siquiera que existe. Lo mismo al intentar editar o borrar uno ajeno.
 */
@Injectable()
export class DecksService {
  constructor(private readonly repository: DecksRepository) {}

  async listMine(ownerId: string): Promise<DeckSummaryDto[]> {
    const rows = await this.repository.listByOwner(ownerId);
    return rows.map(toSummaryDto);
  }

  async create(ownerId: string, dto: CreateDeckDto): Promise<DeckDto> {
    const id = await this.repository.create(ownerId, {
      name: dto.name,
      description: dto.description ?? null,
      format: dto.format ?? DEFAULT_DECK_FORMAT,
      visibility: dto.visibility ?? DEFAULT_DECK_VISIBILITY,
    });
    return this.getById(id, ownerId);
  }

  /** `viewerId` es `undefined` para las peticiones anónimas. */
  async getById(id: string, viewerId?: string): Promise<DeckDto> {
    const deck = await this.repository.findById(id);
    if (!deck || !canView(deck, viewerId)) throw deckNotFound();

    const entries = await this.repository.findEntries(id);
    return toDeckDto(deck, entries);
  }

  async update(id: string, ownerId: string, dto: UpdateDeckDto): Promise<DeckDto> {
    await this.assertOwner(id, ownerId);
    await this.repository.update(id, {
      name: dto.name,
      description: dto.description,
      format: dto.format,
      visibility: dto.visibility,
    });
    return this.getById(id, ownerId);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.assertOwner(id, ownerId);
    await this.repository.delete(id);
  }

  /**
   * Copia un mazo a la biblioteca de `viewerId`: sirve para duplicar uno propio y para
   * guardarse uno público de otra persona. Lo que no se puede ver, no se puede copiar.
   */
  async duplicate(id: string, viewerId: string): Promise<DeckDto> {
    const source = await this.repository.findById(id);
    if (!source || !canView(source, viewerId)) throw deckNotFound();

    const copyId = await this.repository.duplicate(id, viewerId, copyName(source.name));
    return this.getById(copyId, viewerId);
  }

  private async assertOwner(id: string, ownerId: string): Promise<void> {
    const deckOwnerId = await this.repository.findOwnerId(id);
    if (deckOwnerId !== ownerId) throw deckNotFound();
  }
}

/** "Copia de …", recortado para no pasar del máximo que admite un nombre. */
function copyName(name: string): string {
  return `Copia de ${name}`.slice(0, MAX_DECK_NAME_LENGTH);
}

function canView(deck: DeckRow, viewerId: string | undefined): boolean {
  return deck.visibility !== 'private' || deck.ownerId === viewerId;
}

function deckNotFound(): NotFoundException {
  return new NotFoundException('Mazo no encontrado');
}

/**
 * Los campos del resumen como objeto plano. Tiparlo como la clase DTO haría creer al linter
 * que se esparce una instancia de clase (y se perdería su prototipo) al construir el detalle.
 */
type DeckSummaryFields = Pick<DeckSummaryDto, keyof DeckSummaryDto>;

function toSummaryDto(row: DeckRow): DeckSummaryFields {
  return {
    id: row.id,
    ownerUsername: row.ownerUsername,
    name: row.name,
    format: row.format,
    visibility: row.visibility,
    cardCount: row.cardCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDeckDto(row: DeckRow, entries: DeckEntryRow[]): DeckDto {
  return {
    ...toSummaryDto(row),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    entries,
  };
}
