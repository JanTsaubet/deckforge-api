import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDeckDto } from './create-deck.dto.js';

/**
 * Todos los campos son opcionales: solo se cambian los que llegan. Las cartas no se tocan
 * aquí; tendrán sus propias operaciones (añadir, quitar, mover de zona) en el editor.
 */
export class UpdateDeckDto extends PartialType(OmitType(CreateDeckDto, ['entries'] as const)) {}
