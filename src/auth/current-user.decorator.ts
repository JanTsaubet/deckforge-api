import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

/**
 * Usuario de la sesión. Tras `AuthGuard` siempre existe; tras `OptionalAuthGuard`
 * puede ser `undefined` si la petición es anónima.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
