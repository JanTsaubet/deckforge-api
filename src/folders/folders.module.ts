import { Module } from '@nestjs/common';
import { FoldersController } from './folders.controller.js';
import { FoldersRepository } from './folders.repository.js';
import { FoldersService } from './folders.service.js';

@Module({
  controllers: [FoldersController],
  providers: [FoldersService, FoldersRepository],
  // Los mazos lo usan para comprobar la carpeta al mover un mazo.
  exports: [FoldersService],
})
export class FoldersModule {}
