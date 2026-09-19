import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { toNodeHandler } from 'better-auth/node';
import type { Auth } from './auth/auth.js';
import { AUTH } from './auth/auth.tokens.js';

/**
 * Configuración común de la aplicación, compartida por `main.ts` y los tests e2e para que
 * lo que se prueba sea exactamente lo que se ejecuta.
 *
 * El orden importa: Better Auth debe atender /api/auth ANTES que el parser de JSON,
 * porque necesita leer el cuerpo de la petición sin procesar. Por eso la app se crea con
 * `bodyParser: false` y el parser se añade aquí, después.
 */
export function configureApp(app: NestExpressApplication): void {
  const auth = app.get<Auth>(AUTH);
  app.getHttpAdapter().getInstance().all('/api/auth/*splat', toNodeHandler(auth));

  app.useBodyParser('json');
  app.useGlobalPipes(
    new ValidationPipe({
      // Rechaza campos desconocidos en lugar de ignorarlos en silencio.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle('DeckForge API')
    .setDescription('Cuentas, mazos y recomendaciones para Magic: The Gathering.')
    .setVersion('0.1.0')
    .addCookieAuth('better-auth.session_token')
    .build();

  // Documentación navegable en /docs y especificación en /openapi.json, de donde el
  // frontend genera sus tipos.
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApiConfig), {
    jsonDocumentUrl: 'openapi.json',
  });
}
