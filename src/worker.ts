import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

// En desarrollo las variables vienen de .env; en producción, del propio entorno.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usa el entorno tal cual.
}

/** Worker de tareas programadas (`npm run worker`). Sigue vivo hasta que se le detiene. */
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
