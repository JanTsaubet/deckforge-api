import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DECK_BOARDS, MAX_ENTRY_QUANTITY, type DeckBoard } from '../deck.constants.js';

/** Máximo de cambios por petición: de sobra para el guardado automático del editor. */
export const MAX_ENTRY_CHANGES = 200;

export class EntryChangeDto {
  @ApiProperty({ format: 'uuid', description: 'Id de Scryfall de la impresión' })
  @IsUUID()
  cardId!: string;

  @ApiProperty({ enum: DECK_BOARDS })
  @IsIn(DECK_BOARDS)
  board!: DeckBoard;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_ENTRY_QUANTITY,
    description: 'Cantidad final de esa carta en esa zona. 0 la quita.',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_ENTRY_QUANTITY)
  quantity!: number;
}

/**
 * Cambios de cartas de un mazo. Mover una carta de zona son dos cambios: 0 en la de origen y
 * la cantidad en la de destino; al ir en la misma petición se aplican juntos.
 */
export class UpdateEntriesDto {
  @ApiProperty({ type: [EntryChangeDto], minItems: 1, maxItems: MAX_ENTRY_CHANGES })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ENTRY_CHANGES)
  @ValidateNested({ each: true })
  @Type(() => EntryChangeDto)
  changes!: EntryChangeDto[];
}
