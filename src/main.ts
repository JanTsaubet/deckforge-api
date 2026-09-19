import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV, type Env } from './config/env.js';

// En desarrollo las variables vienen de .env; en producción y CI, del propio entorno.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usa el entorno tal cual.
}

async function bootstrap() {
  // Sin body parser propio: lo añade configureApp después de montar Better Auth.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
}

await bootstrap();
