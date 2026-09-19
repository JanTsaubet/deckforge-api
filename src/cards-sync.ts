import { NestFactory } from '@nestjs/core';
import { CardSyncService } from './cards/sync/card-sync.service.js';
import { CardSyncCommandModule } from './worker.module.js';

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usa el entorno tal cual.
}

/**
 * Sincroniza el catálogo una vez y termina (`npm run cards:sync`).
 * Con `--force` importa aunque Scryfall no haya publicado un fichero nuevo.
 */
const app = await NestFactory.createApplicationContext(CardSyncCommandModule);
try {
  await app.get(CardSyncService).sync({ force: process.argv.includes('--force') });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await app.close();
}
