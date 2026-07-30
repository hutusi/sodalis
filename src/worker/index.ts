import { Cron } from "croner";
import postgres from "postgres";

import { env } from "@/env";
import { schedulerTick } from "@/lib/scheduling/tick";

// One arbitrary-but-fixed id: only a single worker may run loops at a time.
// A second instance stays alive and keeps retrying, taking over if the
// holder dies (its session lock is released with the connection).
const WORKER_LOCK_ID = 0x50da11;

const lockConn = postgres(env.DATABASE_URL, { max: 1 });

async function acquireLock(): Promise<void> {
  for (;;) {
    const [{ locked }] = await lockConn<[{ locked: boolean }]>`
      select pg_try_advisory_lock(${WORKER_LOCK_ID}) as locked
    `;
    if (locked) return;
    console.log("[worker] another worker holds the lock; retrying in 30s");
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

console.log("[worker] starting");
await acquireLock();
console.log("[worker] lock acquired, scheduling loops");

const jobs: Cron[] = [];

// protect: true → a slow pass skips overlapping firings instead of stacking.
jobs.push(
  new Cron("*/30 * * * * *", { protect: true }, async () => {
    try {
      await schedulerTick();
    } catch (error) {
      console.error("[worker] tick failed:", error);
    }
  }),
);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, shutting down`);
  for (const job of jobs) job.stop();
  await lockConn.end({ timeout: 5 }).catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log("[worker] running");
