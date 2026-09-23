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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import {
  DeckVersionDto,
  DEFAULT_VERSIONS_LIMIT,
  VersionsQueryDto,
} from './dto/deck-version.dto.js';
import { DeckDto, DeckSummaryDto } from './dto/deck.dto.js';
import { UpdateDeckDto } from './dto/update-deck.dto.js';
import { UpdateEntriesDto } from './dto/update-entries.dto.js';

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

  /** Historial del mazo: qué cartas cambiaron y cuándo. Solo para su dueño. */
  @Get(':id/versions')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: [DeckVersionDto], description: 'Versiones, la más reciente primero' })
  @ApiNotFoundResponse({ description: 'No existe o no es tuyo' })
  listVersions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Query() query: VersionsQueryDto,
  ): Promise<DeckVersionDto[]> {
    return this.decks.listVersions(id, user.id, query.limit ?? DEFAULT_VERSIONS_LIMIT);
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

  /** Añadir, quitar o mover cartas. Cada cambio fija la cantidad final de una carta en una zona. */
  @Patch(':id/entries')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: DeckDto, description: 'El mazo con los cambios aplicados' })
  @ApiBadRequestResponse({ description: 'Carta que no existe o demasiadas cartas distintas' })
  @ApiNotFoundResponse({ description: 'No existe o no es tuyo' })
  updateEntries(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateEntriesDto,
  ): Promise<DeckDto> {
    return this.decks.updateEntries(id, user.id, dto);
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
