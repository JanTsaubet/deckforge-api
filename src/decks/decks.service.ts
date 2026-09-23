import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CardsRepository } from '../cards/cards.repository.js';
import type { CardDto } from '../cards/dto/card.dto.js';
import {
  DECK_BOARDS,
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
  type EntryChange,
  type NewDeckEntry,
  TooManyEntriesError,
} from './decks.repository.js';
import type { CreateDeckDto } from './dto/create-deck.dto.js';
import type { DeckVersionChangeDto, DeckVersionDto } from './dto/deck-version.dto.js';
import type { DeckDto, DeckSummaryDto, ManaColor } from './dto/deck.dto.js';
import type { UpdateDeckDto } from './dto/update-deck.dto.js';
import type { UpdateEntriesDto } from './dto/update-entries.dto.js';

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
    private readonly cards: CardsRepository,
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
    const cards = await this.cards.findByIds([...new Set(entries.map((entry) => entry.cardId))]);

    return toDeckDto(deck, entries, {
      cardSummary: summarizeByDeck(facts).get(id),
      cardsById: new Map(cards.map((card) => [card.id, card])),
      viewerCanEdit: deck.ownerId === viewerId,
    });
  }

  /**
   * Cambia las cartas del mazo (lo usa el guardado automático del editor). Solo se pueden
   * añadir cartas que existan en el catálogo; quitar (cantidad 0) vale para cualquiera.
   */
  async updateEntries(id: string, ownerId: string, dto: UpdateEntriesDto): Promise<DeckDto> {
    await this.assertOwner(id, ownerId);
    const changes = lastChangePerEntry(dto.changes);

    const added = changes.filter((change) => change.quantity > 0).map((change) => change.cardId);
    const known = await this.cards.findExistingIds([...new Set(added)]);
    const unknown = added.filter((cardId) => !known.has(cardId));
    if (unknown.length > 0) {
      throw new BadRequestException(`Cartas que no existen en el catálogo: ${unknown.join(', ')}`);
    }

    try {
      await this.repository.applyEntryChanges(id, changes);
    } catch (error) {
      if (error instanceof TooManyEntriesError) throw new BadRequestException(error.message);
      throw error;
    }
    return this.getById(id, ownerId);
  }

  /**
   * Historial del mazo, solo para su dueño: qué cambió y cuándo. Es información de cómo se
   * ha construido, y eso no se comparte con quien solo tiene el enlace del mazo.
   */
  async listVersions(id: string, ownerId: string, limit: number): Promise<DeckVersionDto[]> {
    await this.assertOwner(id, ownerId);
    const versions = await this.repository.listVersions(id, limit);

    // Los datos de las cartas de todas las versiones, en una sola consulta.
    const cardIds = new Set(
      versions.flatMap((version) => version.changes.map((change) => change.cardId)),
    );
    const cards = await this.cards.findByIds([...cardIds]);
    const cardsById = new Map(cards.map((card) => [card.id, card]));

    return versions.map((version) => ({
      id: version.id,
      createdAt: version.createdAt.toISOString(),
      // Por zonas y por nombre, como se lee el mazo; el orden en que se tocaron las cartas
      // dentro de una misma tanda de cambios no dice nada a quien lee el historial.
      changes: version.changes
        .map((change) => ({ ...change, card: cardsById.get(change.cardId) ?? null }))
        .sort(byBoardAndName),
    }));
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
 * Si la misma carta y zona aparece varias veces en una petición, vale el último cambio: es
 * el estado más reciente que tenía el editor.
 */
export function lastChangePerEntry(changes: EntryChange[]): EntryChange[] {
  const byEntry = new Map<string, EntryChange>();
  for (const change of changes) byEntry.set(`${change.board}:${change.cardId}`, change);
  return [...byEntry.values()];
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

/** Orden de lectura de los cambios de una versión: las zonas del mazo y, dentro, por nombre. */
function byBoardAndName(a: DeckVersionChangeDto, b: DeckVersionChangeDto): number {
  const boards = DECK_BOARDS.indexOf(a.board) - DECK_BOARDS.indexOf(b.board);
  return boards !== 0 ? boards : cardLabel(a).localeCompare(cardLabel(b), 'es');
}

/** El nombre de la carta o, si el catálogo ya no la conoce, su id (para no dejar de ordenar). */
function cardLabel(change: DeckVersionChangeDto): string {
  return change.card?.name ?? change.cardId;
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

interface DeckDetailExtras {
  cardSummary?: DeckCardSummary;
  cardsById: Map<string, CardDto>;
  viewerCanEdit: boolean;
}

function toDeckDto(
  row: DeckRow,
  entries: DeckEntryRow[],
  { cardSummary, cardsById, viewerCanEdit }: DeckDetailExtras,
): DeckDto {
  return {
    ...toSummaryDto(row, cardSummary),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    entries: entries.map((entry) => ({ ...entry, card: cardsById.get(entry.cardId) ?? null })),
    viewerCanEdit,
  };
}
