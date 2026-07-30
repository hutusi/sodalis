ALTER TABLE "signups" DROP CONSTRAINT "signups_standing_signup_id_standing_signups_id_fk";
--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_standing_signup_id_standing_signups_id_fk" FOREIGN KEY ("standing_signup_id") REFERENCES "public"."standing_signups"("id") ON DELETE set null ON UPDATE no action;