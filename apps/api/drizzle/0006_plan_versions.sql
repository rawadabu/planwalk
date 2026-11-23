ALTER TABLE "house" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "house" ADD COLUMN "draft_of" text;--> statement-breakpoint
ALTER TABLE "house" ADD CONSTRAINT "house_draft_of_house_id_fk" FOREIGN KEY ("draft_of") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_upload" ADD COLUMN "target_house_id" text;--> statement-breakpoint
ALTER TABLE "plan_upload" ADD CONSTRAINT "plan_upload_target_house_id_house_id_fk" FOREIGN KEY ("target_house_id") REFERENCES "public"."house"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "house_version" (
	"id" text PRIMARY KEY NOT NULL,
	"house_id" text NOT NULL,
	"number" integer NOT NULL,
	"upload_id" text,
	"note" text,
	"changes" jsonb,
	"carried" jsonb,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "house_seen" (
	"house_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_seen_pk" PRIMARY KEY("house_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "house_version" ADD CONSTRAINT "house_version_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_version" ADD CONSTRAINT "house_version_upload_id_plan_upload_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."plan_upload"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_version" ADD CONSTRAINT "house_version_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_seen" ADD CONSTRAINT "house_seen_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_seen" ADD CONSTRAINT "house_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "house_version_unique" ON "house_version" USING btree ("house_id","number");--> statement-breakpoint
-- houses that exist today are version 1, unless their plans are still waiting for the architect's review
UPDATE "house" h SET "version" = 1 WHERE NOT EXISTS (SELECT 1 FROM "plan_upload" u WHERE u."house_id" = h."id" AND u."status" <> 'ready');
