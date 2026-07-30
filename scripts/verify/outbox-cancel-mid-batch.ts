/**
 * Verifies: rows cancelled while an outbox batch is mid-flight are NOT
 * physically sent (per-row freshness check), and their status survives.
 *
 * Runs against a THROWAWAY database (created, migrated, dropped here) so
 * the dispatcher — which claims globally — cannot touch or deliver any
 * real data, and nothing concurrent can leak into the assertions.
 * Requires the CREATEDB privilege on the configured role
 * (once: ALTER ROLE sodalis CREATEDB). Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/outbox-cancel-mid-batch.ts
 */
import net from "node:net";
import postgres from "postgres";

const BASE_URL =
  process.env.DATABASE_URL ?? "postgres://sodalis:sodalis@localhost:5432/sodalis";
const TEMP_DB = `sodalis_verify_${Date.now()}_${process.pid}`;
const PORT = 2526;

// ---- throwaway database ---------------------------------------------------
const admin = postgres(BASE_URL, { max: 1 });
try {
  await admin.unsafe(`create database "${TEMP_DB}"`);
} catch (error) {
  console.error(
    `FAIL: could not create throwaway database (needs CREATEDB — run: ALTER ROLE <user> CREATEDB): ${error}`,
  );
  await admin.end({ timeout: 5 });
  process.exit(1);
}
const tempUrl = new URL(BASE_URL);
tempUrl.pathname = `/${TEMP_DB}`;
// Must happen before any src/ import — env is read at import time.
process.env.DATABASE_URL = tempUrl.toString();

// ---- SMTP sink ------------------------------------------------------------
// Delays each DATA acceptance so cancellation can land while the first
// message is on the wire; resolves firstSend once row 1 is in flight.
let messages = 0;
let resolveFirstSend!: () => void;
const firstSend = new Promise<void>((r) => (resolveFirstSend = r));
const server = net.createServer((sock) => {
  let inData = false;
  let buffer = "";
  sock.write("220 sink ready\r\n");
  sock.on("data", (buf) => {
    const chunk = buf.toString();
    if (inData) {
      buffer += chunk;
      if (buffer.includes("\r\n.\r\n")) {
        inData = false;
        buffer = "";
        messages++;
        setTimeout(() => sock.write("250 ok\r\n"), 400);
      }
      return;
    }
    for (const line of chunk.split("\r\n").filter(Boolean)) {
      const cmd = line.toUpperCase();
      if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) {
        sock.write("250-sink\r\n250 8BITMIME\r\n");
      } else if (cmd.startsWith("DATA")) {
        inData = true;
        resolveFirstSend();
        sock.write("354 go\r\n");
      } else if (cmd.startsWith("QUIT")) {
        sock.write("221 bye\r\n");
        sock.end();
      } else {
        sock.write("250 ok\r\n");
      }
    }
  });
});
await new Promise<void>((r) => server.listen(PORT, r));
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = String(PORT);

let ok = false;
try {
  const { db } = await import("../../src/db");
  const { notifications, users } = await import("../../src/db/schema");
  const { dispatchOutbox } = await import("../../src/lib/notify/outbox");
  const { and, eq, like } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");

  await migrate(db, { migrationsFolder: "drizzle" });

  const userRows = await db
    .insert(users)
    .values(
      Array.from({ length: 6 }, (_, i) => ({
        email: `verify-${i}@verify.local`,
        name: `Verify ${i}`,
      })),
    )
    .returning({ id: users.id });

  const payload = {
    kind: "unmatched",
    date: "2026-01-01",
    activity: { nameEn: "Lunch", nameZh: "午餐", eventTime: "11:45:00" },
    office: { nameEn: "X", nameZh: "X" },
  };
  await db.insert(notifications).values(
    userRows.map((u, i) => ({
      userId: u.id,
      channel: "email" as const,
      template: "unmatched" as const,
      locale: "zh-CN" as const,
      payload,
      dedupeKey: `verify:${i}`,
    })),
  );

  const dispatch = dispatchOutbox();
  await firstSend; // row 1 is on the wire — cancel everything still 'sending'
  const cancelled = await db
    .update(notifications)
    .set({ status: "cancelled" })
    .where(
      and(
        like(notifications.dedupeKey, "verify:%"),
        eq(notifications.status, "sending"),
      ),
    )
    .returning({ id: notifications.id });
  await dispatch;

  const rows = await db
    .select({ status: notifications.status })
    .from(notifications);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  // Row 1 is in flight when the cancel lands, so it is delivered but ends
  // 'cancelled' (the sent-CAS is blocked) — the irreducible single-send
  // window. The point of the check: rows 2–6 are NOT delivered. In the
  // dedicated database the table holds exactly these six rows, so the
  // status census is exhaustive.
  ok =
    messages === 1 && rows.length === 6 && counts["cancelled"] === 6;
  console.log(
    `${ok ? "PASS" : "FAIL"}: delivered=${messages} (want 1 — only the in-flight row), rows=${rows.length}, statuses=${JSON.stringify(counts)} (want {cancelled:6}), cancelled mid-batch=${cancelled.length}`,
  );
} finally {
  server.close();
  // WITH (FORCE) terminates the script's own lingering pool connections.
  await admin
    .unsafe(`drop database if exists "${TEMP_DB}" with (force)`)
    .catch((error) => console.error(`cleanup failed: ${error}`));
  await admin.end({ timeout: 5 });
}
process.exit(ok ? 0 : 1);
