import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { deckFolders, decks } from '../database/schema/index.js';

export interface FolderRow {
  id: string;
  name: string;
  deckCount: number;
}

/** Acceso a los datos de carpetas. Solo SQL: las reglas viven en `FoldersService`. */
@Injectable()
export class FoldersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Por nombre sin distinguir mayúsculas: el orden por defecto depende de la colación de la
   * base de datos, y con la "C" (la de PGlite, por ejemplo) "Zombis" iría antes que "cEDH".
   */
  listByOwner(ownerId: string): Promise<FolderRow[]> {
    return this.selectWithCount(eq(deckFolders.ownerId, ownerId)).orderBy(
      asc(sql`lower(${deckFolders.name})`),
    );
  }

  /** La carpeta, solo si es de `ownerId`: una ajena se trata igual que una inexistente. */
  async findOwned(id: string, ownerId: string): Promise<FolderRow | undefined> {
    const [row] = await this.selectWithCount(
      and(eq(deckFolders.id, id), eq(deckFolders.ownerId, ownerId)),
    );
    return row;
  }

  async create(ownerId: string, name: string): Promise<string> {
    const [row] = await this.db
      .insert(deckFolders)
      .values({ ownerId, name })
      .returning({ id: deckFolders.id });
    return row.id;
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db.update(deckFolders).set({ name }).where(eq(deckFolders.id, id));
  }

  /** Los mazos de la carpeta no se borran: la clave foránea los deja sin carpeta. */
  async delete(id: string): Promise<void> {
    await this.db.delete(deckFolders).where(eq(deckFolders.id, id));
  }

  private selectWithCount(where: SQL | undefined) {
    return this.db
      .select({ id: deckFolders.id, name: deckFolders.name, deckCount: count(decks.id) })
      .from(deckFolders)
      .leftJoin(decks, eq(decks.folderId, deckFolders.id))
      .where(where)
      .groupBy(deckFolders.id)
      .$dynamic();
  }
}
