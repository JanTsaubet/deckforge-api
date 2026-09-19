import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import type { Auth, SessionUser } from './auth.js';
import { AUTH } from './auth.tokens.js';

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

/** Lee la sesión de la cookie y, si existe, deja el usuario en la petición. */
async function attachSessionUser(auth: Auth, request: AuthenticatedRequest) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  request.user = session?.user;
  return request.user;
}

/** Exige una sesión válida: sin ella responde 401. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = await attachSessionUser(this.auth, context.switchToHttp().getRequest());
    if (!user) throw new UnauthorizedException('Necesitas iniciar sesión');
    return true;
  }
}

/** Identifica al usuario si hay sesión, pero deja pasar también a los anónimos. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await attachSessionUser(this.auth, context.switchToHttp().getRequest());
    return true;
  }
}
