# DeckForge · API

API de DeckForge: cuentas de usuario, mazos y, más adelante, recomendaciones para _Magic: The Gathering_.

El frontend vive en el repositorio **deckforge-web**, que contiene también la visión del producto y el roadmap por fases.

## Stack

| Pieza             | Tecnología                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| Framework         | NestJS 12 (módulos ES)                                                     |
| Base de datos     | PostgreSQL 17 (Docker en desarrollo)                                       |
| ORM y migraciones | Drizzle ORM + drizzle-kit                                                  |
| Autenticación     | Better Auth: email y contraseña, con el plugin de nombre de usuario        |
| Validación        | class-validator en las peticiones · Zod en las variables de entorno        |
| Documentación     | OpenAPI con `@nestjs/swagger`: `/docs` (navegable) y `/openapi.json`       |
| Tests             | Vitest + Supertest; los e2e corren sobre PGlite (Postgres en memoria)      |
| Calidad           | oxlint + Prettier                                                          |

## Arquitectura

- **El navegador nunca llama a esta API directamente.** La web reenvía `/api/auth/*` y `/api/v1/*` hacia aquí, así que la cookie de sesión pertenece al origen de la web y no hace falta CORS. Por eso `BETTER_AUTH_URL` es la URL de la web, no la de la API.
- **Módulos:** `config` (entorno validado), `database` (Drizzle sobre `pg`), `auth` (Better Auth y guards), `decks` y `health`.
- **Mazos en tres capas:** el controlador valida y documenta, el servicio aplica las reglas y el repositorio solo hace SQL.
- **Un mazo privado no existe para nadie más que su dueño.** A cualquier otro se le responde 404, no 403, para no revelar siquiera que existe. Lo mismo al intentar editar o borrar uno ajeno.
- **Protección CSRF explícita.** Better Auth desactiva por defecto la comprobación de origen cuando detecta un entorno de test. Aquí se fija a mano, así la protección no depende de adivinar el entorno y los tests prueban la misma seguridad que producción.
- **Tests e2e con la base de datos real.** Cada fichero levanta la API completa contra un PGlite con las migraciones de `drizzle/` aplicadas: se prueba el SQL de verdad, sin Docker y sin simulaciones.

## Puesta en marcha

Requisitos: **Node.js 22.22.1 o superior** y **Docker Desktop** para la base de datos.

1. Crea tu `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

2. Sustituye `BETTER_AUTH_SECRET` por un secreto aleatorio. Puedes generarlo con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

3. Instala las dependencias:

```bash
npm install
```

> Si npm 10 falla con `Cannot read properties of null (reading 'edgesOut')`, es un fallo suyo al resolver dependencias _peer_: usa `npx npm@11 install`. Con el `package-lock.json` ya generado, `npm ci` funciona con npm 10.

4. Levanta Postgres y aplica las migraciones:

```bash
npm run db:up
```

```bash
npm run db:migrate
```

5. Arranca la API:

```bash
npm run start:dev
```

Queda en <http://localhost:4000>, con la documentación en <http://localhost:4000/docs>.

## Scripts

| Script                 | Descripción                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run start:dev`    | API en modo desarrollo, recompila al guardar                         |
| `npm run build`        | Compila a `dist/`                                                    |
| `npm test`             | Tests unitarios                                                      |
| `npm run test:e2e`     | Tests e2e: la API completa sobre Postgres en memoria                 |
| `npm run lint`         | oxlint con información de tipos                                      |
| `npm run typecheck`    | Comprueba TypeScript                                                 |
| `npm run format`       | Formatea con Prettier                                                |
| `npm run db:up`        | Levanta Postgres con Docker Compose                                  |
| `npm run db:generate`  | Genera una migración a partir de los cambios del esquema             |
| `npm run db:migrate`   | Aplica las migraciones pendientes                                    |
| `npm run db:studio`    | Explorador visual de la base de datos (Drizzle Studio)               |

## Endpoints

| Método   | Ruta             | Sesión          | Descripción                                            |
| -------- | ---------------- | --------------- | ------------------------------------------------------ |
| `GET`    | `/health`        | No              | Comprobación de vida                                   |
| `*`      | `/api/auth/*`    | —               | Better Auth: registro, acceso, sesión y cierre         |
| `GET`    | `/v1/decks`      | Sí              | Tus mazos, los más recientes primero                   |
| `POST`   | `/v1/decks`      | Sí              | Crear un mazo (Commander y privado por defecto)        |
| `GET`    | `/v1/decks/:id`  | Opcional        | Ver un mazo; los privados, solo su dueño               |
| `PATCH`  | `/v1/decks/:id`  | Sí, dueño       | Cambiar solo los campos enviados                       |
| `DELETE` | `/v1/decks/:id`  | Sí, dueño       | Borrar un mazo                                         |

La especificación completa, con los esquemas de cada petición y respuesta, está en `/openapi.json`. La web genera sus tipos a partir de ella con `npm run api:types`.
