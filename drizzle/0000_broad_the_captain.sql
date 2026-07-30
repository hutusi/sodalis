CREATE TYPE "public"."cal_source" AS ENUM('seed', 'admin');--> statement-breakpoint
CREATE TYPE "public"."day_kind" AS ENUM('holiday', 'workday');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'zh-CN');--> statement-breakpoint
CREATE TYPE "public"."notify_channel" AS ENUM('email');--> statement-breakpoint
CREATE TYPE "public"."notify_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notify_template" AS ENUM('match_result', 'match_updated', 'unmatched');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('scheduler', 'manual');--> statement-breakpoint
CREATE TYPE "public"."signup_source" AS ENUM('manual', 'standing');--> statement-breakpoint
CREATE TYPE "public"."signup_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."size_pref" AS ENUM('pair_only', 'flex_2_4');--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"signup_close_time" time NOT NULL,
	"notify_by_time" time NOT NULL,
	"event_time" time NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "cafeterias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"timezone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holiday_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"kind" "day_kind" NOT NULL,
	"label" text NOT NULL,
	"source" "cal_source" DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_calendar_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "match_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_run_id" uuid NOT NULL,
	"group_index" integer NOT NULL,
	"host_user_id" uuid,
	"cafeteria_id" uuid,
	"office_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_pairs" (
	"user_lo" uuid NOT NULL,
	"user_hi" uuid NOT NULL,
	"date" date NOT NULL,
	"match_run_id" uuid NOT NULL,
	CONSTRAINT "match_pairs_user_lo_user_hi_date_pk" PRIMARY KEY("user_lo","user_hi","date"),
	CONSTRAINT "match_pairs_ordered" CHECK ("match_pairs"."user_lo" < "match_pairs"."user_hi")
);
--> statement-breakpoint
CREATE TABLE "match_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"seed" text NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"triggered_by" "run_trigger" NOT NULL,
	"triggered_by_user_id" uuid,
	"stats" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notify_channel" DEFAULT 'email' NOT NULL,
	"template" "notify_template" NOT NULL,
	"locale" "locale" NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "notify_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"date" date NOT NULL,
	"group_size_pref" "size_pref" DEFAULT 'flex_2_4' NOT NULL,
	"willing_to_host" boolean DEFAULT false NOT NULL,
	"source" "signup_source" DEFAULT 'manual' NOT NULL,
	"standing_signup_id" uuid,
	"status" "signup_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"weekdays" smallint[] NOT NULL,
	"group_size_pref" "size_pref" DEFAULT 'flex_2_4' NOT NULL,
	"willing_to_host" boolean DEFAULT false NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"auth_subject" text,
	"name" text DEFAULT '' NOT NULL,
	"department" text,
	"office_id" uuid,
	"office_locked" boolean DEFAULT false NOT NULL,
	"locale" "locale" DEFAULT 'zh-CN' NOT NULL,
	"contact_extra" text,
	"contact_visible" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "cafeterias" ADD CONSTRAINT "cafeterias_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_group_members" ADD CONSTRAINT "match_group_members_group_id_match_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."match_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_group_members" ADD CONSTRAINT "match_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_groups" ADD CONSTRAINT "match_groups_match_run_id_match_runs_id_fk" FOREIGN KEY ("match_run_id") REFERENCES "public"."match_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_groups" ADD CONSTRAINT "match_groups_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_groups" ADD CONSTRAINT "match_groups_cafeteria_id_cafeterias_id_fk" FOREIGN KEY ("cafeteria_id") REFERENCES "public"."cafeterias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_groups" ADD CONSTRAINT "match_groups_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_groups" ADD CONSTRAINT "match_groups_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_pairs" ADD CONSTRAINT "match_pairs_match_run_id_match_runs_id_fk" FOREIGN KEY ("match_run_id") REFERENCES "public"."match_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_runs" ADD CONSTRAINT "match_runs_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_runs" ADD CONSTRAINT "match_runs_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_runs" ADD CONSTRAINT "match_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signups" ADD CONSTRAINT "signups_standing_signup_id_standing_signups_id_fk" FOREIGN KEY ("standing_signup_id") REFERENCES "public"."standing_signups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_signups" ADD CONSTRAINT "standing_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_signups" ADD CONSTRAINT "standing_signups_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cafeterias_office_idx" ON "cafeterias" USING btree ("office_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_group_members_unique" ON "match_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "match_group_members_user_idx" ON "match_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "match_groups_date_office_idx" ON "match_groups" USING btree ("date","office_id");--> statement-breakpoint
CREATE INDEX "match_groups_run_idx" ON "match_groups" USING btree ("match_run_id");--> statement-breakpoint
CREATE INDEX "match_groups_host_date_idx" ON "match_groups" USING btree ("host_user_id","date");--> statement-breakpoint
CREATE INDEX "match_pairs_run_idx" ON "match_pairs" USING btree ("match_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_runs_live_unique" ON "match_runs" USING btree ("office_id","activity_type_id","date") WHERE "match_runs"."status" in ('pending', 'running', 'completed');--> statement-breakpoint
CREATE INDEX "match_runs_date_idx" ON "match_runs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "offices_city_idx" ON "offices" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signups_user_activity_date_unique" ON "signups" USING btree ("user_id","activity_type_id","date");--> statement-breakpoint
CREATE INDEX "signups_pool_idx" ON "signups" USING btree ("office_id","activity_type_id","date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "standing_signups_user_activity_unique" ON "standing_signups" USING btree ("user_id","activity_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_unique" ON "users" USING btree ("auth_subject") WHERE "users"."auth_subject" is not null;