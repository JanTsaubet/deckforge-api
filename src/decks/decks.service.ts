import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_DECK_FORMAT,
  DEFAULT_DECK_VISIBILITY,
  MAX_DECK_NAME_LENGTH,
} from './deck.constants.js';
import { FoldersService } from '../folders/folders.service.js';
import { EMPTY_CARD_SUMMARY, summarizeByDeck, type DeckCardSummary } from './deck-card-summary.js';
import {
  DecksRepository,
  type DeckEntryRow,
  type DeckRow,
  type NewDeckEntry,
} from './decks.repository.js';
import type { CreateDeckDto } from './dto/create-deck.dto.js';
import type { DeckDto, DeckSummaryDto, ManaColor } from './dto/deck.dto.js';
import type { UpdateDeckDto } from './dto/update-deck.dto.js';

/**
 * Reglas de negocio de los mazos.
 *
 * Un mazo privado solo existe para su dueño: a cualquier otro se le responde 404, no 403,
 * para no revelar siquiera que existe. Lo mismo al intentar editar o borrar uno ajeno.
 */
@Injectable()
export class DecksService {
  constructor(
    private readonly repository: DecksRepository,
    private readonly folders: FoldersService,
  ) {}

  async listMine(ownerId: string): Promise<DeckSummaryDto[]> {
    const rows = await this.repository.listByOwner(ownerId);
    const summaries = summarizeByDeck(
      await this.repository.findCardFacts(rows.map((row) => row.id)),
    );
    return rows.map((row) => toSummaryDto(row, summaries.get(row.id)));
  }

  async create(ownerId: string, dto: CreateDeckDto): Promise<DeckDto> {
    if (dto.folderId) await this.folders.assertCanUse(dto.folderId, ownerId);

    const id = await this.repository.create(
      ownerId,
      {
        name: dto.name,
        description: dto.description ?? null,
        format: dto.format ?? DEFAULT_DECK_FORMAT,
        visibility: dto.visibility ?? DEFAULT_DECK_VISIBILITY,
        folderId: dto.folderId ?? null,
        tags: dto.tags ?? [],
      },
      mergeEntries(dto.entries ?? []),
    );
    return this.getById(id, ownerId);
  }

  /** `viewerId` es `undefined` para las peticiones anónimas. */
  async getById(id: string, viewerId?: string): Promise<DeckDto> {
    const deck = await this.repository.findById(id);
    if (!deck || !canView(deck, viewerId)) throw deckNotFound();

    const [entries, facts] = await Promise.all([
      this.repository.findEntries(id),
      this.repository.findCardFacts([id]),
    ]);
    return toDeckDto(deck, entries, summarizeByDeck(facts).get(id));
  }

  async update(id: string, ownerId: string, dto: UpdateDeckDto): Promise<DeckDto> {
    await this.assertOwner(id, ownerId);
    // `null` saca el mazo de su carpeta; solo hay que comprobar cuando se mete en una.
    if (dto.folderId) await this.folders.assertCanUse(dto.folderId, ownerId);

    await this.repository.update(id, {
      name: dto.name,
      description: dto.description,
      format: dto.format,
      visibility: dto.visibility,
      folderId: dto.folderId,
      tags: dto.tags,
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

    const copyId = await this.repository.duplicate(id, viewerId, {
      name: copyName(source.name),
      // Las carpetas son de cada biblioteca: la copia de un mazo ajeno empieza sin carpeta.
      folderId: source.ownerId === viewerId ? source.folderId : null,
    });
    return this.getById(copyId, viewerId);
  }

  private async assertOwner(id: string, ownerId: string): Promise<void> {
    const deckOwnerId = await this.repository.findOwnerId(id);
    if (deckOwnerId !== ownerId) throw deckNotFound();
  }
}

/**
 * Junta las líneas repetidas (misma carta en la misma zona) sumando cantidades. Pasa, por
 * ejemplo, al importar una lista con "2 Island" y "1 Island" en líneas separadas; sin esto
 * la clave primaria de `deck_entries` rechazaría el mazo entero.
 */
export function mergeEntries(entries: NewDeckEntry[]): NewDeckEntry[] {
  const merged = new Map<string, NewDeckEntry>();
  for (const entry of entries) {
    const key = `${entry.board}:${entry.cardId}`;
    const existing = merged.get(key);
    merged.set(key, { ...entry, quantity: (existing?.quantity ?? 0) + entry.quantity });
  }
  return [...merged.values()];
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

function toSummaryDto(
  row: DeckRow,
  cardSummary: DeckCardSummary = EMPTY_CARD_SUMMARY,
): DeckSummaryFields {
  return {
    id: row.id,
    ownerUsername: row.ownerUsername,
    name: row.name,
    format: row.format,
    visibility: row.visibility,
    folderId: row.folderId,
    tags: row.tags,
    cardCount: row.cardCount,
    colorIdentity: cardSummary.colorIdentity as ManaColor[],
    coverImageUrl: cardSummary.coverImageUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDeckDto(row: DeckRow, entries: DeckEntryRow[], cardSummary?: DeckCardSummary): DeckDto {
  return {
    ...toSummaryDto(row, cardSummary),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    entries,
  };
}
