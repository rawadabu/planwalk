CREATE TABLE "price_book" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_book" ADD CONSTRAINT "price_book_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_book" ADD CONSTRAINT "price_book_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;