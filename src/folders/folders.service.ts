import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation } from '../database/errors.js';
import type { FolderDto } from './dto/folder.dto.js';
import { FoldersRepository } from './folders.repository.js';

/**
 * Carpetas de la biblioteca. Como con los mazos, una carpeta ajena responde 404: no se
 * revela siquiera que exista.
 */
@Injectable()
export class FoldersService {
  constructor(private readonly repository: FoldersRepository) {}

  listMine(ownerId: string): Promise<FolderDto[]> {
    return this.repository.listByOwner(ownerId);
  }

  async create(ownerId: string, name: string): Promise<FolderDto> {
    const id = await this.withUniqueName(name, () => this.repository.create(ownerId, name));
    return this.getOwned(id, ownerId);
  }

  async rename(id: string, ownerId: string, name: string): Promise<FolderDto> {
    await this.getOwned(id, ownerId);
    await this.withUniqueName(name, () => this.repository.rename(id, name));
    return this.getOwned(id, ownerId);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.getOwned(id, ownerId);
    await this.repository.delete(id);
  }

  /**
   * Para los mazos: comprueba que la carpeta a la que se quiere mover un mazo es del usuario.
   * Es un 400 y no un 404 porque lo que falla es un dato del cuerpo, no el recurso de la URL.
   */
  async assertCanUse(folderId: string, ownerId: string): Promise<void> {
    const folder = await this.repository.findOwned(folderId, ownerId);
    if (!folder) throw new BadRequestException('La carpeta no existe');
  }

  private async getOwned(id: string, ownerId: string): Promise<FolderDto> {
    const folder = await this.repository.findOwned(id, ownerId);
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    return folder;
  }

  /** La base de datos garantiza que el nombre no se repite; aquí se traduce a un 409. */
  private async withUniqueName<T>(name: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Ya tienes una carpeta llamada «${name}»`);
      }
      throw error;
    }
  }
}
