import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller.js';
import { DecksRepository } from './decks.repository.js';
import { DecksService } from './decks.service.js';

@Module({
  controllers: [DecksController],
  providers: [DecksService, DecksRepository],
})
export class DecksModule {}
