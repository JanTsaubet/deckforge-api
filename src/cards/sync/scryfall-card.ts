/**
 * Subconjunto del objeto carta de Scryfall que usa la sincronización.
 * Referencia: https://scryfall.com/docs/api/cards
 */
export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  art_crop?: string;
}

export interface ScryfallCardFace {
  name: string;
  oracle_id?: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  image_uris?: ScryfallImageUris;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  layout: string;
  set: string;
  set_name: string;
  collector_number: string;
  released_at?: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  rarity: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  prices: { eur?: string | null; usd?: string | null };
  legalities: Record<string, string>;
  edhrec_rank?: number;
  game_changer?: boolean;
  digital?: boolean;
}

/** Descripción de un fichero de _bulk data_ (`GET /bulk-data/:type`). */
export interface ScryfallBulkData {
  type: string;
  updated_at: string;
  jsonl_download_uri: string;
  compressed_size?: number;
}
