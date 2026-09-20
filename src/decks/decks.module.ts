import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { DecksController } from './decks.controller.js';
import { DecksRepository } from './decks.repository.js';
import { DecksService } from './decks.service.js';

@Module({
  imports: [FoldersModule, CardsModule],
  controllers: [DecksController],
  providers: [DecksService, DecksRepository],
})
export class DecksModule {}
