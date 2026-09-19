import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp, WEB_ORIGIN } from './helpers/test-app.js';

/**
 * Acceso con Google y Discord. Sin credenciales reales no se puede completar el viaje de ida y
 * vuelta al proveedor, pero sí comprobar todo lo que depende de nosotros: qué proveedores se
 * ofrecen y que la redirección al proveedor lleva el cliente, los permisos y la URL de vuelta
 * correctos. Esa URL de vuelta es la que hay que registrar en la consola de cada proveedor.
 */
describe('Acceso con OAuth (e2e)', () => {
  const socialSignIn = (app: NestExpressApplication, provider: string) =>
    request(app.getHttpServer())
      .post('/api/auth/sign-in/social')
      .set('Origin', WEB_ORIGIN)
      .send({ provider, callbackURL: '/decks', errorCallbackURL: '/login' });

  describe('sin credenciales configuradas', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('no ofrece ningún proveedor', async () => {
      const response = await request(app.getHttpServer()).get('/v1/auth/providers').expect(200);

      expect(response.body).toEqual({ social: [] });
    });

    it('rechaza entrar con un proveedor no configurado', async () => {
      const response = await socialSignIn(app, 'google');

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('con Google y Discord configurados', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp({
        GOOGLE_CLIENT_ID: 'cliente-google',
        GOOGLE_CLIENT_SECRET: 'secreto-google',
        DISCORD_CLIENT_ID: 'cliente-discord',
        DISCORD_CLIENT_SECRET: 'secreto-discord',
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('ofrece los dos proveedores', async () => {
      const response = await request(app.getHttpServer()).get('/v1/auth/providers').expect(200);

      expect(response.body).toEqual({ social: ['google', 'discord'] });
    });

    it('redirige a Google con el cliente y la URL de vuelta de la web', async () => {
      const response = await socialSignIn(app, 'google').expect(200);
      const url = new URL(response.body.url as string);

      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('client_id')).toBe('cliente-google');
      // La vuelta pasa por la web, que la reenvía a la API: la cookie es de su mismo origen.
      expect(url.searchParams.get('redirect_uri')).toBe(`${WEB_ORIGIN}/api/auth/callback/google`);
      expect(url.searchParams.get('scope')).toContain('email');
      // `state` protege contra CSRF en la vuelta; Better Auth lo guarda en una cookie.
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('redirige a Discord con el cliente y la URL de vuelta de la web', async () => {
      const response = await socialSignIn(app, 'discord').expect(200);
      const url = new URL(response.body.url as string);

      expect(url.hostname).toBe('discord.com');
      expect(url.searchParams.get('client_id')).toBe('cliente-discord');
      expect(url.searchParams.get('redirect_uri')).toBe(`${WEB_ORIGIN}/api/auth/callback/discord`);
      expect(url.searchParams.get('scope')).toContain('email');
    });

    it('una vuelta del proveedor sin código válido no crea sesión y vuelve al acceso con un error', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/callback/google?state=inventado&code=inventado')
        .expect(302);

      const location = new URL(response.headers.location as string);
      expect(`${location.origin}${location.pathname}`).toBe(`${WEB_ORIGIN}/login`);
      expect(location.searchParams.get('error')).toBeTruthy();
      expect(String(response.headers['set-cookie'] ?? '')).not.toContain('session_token=');
    });
  });
});
