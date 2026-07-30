-- 0002 backfilled every pre-provenance admin as 'manual', which made those
-- grants permanently unrevocable by logins. Reset them to NULL ("unknown"):
-- computeAdmin resolves unknown provenance on the next informative login
-- (env-listed → env, group-confirmed → group, neither → revoked), so
-- externally-granted admins become revocable again. This repo has no
-- production deployments; genuinely manual grants (dev seed) are re-set
-- explicitly by the seed script or a deliberate admin action.
UPDATE "users" SET "admin_via" = NULL WHERE "admin_via" = 'manual';
