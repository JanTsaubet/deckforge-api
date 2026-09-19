import { z } from 'zod';

/** Token de inyección de la configuración validada. */
export const ENV = Symbol('ENV');

/** Lo que necesita cualquier proceso que use la base de datos. */
const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

/** Un texto opcional: vacío cuenta como no definido (así funciona `GOOGLE_CLIENT_ID=` en .env). */
const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

/**
 * La API HTTP. Los proveedores OAuth son opcionales: cada uno se activa solo si tiene su id
 * y su secreto. Con uno de los dos sin el otro, la API no arranca (es casi seguro un error).
 */
const envSchema = databaseEnvSchema
  .extend({
    PORT: z.coerce.number().int().positive().default(4000),
    BETTER_AUTH_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
    BETTER_AUTH_URL: z.url(),
    WEB_ORIGIN: z.url(),
    GOOGLE_CLIENT_ID: optionalText,
    GOOGLE_CLIENT_SECRET: optionalText,
    DISCORD_CLIENT_ID: optionalText,
    DISCORD_CLIENT_SECRET: optionalText,
  })
  .superRefine((env, ctx) => {
    for (const provider of ['GOOGLE', 'DISCORD'] as const) {
      const id = env[`${provider}_CLIENT_ID`];
      const secret = env[`${provider}_CLIENT_SECRET`];
      if (Boolean(id) !== Boolean(secret)) {
        ctx.addIssue({
          code: 'custom',
          path: [id ? `${provider}_CLIENT_SECRET` : `${provider}_CLIENT_ID`],
          message: `falta: ${provider} necesita id y secreto, o ninguno de los dos`,
        });
      }
    }
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

function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: NodeJS.ProcessEnv,
): z.infer<Schema> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno no válidas:\n${details}`);
  }

  return result.data;
}
