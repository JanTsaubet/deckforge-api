/**
 * Valores del dominio de mazos. Son la única fuente de verdad: los usan el esquema de
 * base de datos, la validación de las peticiones y la documentación OpenAPI.
 */

export const DECK_FORMATS = [
  'commander',
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'brawl',
] as const;

export const DECK_VISIBILITIES = ['public', 'unlisted', 'private'] as const;

export const DECK_BOARDS = ['commander', 'main', 'sideboard', 'maybeboard'] as const;

export type DeckFormat = (typeof DECK_FORMATS)[number];
export type DeckVisibility = (typeof DECK_VISIBILITIES)[number];
export type DeckBoard = (typeof DECK_BOARDS)[number];

/** Longitud máxima del nombre de un mazo. */
export const MAX_DECK_NAME_LENGTH = 100;

/** DeckForge está pensado para Commander: es el formato por defecto. */
export const DEFAULT_DECK_FORMAT: DeckFormat = 'commander';

/** Un mazo nuevo es privado hasta que su dueño decida compartirlo. */
export const DEFAULT_DECK_VISIBILITY: DeckVisibility = 'private';
