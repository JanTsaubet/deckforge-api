import { Module } from '@nestjs/common';
import { FoldersModule } from '../folders/folders.module.js';
import { DecksController } from './decks.controller.js';
import { DecksRepository } from './decks.repository.js';
import { DecksService } from './decks.service.js';

@Module({
  imports: [FoldersModule],
  controllers: [DecksController],
  providers: [DecksService, DecksRepository],
})
export class DecksModule {}
