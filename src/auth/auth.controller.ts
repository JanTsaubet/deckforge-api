import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ENV, type Env } from '../config/env.js';
import { enabledSocialProviders, SOCIAL_PROVIDERS, type SocialProvider } from './auth.js';

export class AuthProvidersDto {
  @ApiProperty({
    enum: SOCIAL_PROVIDERS,
    isArray: true,
    description: 'Proveedores OAuth con credenciales configuradas, en el orden en que se ofrecen',
  })
  social!: SocialProvider[];
}

/**
 * Información pública sobre cómo se puede entrar. La web la usa para enseñar solo los botones
 * de los proveedores que funcionan: sin credenciales de Google, no hay botón de Google.
 */
@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('providers')
  @ApiOkResponse({ type: AuthProvidersDto })
  providers(): AuthProvidersDto {
    return { social: enabledSocialProviders(this.env) };
  }
}
