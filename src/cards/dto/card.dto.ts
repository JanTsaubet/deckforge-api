import { ApiProperty } from '@nestjs/swagger';
import { MANA_COLORS } from '../colors.js';

type ManaColor = (typeof MANA_COLORS)[number];

/** Una impresión del catálogo, con lo que necesitan el editor y la vista de un mazo. */
export class CardDto {
  @ApiProperty({ description: 'Id de Scryfall de la impresión' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  oracleId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  layout!: string;

  @ApiProperty({ type: String, nullable: true, example: '{2}{R}{R}' })
  manaCost!: string | null;

  @ApiProperty({ description: 'Valor de maná (antes CMC)' })
  manaValue!: number;

  @ApiProperty({ example: 'Legendary Creature — Goblin Warrior' })
  typeLine!: string;

  @ApiProperty({ type: String, nullable: true })
  oracleText!: string | null;

  @ApiProperty({ enum: MANA_COLORS, isArray: true })
  colors!: ManaColor[];

  @ApiProperty({ enum: MANA_COLORS, isArray: true })
  colorIdentity!: ManaColor[];

  @ApiProperty()
  rarity!: string;

  @ApiProperty()
  setCode!: string;

  @ApiProperty()
  setName!: string;

  @ApiProperty()
  collectorNumber!: string;

  @ApiProperty({ type: String, nullable: true })
  imageSmall!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageNormal!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageArtCrop!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Precio en euros (Cardmarket)' })
  priceEur!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Precio en dólares (TCGplayer)' })
  priceUsd!: number | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { commander: 'legal', modern: 'not_legal' },
  })
  legalities!: Record<string, string>;

  @ApiProperty({ description: 'En la lista de "Game Changers" de Commander' })
  gameChanger!: boolean;
}
