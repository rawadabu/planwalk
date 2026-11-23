CREATE TABLE "real_view" (
	"id" text PRIMARY KEY NOT NULL,
	"house_id" text NOT NULL,
	"user_id" text,
	"room" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"file" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "real_view" ADD CONSTRAINT "real_view_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "real_view" ADD CONSTRAINT "real_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "real_view_house_idx" ON "real_view" USING btree ("house_id");
