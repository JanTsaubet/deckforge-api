import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CardDto } from '../../cards/dto/card.dto.js';
import { DECK_BOARDS, type DeckBoard } from '../deck.constants.js';

/** Cuántas versiones se devuelven si no se pide otra cosa. */
export const DEFAULT_VERSIONS_LIMIT = 30;
export const MAX_VERSIONS_LIMIT = 100;

export class VersionsQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_VERSIONS_LIMIT,
    default: DEFAULT_VERSIONS_LIMIT,
    description: 'Versiones que se devuelven, de la más reciente hacia atrás',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VERSIONS_LIMIT)
  limit?: number;
}

/** Una carta que cambió: de cuántas copias a cuántas, y en qué zona. */
export class DeckVersionChangeDto {
  @ApiProperty({ description: 'Id de Scryfall de la impresión' })
  cardId!: string;

  @ApiProperty({ enum: DECK_BOARDS })
  board!: DeckBoard;

  @ApiProperty({ description: 'Copias que había antes; 0 si la carta no estaba' })
  from!: number;

  @ApiProperty({ description: 'Copias que hay ahora; 0 si se quitó' })
  to!: number;

  @ApiProperty({
    type: CardDto,
    nullable: true,
    description: 'Datos de la carta; null si el catálogo local ya no la conoce',
  })
  card!: CardDto | null;
}

/**
 * Una versión del mazo: los cambios de una tanda de edición, no una copia del mazo entero.
 * Mover una carta de zona son dos cambios, el que la quita y el que la pone.
 */
export class DeckVersionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'date-time', description: 'Cuándo empezaron los cambios' })
  createdAt!: string;

  @ApiProperty({ type: [DeckVersionChangeDto] })
  changes!: DeckVersionChangeDto[];
}
