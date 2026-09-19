import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './helpers/test-app.js';

describe('API (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde que está viva', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('publica la especificación OpenAPI con los endpoints de mazos', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json').expect(200);

    // De aquí genera el frontend sus tipos: si desaparece un endpoint, debe notarse.
    expect(response.body.paths).toHaveProperty('/v1/decks');
    expect(response.body.paths).toHaveProperty('/v1/decks/{id}');
  });
});
