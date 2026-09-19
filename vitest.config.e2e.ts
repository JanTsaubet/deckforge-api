import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Cada fichero levanta la API y un Postgres en memoria (PGlite) con las migraciones:
    // la primera vez tarda más que los 5 s por defecto al compilar el WebAssembly.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
