import { PartialType } from '@nestjs/swagger';
import { CreateDeckDto } from './create-deck.dto.js';

/** Todos los campos son opcionales: solo se cambian los que llegan. */
export class UpdateDeckDto extends PartialType(CreateDeckDto) {}
