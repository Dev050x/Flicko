CREATE TYPE "public"."candle_interval" AS ENUM('1m', '5m', '1h', '1d');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('launch', 'graduated');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'finalized', 'rejected');--> statement-breakpoint
CREATE TABLE "candles" (
	"mint" text NOT NULL,
	"interval" "candle_interval" NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"open" numeric(39, 0) NOT NULL,
	"high" numeric(39, 0) NOT NULL,
	"low" numeric(39, 0) NOT NULL,
	"close" numeric(39, 0) NOT NULL,
	"volume_skr" numeric(39, 0) DEFAULT '0' NOT NULL,
	"trades" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "candles_mint_interval_bucket_start_pk" PRIMARY KEY("mint","interval","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "indexer_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_signature" text,
	"last_slot" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memes" (
	"mint" text PRIMARY KEY NOT NULL,
	"meme_pda" text NOT NULL,
	"creator" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"uri" text NOT NULL,
	"image_url" text,
	"image_hash" text NOT NULL,
	"caption_top" text,
	"caption_bottom" text,
	"total_supply" numeric(39, 0) NOT NULL,
	"start_price" numeric(39, 0) NOT NULL,
	"phase" "phase" DEFAULT 'launch' NOT NULL,
	"price" numeric(39, 0) NOT NULL,
	"tokens_sold" numeric(39, 0) DEFAULT '0' NOT NULL,
	"real_skr" numeric(39, 0) DEFAULT '0' NOT NULL,
	"pool_skr" numeric(39, 0) DEFAULT '0' NOT NULL,
	"pool_tokens" numeric(39, 0) DEFAULT '0' NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_slot" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"graduated_at" timestamp with time zone,
	"last_trade_at" timestamp with time zone,
	CONSTRAINT "memes_meme_pda_unique" UNIQUE("meme_pda")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"wallet" text NOT NULL,
	"mint" text NOT NULL,
	"balance" numeric(39, 0) DEFAULT '0' NOT NULL,
	"cost_basis_skr" numeric(39, 0) DEFAULT '0' NOT NULL,
	"realized_pnl_skr" numeric(40, 0) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_wallet_mint_pk" PRIMARY KEY("wallet","mint")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"mint" text NOT NULL,
	"trader" text NOT NULL,
	"is_buy" boolean NOT NULL,
	"skr_amount" numeric(39, 0) NOT NULL,
	"token_amount" numeric(39, 0) NOT NULL,
	"creator_fee" numeric(39, 0) NOT NULL,
	"burned" numeric(39, 0) NOT NULL,
	"price_after" numeric(39, 0) NOT NULL,
	"phase" "phase" NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	CONSTRAINT "trades_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"raw_key" text NOT NULL,
	"final_key" text,
	"image_hash" text,
	"metadata_uri" text,
	"captions" jsonb,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"wallet" text PRIMARY KEY NOT NULL,
	"username" text,
	"push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memes_creator_idx" ON "memes" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "memes_created_at_idx" ON "memes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memes_image_hash_idx" ON "memes" USING btree ("image_hash");--> statement-breakpoint
CREATE INDEX "positions_mint_idx" ON "positions" USING btree ("mint");--> statement-breakpoint
CREATE INDEX "trades_mint_time_idx" ON "trades" USING btree ("mint","block_time");--> statement-breakpoint
CREATE INDEX "trades_trader_idx" ON "trades" USING btree ("trader");--> statement-breakpoint
CREATE INDEX "uploads_wallet_idx" ON "uploads" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "uploads_image_hash_idx" ON "uploads" USING btree ("image_hash");