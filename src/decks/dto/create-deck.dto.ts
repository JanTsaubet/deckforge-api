import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DECK_BOARDS,
  DECK_FORMATS,
  DECK_VISIBILITIES,
  DEFAULT_DECK_FORMAT,
  DEFAULT_DECK_VISIBILITY,
  MAX_DECK_ENTRIES,
  MAX_DECK_NAME_LENGTH,
  MAX_DECK_TAGS,
  MAX_ENTRY_QUANTITY,
  MAX_TAG_LENGTH,
  type DeckBoard,
  type DeckFormat,
  type DeckVisibility,
} from '../deck.constants.js';
import { normalizeTags } from './normalize-tags.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Una línea de la lista de cartas al crear un mazo (por ejemplo, al importarlo). */
export class DeckEntryInputDto {
  @ApiProperty({ format: 'uuid', description: 'Id de Scryfall de la impresión' })
  @IsUUID()
  cardId!: string;

  @ApiProperty({ enum: DECK_BOARDS })
  @IsIn(DECK_BOARDS)
  board!: DeckBoard;

  @ApiProperty({ minimum: 1, maximum: MAX_ENTRY_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_ENTRY_QUANTITY)
  quantity!: number;
}

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

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Carpeta de la biblioteca; `null` lo saca de la que tenga',
  })
  @IsOptional()
  @IsUUID()
  folderId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_DECK_TAGS,
    description: 'Se guardan en minúsculas y sin repetir',
  })
  @Transform(normalizeTags)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DECK_TAGS)
  @IsString({ each: true })
  @Length(1, MAX_TAG_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: [DeckEntryInputDto],
    maxItems: MAX_DECK_ENTRIES,
    description: 'Cartas iniciales. Las líneas repetidas (misma carta y zona) se suman.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DECK_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => DeckEntryInputDto)
  entries?: DeckEntryInputDto[];
}
