import { z, type ZodObject, type ZodRawShape } from 'zod';

/** Token de inyección de la configuración validada. */
export const ENV = Symbol('ENV');

/** Lo que necesita cualquier proceso que use la base de datos. */
const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

/** La API HTTP. */
const envSchema = databaseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(4000),
  BETTER_AUTH_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
});

/**
 * El worker. No recibe los secretos de la API: cada proceso tiene solo lo que usa.
 *
 * Scryfall publica los _bulk data_ una vez al día, hacia las 09:00 UTC; la sincronización
 * se programa después, a las 10:00 UTC por defecto.
 */
const workerEnvSchema = databaseEnvSchema.extend({
  SCRYFALL_API_URL: z.url().default('https://api.scryfall.com'),
  SCRYFALL_USER_AGENT: z.string().min(1).default('DeckForge/0.1'),
  CARD_SYNC_CRON: z.string().min(1).default('0 0 10 * * *'),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type Env = z.infer<typeof envSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/**
 * Valida las variables de entorno al arrancar. Si falta alguna o es inválida,
 * el proceso no llega a levantarse y el error dice exactamente cuál.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(envSchema, source);
}

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parseEnv(workerEnvSchema, source);
}

function parseEnv<Shape extends ZodRawShape>(
  schema: ZodObject<Shape>,
  source: NodeJS.ProcessEnv,
): z.infer<ZodObject<Shape>> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno no válidas:\n${details}`);
  }

  return result.data;
}
