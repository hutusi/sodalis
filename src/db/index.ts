import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";

// Single connection pool shared by the Next.js server and the worker.
// `max: 10` is plenty for an intranet tool; postgres-js queues beyond that.
const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });

export type Db = typeof db;
