CREATE TABLE "follows" (
	"follower" text NOT NULL,
	"followee" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_followee_pk" PRIMARY KEY("follower","followee")
);
--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee");