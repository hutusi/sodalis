/**
 * Verifies: rows cancelled while an outbox batch is mid-flight are NOT
 * physically sent (per-row freshness check), and their status survives.
 * Runs on isolated fixture users; unrelated pending notifications are
 * temporarily postponed and restored afterwards (snapshot-and-restore).
 * Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/outbox-cancel-mid-batch.ts
 */
import net from "node:net";
import { and, eq, inArray, like } from "drizzle-orm";

const PORT = 2526;
const PREFIX = `verify-outbox:${Date.now()}`;

// Minimal SMTP sink; delays each DATA acceptance so cancellation can land
// while the first message is on the wire. Resolves firstSend once row 1
// is definitely in flight.
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

const { db } = await import("../../src/db");
const { notifications } = await import("../../src/db/schema");
const { dispatchOutbox } = await import("../../src/lib/notify/outbox");
const { createFixtures } = await import("./fixtures");

const fx = await createFixtures(6);
// Snapshot-and-restore: postpone unrelated pending rows so the claimed
// batch contains exactly this test's rows, and put their original schedule
// back afterwards. Snapshot BEFORE the update — RETURNING would yield the
// new value.
const postponed = await db
  .select({ id: notifications.id, prev: notifications.nextAttemptAt })
  .from(notifications)
  .where(eq(notifications.status, "pending"));
if (postponed.length > 0) {
  await db
    .update(notifications)
    .set({ nextAttemptAt: new Date(Date.now() + 30 * 60_000) })
    .where(
      inArray(
        notifications.id,
        postponed.map((r) => r.id),
      ),
    );
}

let ok = false;
try {
  const payload = {
    kind: "unmatched",
    date: "2026-01-01",
    activity: { nameEn: "Lunch", nameZh: "午餐", eventTime: "11:45:00" },
    office: { nameEn: "X", nameZh: "X" },
  };
  await db.insert(notifications).values(
    fx.userIds.map((userId, i) => ({
      userId,
      channel: "email" as const,
      template: "unmatched" as const,
      locale: "zh-CN" as const,
      payload,
      dedupeKey: `${PREFIX}:${i}`,
    })),
  );

  const dispatch = dispatchOutbox();
  await firstSend; // row 1 is on the wire — cancel everything still 'sending'
  const cancelled = await db
    .update(notifications)
    .set({ status: "cancelled" })
    .where(
      and(
        like(notifications.dedupeKey, `${PREFIX}:%`),
        eq(notifications.status, "sending"),
      ),
    )
    .returning({ id: notifications.id });
  await dispatch;

  const rows = await db
    .select({ status: notifications.status })
    .from(notifications)
    .where(like(notifications.dedupeKey, `${PREFIX}:%`));
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  // Row 1 is in flight when the cancel lands, so it is delivered but ends
  // 'cancelled' (the sent-CAS is blocked) — the irreducible single-send
  // window. The point of the check: rows 2–6 are NOT delivered.
  ok = messages === 1 && counts["cancelled"] === 6;
  console.log(
    `${ok ? "PASS" : "FAIL"}: delivered=${messages} (want 1 — only the in-flight row), statuses=${JSON.stringify(counts)} (want {cancelled:6}), cancelled mid-batch=${cancelled.length}`,
  );
} finally {
  // Restore the postponed rows' original schedule, exactly as snapshotted.
  for (const row of postponed) {
    await db
      .update(notifications)
      .set({ nextAttemptAt: row.prev })
      .where(
        and(
          eq(notifications.id, row.id),
          eq(notifications.status, "pending"),
        ),
      );
  }
  await fx.cleanup();
  server.close();
}
process.exit(ok ? 0 : 1);
