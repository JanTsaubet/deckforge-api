import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import type { Env } from '../config/env.js';
import type { Database } from '../database/database.js';
import * as authSchema from '../database/schema/auth.js';

/** Proveedores OAuth que DeckForge sabe usar. */
export const SOCIAL_PROVIDERS = ['google', 'discord'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** Los proveedores con credenciales en la configuración, en el orden en que se ofrecen. */
export function enabledSocialProviders(env: Env): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter((provider) => credentialsOf(env, provider) !== undefined);
}

function credentialsOf(env: Env, provider: SocialProvider) {
  const [clientId, clientSecret] =
    provider === 'google'
      ? [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET]
      : [env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/**
 * Configuración de Better Auth: cuentas con email y contraseña más nombre de usuario, y
 * acceso con Google y Discord si tienen credenciales.
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
    socialProviders: Object.fromEntries(
      enabledSocialProviders(env).map((provider) => [provider, credentialsOf(env, provider)]),
    ),
    // Vincular una cuenta de Google o Discord a una existente con el mismo email exige que ese
    // email esté verificado en DeckForge (el valor por defecto, fijado aquí a propósito). Si no,
    // alguien podría registrar tu email con una contraseña suya y, cuando entrases con Google,
    // compartiríais cuenta. Mientras no verifiquemos emails, esa vinculación no ocurre: la web
    // explica que hay que entrar con la contraseña.
    account: {
      accountLinking: { enabled: true, requireLocalEmailVerified: true },
    },
    // Si la vuelta de un proveedor falla antes de saber a dónde volver (p. ej. un `state`
    // caducado), Better Auth manda a su propia página de error, en inglés y fuera de la web.
    // Mejor a la de acceso, que traduce el `?error=`.
    onAPIError: { errorURL: `${env.WEB_ORIGIN}/login` },
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
