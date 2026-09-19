import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, newUserData, signUp, WEB_ORIGIN } from './helpers/test-app.js';

describe('Autenticación (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const signUpRequest = (body: object, origin = WEB_ORIGIN) =>
    request(app.getHttpServer()).post('/api/auth/sign-up/email').set('Origin', origin).send(body);

  it('registra una cuenta y deja una sesión válida', async () => {
    const user = await signUp(app, { username: 'planeswalker' });

    const response = await request(app.getHttpServer())
      .get('/api/auth/get-session')
      .set('Cookie', user.cookie)
      .expect(200);

    expect(response.body.user).toMatchObject({ username: 'planeswalker', email: user.email });
  });

  it('inicia sesión con email y contraseña', async () => {
    const data = newUserData();
    await signUpRequest(data).expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('Origin', WEB_ORIGIN)
      .send({ email: data.email, password: data.password })
      .expect(200);

    expect(response.body.user.email).toBe(data.email);
  });

  it('rechaza contraseñas de menos de 8 caracteres', async () => {
    const response = await signUpRequest(newUserData({ password: '1234567' }));

    expect(response.status).toBe(400);
  });

  it('no permite dos cuentas con el mismo nombre de usuario', async () => {
    await signUpRequest(newUserData({ username: 'repetido' })).expect(200);

    const response = await signUpRequest(
      newUserData({ username: 'repetido', email: 'otro-email@deckforge.test' }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rechaza una petición con sesión que llega desde otro origen (CSRF)', async () => {
    // El ataque CSRF real: una web ajena intenta actuar con TU cookie desde tu navegador.
    // (Un registro sin cookies desde otro origen no es ese ataque, y Better Auth lo permite.)
    const user = await signUp(app);

    const response = await request(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Cookie', user.cookie)
      .send({});

    expect(response.status).toBe(403);
  });

  it('la cookie de sesión no es legible desde JavaScript ni viaja en peticiones de otros sitios', async () => {
    const response = await signUpRequest(newUserData()).expect(200);
    const cookies = [response.headers['set-cookie']].flat();
    const session = cookies.find((cookie) => cookie?.startsWith('better-auth.session_token='));

    expect(session).toMatch(/HttpOnly/i);
    // SameSite=Lax también protege de CSRF nuestros propios endpoints (POST/PATCH/DELETE).
    expect(session).toMatch(/SameSite=Lax/i);
  });
});
