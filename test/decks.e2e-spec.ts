import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, signUp, type TestUser } from './helpers/test-app.js';

interface DeckResponse {
  id: string;
  name: string;
}

describe('Mazos (e2e)', () => {
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

  async function createDeck(user: TestUser, body: object): Promise<DeckResponse> {
    const response = await api()
      .post('/v1/decks')
      .set('Cookie', user.cookie)
      .send(body)
      .expect(201);
    return response.body as DeckResponse;
  }

  it('exige sesión para ver tu biblioteca', () => {
    return api().get('/v1/decks').expect(401);
  });

  it('crea un mazo con Commander y privado por defecto', async () => {
    const response = await api()
      .post('/v1/decks')
      .set('Cookie', owner.cookie)
      .send({ name: '  Atraxa, superamigos  ' })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Atraxa, superamigos',
      format: 'commander',
      visibility: 'private',
      cardCount: 0,
      ownerUsername: owner.username,
      entries: [],
    });
  });

  it('la biblioteca solo muestra tus mazos, los más recientes primero', async () => {
    await createDeck(owner, { name: 'Primero' });
    await createDeck(owner, { name: 'Segundo' });
    await createDeck(stranger, { name: 'De otra persona' });

    const response = await api().get('/v1/decks').set('Cookie', owner.cookie).expect(200);
    const names = (response.body as DeckResponse[]).map((deck) => deck.name);

    expect(names).not.toContain('De otra persona');
    expect(names.indexOf('Segundo')).toBeLessThan(names.indexOf('Primero'));
  });

  it('un mazo privado no existe para nadie más que su dueño', async () => {
    const deck = await createDeck(owner, { name: 'Secreto' });

    await api().get(`/v1/decks/${deck.id}`).set('Cookie', stranger.cookie).expect(404);
    await api().get(`/v1/decks/${deck.id}`).expect(404);
    await api().get(`/v1/decks/${deck.id}`).set('Cookie', owner.cookie).expect(200);
  });

  it('un mazo público se puede ver sin iniciar sesión', async () => {
    const deck = await createDeck(owner, { name: 'Compartido', visibility: 'public' });

    const response = await api().get(`/v1/decks/${deck.id}`).expect(200);

    expect(response.body.name).toBe('Compartido');
  });

  it('solo el dueño puede editar o borrar; al resto se le responde 404', async () => {
    const deck = await createDeck(owner, { name: 'Intocable', visibility: 'public' });

    await api()
      .patch(`/v1/decks/${deck.id}`)
      .set('Cookie', stranger.cookie)
      .send({ name: 'Cambiado' })
      .expect(404);
    await api().delete(`/v1/decks/${deck.id}`).set('Cookie', stranger.cookie).expect(404);

    const response = await api().get(`/v1/decks/${deck.id}`).expect(200);
    expect(response.body.name).toBe('Intocable');
  });

  it('al editar solo cambian los campos enviados', async () => {
    const deck = await createDeck(owner, { name: 'Original', format: 'modern' });

    const response = await api()
      .patch(`/v1/decks/${deck.id}`)
      .set('Cookie', owner.cookie)
      .send({ name: 'Renombrado' })
      .expect(200);

    expect(response.body).toMatchObject({ name: 'Renombrado', format: 'modern' });
  });

  it('borra el mazo', async () => {
    const deck = await createDeck(owner, { name: 'Efímero' });

    await api().delete(`/v1/decks/${deck.id}`).set('Cookie', owner.cookie).expect(204);
    await api().get(`/v1/decks/${deck.id}`).set('Cookie', owner.cookie).expect(404);
  });

  it('rechaza datos inválidos con 400 en lugar de guardarlos o romper', async () => {
    const post = (body: object) => api().post('/v1/decks').set('Cookie', owner.cookie).send(body);

    await post({ name: '   ' }).expect(400);
    await post({ name: 'Válido', format: 'inventado' }).expect(400);
    await post({ name: 'Válido', campoDesconocido: true }).expect(400);
    await api().get('/v1/decks/no-es-un-uuid').expect(400);
  });
});
