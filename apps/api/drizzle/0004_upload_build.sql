ALTER TABLE "plan_upload" ADD COLUMN "house_id" text;--> statement-breakpoint
ALTER TABLE "plan_upload" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "plan_upload" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "plan_upload" ADD CONSTRAINT "plan_upload_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE set null ON UPDATE no action;
