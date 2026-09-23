import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { STAPLE_ROLES, type StapleRole } from '../cards.repository.js';
import { CardDto } from './card.dto.js';

export class StaplesQueryDto {
  @ApiPropertyOptional({
    description:
      'Identidad de color del comandante, p. ej. `RG`. `C` = solo incoloras. Sin ella, no se filtra.',
    example: 'RG',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @Matches(/^(C|[WUBRG]{1,5})$/, { message: 'identity debe ser C o letras de WUBRG' })
  identity?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 20,
    default: 12,
    description: 'Cartas por función. Se piden de más para poder descartar las que ya están.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

/** Las cartas más jugadas de una función, para el bloque de recomendaciones del editor. */
export class StapleGroupDto {
  @ApiProperty({ enum: STAPLE_ROLES })
  role!: StapleRole;

  @ApiProperty({ type: [CardDto], description: 'Las más jugadas primero' })
  cards!: CardDto[];
}
