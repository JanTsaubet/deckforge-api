import { Module } from '@nestjs/common';
import { CARD_BULK_SOURCE, ScryfallBulkSource } from './card-bulk-source.js';
import { CardCatalogRepository } from './card-catalog.repository.js';
import { CardSyncService } from './card-sync.service.js';

/** Sincronización del catálogo. Necesita `ENV` (del worker) y `DATABASE` globales. */
@Module({
  providers: [
    { provide: CARD_BULK_SOURCE, useClass: ScryfallBulkSource },
    CardCatalogRepository,
    CardSyncService,
  ],
  exports: [CardSyncService],
})
export class CardSyncModule {}
