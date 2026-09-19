import { Inject, Injectable } from '@nestjs/common';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { ENV, type WorkerEnv } from '../../config/env.js';
import type { ScryfallBulkData, ScryfallCard } from './scryfall-card.js';

/** Token de inyección de la fuente del catálogo. */
export const CARD_BULK_SOURCE = Symbol('CARD_BULK_SOURCE');

export interface BulkFile {
  /** Cuándo publicó Scryfall este fichero: sirve para no reimportar el mismo dos veces. */
  updatedAt: Date;
  downloadUri: string;
}

/**
 * De dónde sale el catálogo. La sincronización depende de esta interfaz y no de Scryfall,
 * así que en los tests se sustituye por una lista de cartas en memoria.
 */
export interface CardBulkSource {
  getLatest(): Promise<BulkFile>;
  readCards(file: BulkFile): AsyncIterable<ScryfallCard>;
}

/** El fichero de Scryfall con una fila por impresión en inglés. */
const BULK_TYPE = 'default_cards';

/**
 * `CardBulkSource` sobre los _bulk data_ de Scryfall.
 *
 * El fichero son unos 80 MB en JSONL comprimido con gzip (una carta por línea). Se lee en
 * streaming: se descomprime y se interpreta línea a línea mientras llega, sin tener nunca
 * el fichero entero en memoria ni en disco.
 */
@Injectable()
export class ScryfallBulkSource implements CardBulkSource {
  constructor(@Inject(ENV) private readonly env: WorkerEnv) {}

  async getLatest(): Promise<BulkFile> {
    const response = await this.fetch(`${this.env.SCRYFALL_API_URL}/bulk-data/${BULK_TYPE}`);
    const bulk = (await response.json()) as ScryfallBulkData;
    return { updatedAt: new Date(bulk.updated_at), downloadUri: bulk.jsonl_download_uri };
  }

  async *readCards(file: BulkFile): AsyncIterable<ScryfallCard> {
    const response = await this.fetch(file.downloadUri);
    if (!response.body) throw new Error('Scryfall ha devuelto el fichero vacío');

    const compressed = Readable.fromWeb(response.body as NodeWebReadableStream<Uint8Array>);
    yield* readJsonLines<ScryfallCard>(compressed.pipe(createGunzip()));
  }

  /** Scryfall exige un User-Agent que identifique la aplicación y una cabecera Accept. */
  private async fetch(url: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.env.SCRYFALL_USER_AGENT,
        Accept: 'application/json;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`Scryfall ha respondido ${response.status} en ${url}`);
    return response;
  }
}

/** Interpreta un flujo de texto JSONL: un objeto JSON por línea, saltando las vacías. */
export async function* readJsonLines<T>(stream: NodeJS.ReadableStream): AsyncIterable<T> {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as T;
  }
}
