import { defineConfig } from 'drizzle-kit';

// drizzle-kit no lee .env por su cuenta; si no existe (p. ej. en CI) se usan las variables del entorno.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se sigue con lo que haya en el entorno.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://deckforge:deckforge@localhost:5432/deckforge',
  },
  strict: true,
  verbose: true,
});
