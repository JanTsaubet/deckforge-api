/** Código de Postgres para una violación de restricción UNIQUE. */
const UNIQUE_VIOLATION = '23505';

/**
 * ¿El error viene de una restricción UNIQUE? Drizzle envuelve el error del driver y deja el
 * original en `cause`, así que se mira en los dos sitios.
 */
export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return codeOf(error) === UNIQUE_VIOLATION || codeOf(cause) === UNIQUE_VIOLATION;
}

function codeOf(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;
}
