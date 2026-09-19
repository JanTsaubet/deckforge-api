import { z } from 'zod';

/** Token de inyección de la configuración validada. */
export const ENV = Symbol('ENV');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno al arrancar. Si falta alguna o es inválida,
 * la API no llega a levantarse y el error dice exactamente cuál.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno no válidas:\n${details}`);
  }

  return result.data;
}
