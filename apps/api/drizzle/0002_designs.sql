CREATE TABLE "design" (
	"id" text PRIMARY KEY NOT NULL,
	"house_id" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"design_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_revision" ADD CONSTRAINT "design_revision_design_id_design_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."design"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_revision" ADD CONSTRAINT "design_revision_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_house_idx" ON "design" USING btree ("house_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_rev_unique" ON "design_revision" USING btree ("design_id","version");