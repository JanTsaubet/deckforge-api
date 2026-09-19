import { PGlite } from '@electric-sql/pglite';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ENV, type Env } from '../../src/config/env.js';
import {
  DATABASE_CONNECTION,
  type Database,
  type DatabaseConnection,
} from '../../src/database/database.js';
import * as schema from '../../src/database/schema/index.js';

/** Origen de la web: Better Auth solo acepta peticiones de orígenes de confianza. */
export const WEB_ORIGIN = 'http://localhost:3000';

const TEST_ENV: Env = {
  PORT: 0,
  DATABASE_URL: 'pglite://memoria',
  BETTER_AUTH_SECRET: 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres',
  BETTER_AUTH_URL: WEB_ORIGIN,
  WEB_ORIGIN,
};

/**
 * Un Postgres en memoria (PGlite) con las migraciones reales aplicadas. Cada llamada crea
 * una base de datos nueva: los ficheros de test no se pisan.
 */
export async function createTestDatabase(): Promise<DatabaseConnection> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  // PGlite y node-postgres exponen la misma API de Drizzle; solo cambia el driver.
  return { db: db as unknown as Database, close: () => client.close() };
}

/** Levanta la API completa contra una base de datos de `createTestDatabase`. */
export async function createTestApp(): Promise<NestExpressApplication> {
  const connection = await createTestDatabase();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(TEST_ENV)
    .overrideProvider(DATABASE_CONNECTION)
    .useValue(connection)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

export interface TestUser {
  cookie: string;
  username: string;
  email: string;
}

export interface SignUpData {
  name: string;
  username: string;
  email: string;
  password: string;
}

let userCounter = 0;

/** Datos de registro únicos para cada llamada. */
export function newUserData(overrides: Partial<SignUpData> = {}): SignUpData {
  userCounter += 1;
  const username = overrides.username ?? `jugador${userCounter}`;
  return {
    name: `Jugador ${userCounter}`,
    username,
    email: `${username}@deckforge.test`,
    password: 'una-contrasena-segura',
    ...overrides,
  };
}

/** Registra un usuario nuevo y devuelve la cookie de sesión que deja Better Auth. */
export async function signUp(
  app: NestExpressApplication,
  overrides: Partial<SignUpData> = {},
): Promise<TestUser> {
  const data = newUserData(overrides);
  const response = await request(app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .set('Origin', WEB_ORIGIN)
    .send(data)
    .expect(200);

  return {
    cookie: sessionCookie(response.headers['set-cookie']),
    username: data.username,
    email: data.email,
  };
}

function sessionCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const session = cookies.find((cookie) => cookie.startsWith('better-auth.session_token='));
  if (!session) throw new Error('El registro no devolvió una cookie de sesión');
  return session.split(';')[0];
}
