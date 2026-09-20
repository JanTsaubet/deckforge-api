import { ApiProperty } from '@nestjs/swagger';
import { MANA_COLORS } from '../../cards/colors.js';
import { CardDto } from '../../cards/dto/card.dto.js';
import {
  DECK_BOARDS,
  DECK_FORMATS,
  DECK_VISIBILITIES,
  type DeckBoard,
  type DeckFormat,
  type DeckVisibility,
} from '../deck.constants.js';

export type ManaColor = (typeof MANA_COLORS)[number];

/** Resumen de un mazo para listados (biblioteca, búsqueda, perfiles). */
export class DeckSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Nombre de usuario del dueño', example: 'planeswalker' })
  ownerUsername!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: DECK_FORMATS })
  format!: DeckFormat;

  @ApiProperty({ enum: DECK_VISIBILITIES })
  visibility!: DeckVisibility;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  folderId!: string | null;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ description: 'Suma de las cantidades de todas las zonas' })
  cardCount!: number;

  @ApiProperty({
    enum: MANA_COLORS,
    isArray: true,
    description: 'Identidad de color en orden WUBRG: la del comandante, o la de todo el mazo',
  })
  colorIdentity!: ManaColor[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ilustración de portada: la del comandante, o la carta de más coste',
  })
  coverImageUrl!: string | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class DeckEntryDto {
  @ApiProperty({ description: 'Id de Scryfall de la impresión' })
  cardId!: string;

  @ApiProperty({ enum: DECK_BOARDS })
  board!: DeckBoard;

  @ApiProperty({ minimum: 1 })
  quantity!: number;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({
    type: CardDto,
    nullable: true,
    description: 'Datos de la carta; null si el catálogo local aún no la conoce',
  })
  card!: CardDto | null;
}

/** Mazo completo, con sus cartas. */
export class DeckDto extends DeckSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: [DeckEntryDto] })
  entries!: DeckEntryDto[];

  @ApiProperty({ description: 'Si quien lo pide puede editarlo (es su dueño)' })
  viewerCanEdit!: boolean;
}
