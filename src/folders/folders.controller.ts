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
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SessionUser } from '../auth/auth.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { FolderDto, SaveFolderDto } from './dto/folder.dto.js';
import { FoldersService } from './folders.service.js';

/** Las carpetas son privadas: todas las rutas exigen sesión. */
@ApiTags('folders')
@ApiCookieAuth()
@ApiUnauthorizedResponse()
@UseGuards(AuthGuard)
@Controller('v1/folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  @ApiOkResponse({ type: [FolderDto], description: 'Carpetas del usuario, por nombre' })
  listMine(@CurrentUser() user: SessionUser): Promise<FolderDto[]> {
    return this.folders.listMine(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: FolderDto })
  @ApiConflictResponse({ description: 'Ya tienes una carpeta con ese nombre' })
  create(@CurrentUser() user: SessionUser, @Body() dto: SaveFolderDto): Promise<FolderDto> {
    return this.folders.create(user.id, dto.name);
  }

  @Patch(':id')
  @ApiOkResponse({ type: FolderDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Ya tienes una carpeta con ese nombre' })
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SaveFolderDto,
  ): Promise<FolderDto> {
    return this.folders.rename(id, user.id, dto.name);
  }

  /** Borra la carpeta, no sus mazos: esos vuelven a "sin carpeta". */
  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: SessionUser): Promise<void> {
    return this.folders.remove(id, user.id);
  }
}
