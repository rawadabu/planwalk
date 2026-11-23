CREATE TABLE "design_brief" (
	"house_id" text NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_brief_pk" PRIMARY KEY("house_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "design_brief" ADD CONSTRAINT "design_brief_house_id_house_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."house"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_brief" ADD CONSTRAINT "design_brief_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
