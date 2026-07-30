CREATE TYPE "public"."admin_via" AS ENUM('manual', 'env', 'group');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_via" "admin_via";--> statement-breakpoint
-- Backfill: pre-existing admins were granted before provenance tracking;
-- treat them as manual so logins never auto-revoke them.
UPDATE "users" SET "admin_via" = 'manual' WHERE "is_admin" = true;