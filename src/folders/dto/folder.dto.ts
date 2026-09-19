import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { MAX_FOLDER_NAME_LENGTH } from '../../decks/deck.constants.js';

export class FolderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'cEDH' })
  name!: string;

  @ApiProperty({ description: 'Mazos que contiene' })
  deckCount!: number;
}

/** Crear y renombrar piden lo mismo: solo el nombre. */
export class SaveFolderDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_FOLDER_NAME_LENGTH, example: 'cEDH' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @Length(1, MAX_FOLDER_NAME_LENGTH)
  name!: string;
}
