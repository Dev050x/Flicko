CREATE TABLE "skr_airdrops" (
	"wallet" text PRIMARY KEY NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
