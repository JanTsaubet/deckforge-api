ALTER TABLE "cards" ADD COLUMN "set_type" text DEFAULT 'expansion' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "promo" boolean DEFAULT false NOT NULL;