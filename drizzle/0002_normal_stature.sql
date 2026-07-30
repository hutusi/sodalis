CREATE TYPE "public"."admin_via" AS ENUM('manual', 'env', 'group');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_via" "admin_via";
-- Deliberately no backfill: NULL means "unknown provenance", which
-- computeAdmin resolves on the next informative login (env-listed → env,
-- group-confirmed → group, neither → revoked). A migration cannot know
-- which grants were manual, and guessing either way is worse: 'manual'
-- makes external grants unrevocable, revoking risks locking out real
-- manual admins.