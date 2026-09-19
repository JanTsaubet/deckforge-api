import { ApiProperty } from '@nestjs/swagger';
import {
  DECK_BOARDS,
  DECK_FORMATS,
  DECK_VISIBILITIES,
  type DeckBoard,
  type DeckFormat,
  type DeckVisibility,
} from '../deck.constants.js';

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
}

/** Mazo completo, con sus cartas. */
export class DeckDto extends DeckSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: [DeckEntryDto] })
  entries!: DeckEntryDto[];
}
