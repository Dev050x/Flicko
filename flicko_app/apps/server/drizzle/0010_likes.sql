CREATE TABLE "likes" (
	"wallet" text NOT NULL,
	"mint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_wallet_mint_pk" PRIMARY KEY("wallet","mint")
);
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "likes_mint_idx" ON "likes" USING btree ("mint");