import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { CardsRepository, STAPLE_ROLES } from './cards.repository.js';
import { CardDto } from './dto/card.dto.js';
import { StapleGroupDto, StaplesQueryDto } from './dto/staples.dto.js';

export class CardSearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'krenko' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  q!: string;

  @ApiPropertyOptional({
    description:
      'Solo cartas que quepan en esta identidad de color, p. ej. `RG`. `C` = solo incoloras.',
    example: 'RG',
  })
  @IsOptional()
  @Matches(/^(C|[WUBRG]{1,5})$/, { message: 'identity debe ser C o letras de WUBRG' })
  identity?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 25, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}

/** Catálogo de cartas. Es público: no hace falta sesión. */
@ApiTags('cards')
@Controller('v1/cards')
export class CardsController {
  constructor(private readonly cards: CardsRepository) {}

  /** Búsqueda por nombre para el editor, sobre el catálogo local (sin llamar a Scryfall). */
  @Get('search')
  @ApiOkResponse({
    type: [CardDto],
    description: 'Una impresión por carta, las más jugadas primero',
  })
  search(@Query() query: CardSearchQueryDto): Promise<CardDto[]> {
    return this.cards.search({
      query: query.q,
      limit: query.limit ?? 10,
      identity: query.identity === undefined ? undefined : parseIdentity(query.identity),
    });
  }

  /**
   * Quick adds: lo que casi todo mazo de esa identidad juega, por funciones. Es una consulta
   * por función; el editor las enseña juntas y descarta las cartas que el mazo ya tiene.
   */
  @Get('staples')
  @ApiOkResponse({
    type: [StapleGroupDto],
    description: 'Un grupo por función, en el orden en que se monta un mazo',
  })
  async staples(@Query() query: StaplesQueryDto): Promise<StapleGroupDto[]> {
    const identity = query.identity === undefined ? undefined : parseIdentity(query.identity);
    const limit = query.limit ?? 12;

    return Promise.all(
      STAPLE_ROLES.map(async (role) => ({
        role,
        cards: await this.cards.findStaples({ role, limit, identity }),
      })),
    );
  }
}

/** "RG" → ['R', 'G']; "C" (incolora) → []. */
function parseIdentity(identity: string): string[] {
  return identity === 'C' ? [] : identity.split('');
}
