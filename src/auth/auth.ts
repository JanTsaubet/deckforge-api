import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import type { Env } from '../config/env.js';
import type { Database } from '../database/database.js';
import * as authSchema from '../database/schema/auth.js';

/**
 * Configuración de Better Auth: cuentas con email y contraseña más nombre de usuario.
 *
 * `baseURL` es el origen de la WEB, no el de la API: el navegador habla con /api/auth a
 * través del frontend, que reenvía esas peticiones aquí. Así la cookie de sesión pertenece
 * al mismo origen que la web y no hace falta CORS con credenciales.
 */
export function createAuth(db: Database, env: Env) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: [env.WEB_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    plugins: [username()],
    // Better Auth desactiva estas protecciones por defecto cuando detecta que corre en un
    // entorno de test. Fijarlas aquí evita que la protección CSRF dependa de adivinar el
    // entorno, y hace que los tests e2e prueben la misma seguridad que corre en producción.
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Usuario de la sesión tal como lo devuelve Better Auth. */
export type SessionUser = Auth['$Infer']['Session']['user'];
