import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

// Single connection pool shared by the Next.js server and the worker.
// postgres-js queues beyond `max`. `idle_timeout` releases idle connections
// so serverless Postgres (Neon, ADR-0009) can autosuspend between cron
// invocations — harmless under Compose, where reconnects are cheap.
const client = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  idle_timeout: env.DB_IDLE_TIMEOUT,
});

export const db = drizzle(client, { schema });

export type Db = typeof db;
/** Either the pool client or a transaction — for helpers usable in both. */
export type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
