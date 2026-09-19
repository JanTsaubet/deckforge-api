import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SessionUser } from '../auth/auth.js';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DecksService } from './decks.service.js';
import { CreateDeckDto } from './dto/create-deck.dto.js';
import { DeckDto, DeckSummaryDto } from './dto/deck.dto.js';
import { UpdateDeckDto } from './dto/update-deck.dto.js';

@ApiTags('decks')
@Controller('v1/decks')
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({
    type: [DeckSummaryDto],
    description: 'Mazos del usuario, los más recientes primero',
  })
  @ApiUnauthorizedResponse()
  listMine(@CurrentUser() user: SessionUser): Promise<DeckSummaryDto[]> {
    return this.decks.listMine(user.id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiCreatedResponse({ type: DeckDto })
  @ApiUnauthorizedResponse()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateDeckDto): Promise<DeckDto> {
    return this.decks.create(user.id, dto);
  }

  /** Copia un mazo propio, o uno público de otra persona, a tu biblioteca. */
  @Post(':id/duplicate')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiCreatedResponse({ type: DeckDto, description: 'La copia, que empieza siempre privada' })
  @ApiNotFoundResponse({ description: 'No existe o no lo puedes ver' })
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<DeckDto> {
    return this.decks.duplicate(id, user.id);
  }

  /** Accesible sin sesión: los mazos públicos y los ocultos con enlace se pueden compartir. */
  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOkResponse({ type: DeckDto })
  @ApiNotFoundResponse({ description: 'No existe o es privado de otro usuario' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<DeckDto> {
    return this.decks.getById(id, user?.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: DeckDto })
  @ApiNotFoundResponse({ description: 'No existe o no es tuyo' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateDeckDto,
  ): Promise<DeckDto> {
    return this.decks.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'No existe o no es tuyo' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser): Promise<void> {
    return this.decks.remove(id, user.id);
  }
}
