CREATE TABLE "card_sync_state" (
	"source" text PRIMARY KEY NOT NULL,
	"bulk_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"card_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"oracle_id" text,
	"name" text NOT NULL,
	"lang" text NOT NULL,
	"set_code" text NOT NULL,
	"set_name" text NOT NULL,
	"collector_number" text NOT NULL,
	"released_at" date,
	"layout" text NOT NULL,
	"mana_cost" text,
	"mana_value" real NOT NULL,
	"type_line" text NOT NULL,
	"oracle_text" text,
	"colors" text[] NOT NULL,
	"color_identity" text[] NOT NULL,
	"rarity" text NOT NULL,
	"image_small" text,
	"image_normal" text,
	"image_art_crop" text,
	"price_eur" numeric(10, 2),
	"price_usd" numeric(10, 2),
	"legalities" jsonb NOT NULL,
	"edhrec_rank" integer,
	"game_changer" boolean DEFAULT false NOT NULL,
	"digital" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cards_oracle_id_idx" ON "cards" USING btree ("oracle_id");--> statement-breakpoint
CREATE INDEX "cards_name_lower_idx" ON "cards" USING btree (lower("name"));