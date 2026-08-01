import { env } from "@/env";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { dispatchOutbox } from "@/lib/notify/outbox";
import { schedulerTick } from "@/lib/scheduling/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Upper bound on outbox passes per invocation (each claims up to 20 rows). */
const MAX_DRAIN_PASSES = 5;

/**
 * Serverless stand-in for the worker loop (ADR-0009): one scheduler tick,
 * then the outbox drained until empty. Safe to invoke concurrently — all
 * idempotency lives in Postgres (ADR-0003/0005), so an overlapping call
 * costs duplicate reads, never duplicate matches or emails.
 */
export async function GET(request: Request) {
  if (
    !isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let tickError: string | undefined;
  try {
    await schedulerTick();
  } catch (error) {
    tickError = error instanceof Error ? error.message : String(error);
    console.error(`[cron] scheduler tick failed: ${tickError}`);
  }

  // Queued emails must not be hostage to a tick bug — drain regardless.
  let outboxSent = 0;
  let outboxError: string | undefined;
  try {
    for (let pass = 0; pass < MAX_DRAIN_PASSES; pass++) {
      const sent = await dispatchOutbox();
      outboxSent += sent;
      if (sent === 0) break;
    }
  } catch (error) {
    outboxError = error instanceof Error ? error.message : String(error);
    console.error(`[cron] outbox dispatch failed: ${outboxError}`);
  }

  const ok = !tickError && !outboxError;
  return Response.json(
    {
      ok,
      tick: tickError ? "failed" : "ok",
      ...(tickError && { tickError }),
      outboxSent,
      ...(outboxError && { outboxError }),
    },
    { status: ok ? 200 : 500 },
  );
}
