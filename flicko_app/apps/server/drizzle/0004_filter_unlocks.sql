CREATE TABLE "filter_unlocks" (
	"wallet" text NOT NULL,
	"filter_id" text NOT NULL,
	"signature" text NOT NULL,
	"burned" numeric(39, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filter_unlocks_wallet_filter_id_pk" PRIMARY KEY("wallet","filter_id"),
	CONSTRAINT "filter_unlocks_signature_unique" UNIQUE("signature")
);
