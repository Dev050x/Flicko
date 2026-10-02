CREATE TABLE "creator_claims" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"mint" text NOT NULL,
	"creator" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"slot" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	CONSTRAINT "creator_claims_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
ALTER TABLE "creator_claims" ADD CONSTRAINT "creator_claims_mint_memes_mint_fk" FOREIGN KEY ("mint") REFERENCES "public"."memes"("mint") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_claims_mint_idx" ON "creator_claims" USING btree ("mint");