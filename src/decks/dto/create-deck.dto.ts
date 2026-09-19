import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import {
  DECK_FORMATS,
  DECK_VISIBILITIES,
  DEFAULT_DECK_FORMAT,
  DEFAULT_DECK_VISIBILITY,
  MAX_DECK_NAME_LENGTH,
  type DeckFormat,
  type DeckVisibility,
} from '../deck.constants.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Sin valores por defecto en las propiedades a propósito: `UpdateDeckDto` hereda de esta
 * clase y heredaría también esos valores, sobrescribiendo campos que el PATCH no envía.
 * Los valores por defecto se aplican en el servicio.
 */
export class CreateDeckDto {
  @ApiProperty({ example: 'Atraxa, superamigos', minLength: 1, maxLength: MAX_DECK_NAME_LENGTH })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_DECK_NAME_LENGTH)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: DECK_FORMATS, default: DEFAULT_DECK_FORMAT })
  @IsOptional()
  @IsIn(DECK_FORMATS)
  format?: DeckFormat;

  @ApiPropertyOptional({ enum: DECK_VISIBILITIES, default: DEFAULT_DECK_VISIBILITY })
  @IsOptional()
  @IsIn(DECK_VISIBILITIES)
  visibility?: DeckVisibility;
}
