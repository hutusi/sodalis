/**
 * Verifies: rows cancelled while an outbox batch is mid-flight are NOT
 * physically sent (per-row freshness check), and their status survives.
 * Needs the dev database. Exits 0 on PASS, 1 on FAIL.
 *
 *   bun run scripts/verify/outbox-cancel-mid-batch.ts
 */
import net from "node:net";
import { and, eq, like } from "drizzle-orm";

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
const { notifications, users } = await import("../../src/db/schema");
const { dispatchOutbox } = await import("../../src/lib/notify/outbox");

const someUsers = await db.select().from(users).limit(6);
if (someUsers.length < 6) {
  console.error("FAIL: need >= 6 seeded users (run: bun run seed --demo)");
  process.exit(1);
}

// Quarantine unrelated pending rows (stale dev leftovers) so the claimed
// batch contains exactly this test's rows; they become due again later.
await db
  .update(notifications)
  .set({ nextAttemptAt: new Date(Date.now() + 30 * 60_000) })
  .where(eq(notifications.status, "pending"));

const payload = {
  kind: "unmatched",
  date: "2026-01-01",
  activity: { nameEn: "Lunch", nameZh: "午餐", eventTime: "11:45:00" },
  office: { nameEn: "X", nameZh: "X" },
};
await db.insert(notifications).values(
  someUsers.map((u, i) => ({
    userId: u.id,
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

await db.delete(notifications).where(like(notifications.dedupeKey, `${PREFIX}:%`));
server.close();

// Row 1 is in flight when the cancel lands, so it is delivered but ends
// 'cancelled' (the sent-CAS is blocked) — the irreducible single-send
// window. The point of the check: rows 2–6 are NOT delivered.
const ok = messages === 1 && counts["cancelled"] === 6;
console.log(
  `${ok ? "PASS" : "FAIL"}: delivered=${messages} (want 1 — only the in-flight row), statuses=${JSON.stringify(counts)} (want {cancelled:6}), cancelled mid-batch=${cancelled.length}`,
);
process.exit(ok ? 0 : 1);
