import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, signUp, type TestUser } from './helpers/test-app.js';

interface FolderResponse {
  id: string;
  name: string;
  deckCount: number;
}

interface DeckResponse {
  id: string;
  folderId: string | null;
}

describe('Carpetas (e2e)', () => {
  let app: NestExpressApplication;
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await signUp(app);
    stranger = await signUp(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function createFolder(user: TestUser, name: string): Promise<FolderResponse> {
    const response = await api()
      .post('/v1/folders')
      .set('Cookie', user.cookie)
      .send({ name })
      .expect(201);
    return response.body as FolderResponse;
  }

  async function createDeck(user: TestUser, body: object): Promise<DeckResponse> {
    const response = await api()
      .post('/v1/decks')
      .set('Cookie', user.cookie)
      .send(body)
      .expect(201);
    return response.body as DeckResponse;
  }

  async function listFolders(user: TestUser): Promise<FolderResponse[]> {
    const response = await api().get('/v1/folders').set('Cookie', user.cookie).expect(200);
    return response.body as FolderResponse[];
  }

  it('exige sesión', () => {
    return api().get('/v1/folders').expect(401);
  });

  it('crea carpetas y las lista por nombre con cuántos mazos tienen', async () => {
    const zombies = await createFolder(owner, 'Zombis');
    await createFolder(owner, '  cEDH  ');
    await createDeck(owner, { name: 'Gisa', folderId: zombies.id });
    await createDeck(owner, { name: 'Wilhelt', folderId: zombies.id });

    const folders = await listFolders(owner);

    expect(folders.map((folder) => [folder.name, folder.deckCount])).toEqual([
      ['cEDH', 0],
      ['Zombis', 2],
    ]);
  });

  it('cada usuario ve solo sus carpetas', async () => {
    await createFolder(stranger, 'Privada');

    expect((await listFolders(owner)).map((folder) => folder.name)).not.toContain('Privada');
  });

  it('no deja repetir nombre dentro de la misma biblioteca, pero sí entre usuarios', async () => {
    await createFolder(owner, 'Duplicada');

    for (const name of ['Duplicada', 'DUPLICADA']) {
      await api().post('/v1/folders').set('Cookie', owner.cookie).send({ name }).expect(409);
    }
    await createFolder(stranger, 'Duplicada');
  });

  it('renombra una carpeta', async () => {
    const folder = await createFolder(owner, 'Borrador');

    const response = await api()
      .patch(`/v1/folders/${folder.id}`)
      .set('Cookie', owner.cookie)
      .send({ name: 'Terminados' })
      .expect(200);

    expect(response.body).toMatchObject({ id: folder.id, name: 'Terminados' });
  });

  it('mueve un mazo entre carpetas y lo saca con folderId null', async () => {
    const folder = await createFolder(owner, 'Destino');
    const deck = await createDeck(owner, { name: 'Viajero' });

    const moved = await api()
      .patch(`/v1/decks/${deck.id}`)
      .set('Cookie', owner.cookie)
      .send({ folderId: folder.id })
      .expect(200);
    expect(moved.body.folderId).toBe(folder.id);

    const out = await api()
      .patch(`/v1/decks/${deck.id}`)
      .set('Cookie', owner.cookie)
      .send({ folderId: null })
      .expect(200);
    expect(out.body.folderId).toBeNull();
  });

  it('no deja meter un mazo en la carpeta de otra persona', async () => {
    const foreign = await createFolder(stranger, 'Ajena');
    const deck = await createDeck(owner, { name: 'Mío' });

    await api()
      .patch(`/v1/decks/${deck.id}`)
      .set('Cookie', owner.cookie)
      .send({ folderId: foreign.id })
      .expect(400);
    await api()
      .post('/v1/decks')
      .set('Cookie', owner.cookie)
      .send({ name: 'Colado', folderId: foreign.id })
      .expect(400);
  });

  it('una carpeta ajena no se puede renombrar ni borrar (404)', async () => {
    const foreign = await createFolder(stranger, 'No es tuya');

    await api()
      .patch(`/v1/folders/${foreign.id}`)
      .set('Cookie', owner.cookie)
      .send({ name: 'Mía' })
      .expect(404);
    await api().delete(`/v1/folders/${foreign.id}`).set('Cookie', owner.cookie).expect(404);
  });

  it('al borrar una carpeta sus mazos siguen ahí, sin carpeta', async () => {
    const folder = await createFolder(owner, 'Temporal');
    const deck = await createDeck(owner, { name: 'Superviviente', folderId: folder.id });

    await api().delete(`/v1/folders/${folder.id}`).set('Cookie', owner.cookie).expect(204);

    const response = await api()
      .get(`/v1/decks/${deck.id}`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(response.body.folderId).toBeNull();
  });

  it('rechaza nombres vacíos o demasiado largos', async () => {
    const post = (name: string) =>
      api().post('/v1/folders').set('Cookie', owner.cookie).send({ name });

    await post('   ').expect(400);
    await post('x'.repeat(51)).expect(400);
  });
});
