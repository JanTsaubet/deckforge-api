import { loadEnv, loadWorkerEnv } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgres://deckforge:deckforge@localhost:5432/deckforge',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('aplica el puerto 4000 si no se indica otro', () => {
    expect(loadEnv(validEnv).PORT).toBe(4000);
  });

  it('dice exactamente qué variable falla', () => {
    expect(() => loadEnv({ ...validEnv, BETTER_AUTH_SECRET: 'corto' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('exige que las URLs sean URLs', () => {
    expect(() => loadEnv({ ...validEnv, WEB_ORIGIN: 'no-es-una-url' })).toThrow(/WEB_ORIGIN/);
  });
});

describe('proveedores OAuth', () => {
  it('son opcionales, y un valor vacío cuenta como no definido', () => {
    const env = loadEnv({ ...validEnv, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('exigen id y secreto a la vez', () => {
    expect(() => loadEnv({ ...validEnv, DISCORD_CLIENT_ID: 'solo-el-id' })).toThrow(
      /DISCORD_CLIENT_SECRET/,
    );
  });
});

describe('loadWorkerEnv', () => {
  it('no exige los secretos de la API: al worker solo le hace falta la base de datos', () => {
    const env = loadWorkerEnv({ DATABASE_URL: validEnv.DATABASE_URL });

    expect(env).toMatchObject({
      SCRYFALL_API_URL: 'https://api.scryfall.com',
      CARD_SYNC_CRON: '0 0 10 * * *',
    });
    expect(env).not.toHaveProperty('BETTER_AUTH_SECRET');
  });
});
