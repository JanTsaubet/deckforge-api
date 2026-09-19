import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DecksModule } from './decks/decks.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, DecksModule],
  controllers: [HealthController],
})
export class AppModule {}
