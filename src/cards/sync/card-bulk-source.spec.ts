import { Readable } from 'node:stream';
import { createGunzip, gzipSync } from 'node:zlib';
import { readJsonLines } from './card-bulk-source.js';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe('readJsonLines', () => {
  it('descomprime e interpreta un JSONL comprimido, como el de Scryfall', async () => {
    const file = gzipSync('{"name":"Sol Ring"}\n{"name":"Island"}\n\n');

    const cards = await collect(
      readJsonLines<{ name: string }>(Readable.from(file).pipe(createGunzip())),
    );

    expect(cards).toEqual([{ name: 'Sol Ring' }, { name: 'Island' }]);
  });

  it('funciona aunque una línea llegue partida en varios trozos', async () => {
    const chunks = ['{"na', 'me":"Opt"}\r\n{"name":', '"Ponder"}'];

    const cards = await collect(readJsonLines<{ name: string }>(Readable.from(chunks)));

    expect(cards).toEqual([{ name: 'Opt' }, { name: 'Ponder' }]);
  });
});
