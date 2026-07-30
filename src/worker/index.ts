import { Cron } from "croner";
import postgres from "postgres";

import { env } from "@/env";
import { dispatchOutbox } from "@/lib/notify/outbox";
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

jobs.push(
  new Cron("*/10 * * * * *", { protect: true }, async () => {
    try {
      const sent = await dispatchOutbox();
      if (sent > 0) console.log(`[worker] outbox: sent ${sent}`);
    } catch (error) {
      console.error("[worker] outbox pass failed:", error);
    }
  }),
);

// Session advisory locks die with their connection. If lockConn was ever
// reconnected (server restart, network blip), this process would keep
// running WITHOUT the lock while a standby acquires it — two active
// workers. Verify the lock every minute and exit for a clean restart
// (compose restarts us; on boot we re-acquire or idle) when it's gone.
jobs.push(
  new Cron("0 * * * * *", { protect: true }, async () => {
    try {
      const [{ held }] = await lockConn<[{ held: boolean }]>`
        select exists(
          select 1 from pg_locks
          where locktype = 'advisory'
            and classid = 0
            and objid = ${WORKER_LOCK_ID}
            and pid = pg_backend_pid()
            and granted
        ) as held
      `;
      if (!held) {
        console.error("[worker] advisory lock lost — exiting for restart");
        process.exit(1);
      }
    } catch (error) {
      console.error("[worker] lock check failed — exiting for restart:", error);
      process.exit(1);
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
