CREATE TYPE "public"."alert_direction" AS ENUM('above', 'below');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('rocket', 'fire', 'poop');--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"mint" text NOT NULL,
	"price" numeric(39, 0) NOT NULL,
	"direction" "alert_direction" NOT NULL,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"wallet" text NOT NULL,
	"mint" text NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_wallet_mint_kind_pk" PRIMARY KEY("wallet","mint","kind")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"wallet" text NOT NULL,
	"mint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_wallet_mint_pk" PRIMARY KEY("wallet","mint")
);
--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_alerts_mint_idx" ON "price_alerts" USING btree ("mint");--> statement-breakpoint
CREATE INDEX "reactions_mint_idx" ON "reactions" USING btree ("mint");