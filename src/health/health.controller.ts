import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

/** Comprobación de vida para despliegues y monitorización. No toca la base de datos. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
