import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

/** Tokens de inyección de la base de datos. */
export const DATABASE = Symbol('DATABASE');
export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

export type Database = NodePgDatabase<typeof schema>;

/** Base de datos más la forma de cerrarla: permite sustituirla en los tests. */
export interface DatabaseConnection {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Conexión a Postgres. El pool abre conexiones bajo demanda, así que la API arranca
 * aunque la base de datos todavía no esté levantada (fallará al primer uso, no antes).
 */
export function connectPostgres(url: string): DatabaseConnection {
  const pool = new Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
