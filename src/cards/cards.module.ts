import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller.js';
import { CardsRepository } from './cards.repository.js';

/** Lectura del catálogo local de cartas (lo escribe el worker, ver `cards/sync`). */
@Module({
  controllers: [CardsController],
  providers: [CardsRepository],
  // Los mazos lo usan para dar los datos de sus cartas y validar las que se añaden.
  exports: [CardsRepository],
})
export class CardsModule {}
