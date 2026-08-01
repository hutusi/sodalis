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
 *
 * The response body stays opaque (status flags and counts only): the public
 * cron workflow prints bodies into public Actions logs, so failure detail
 * goes to console.error → runtime logs instead.
 */
export async function GET(request: Request) {
  if (
    !isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let tickFailed = false;
  let failedMatches = 0;
  try {
    ({ failedMatches } = await schedulerTick());
  } catch (error) {
    tickFailed = true;
    console.error("[cron] scheduler tick failed:", error);
  }

  // Queued emails must not be hostage to a tick bug — drain regardless.
  let outboxThrew = false;
  let outboxSent = 0;
  let outboxFailed = 0;
  try {
    for (let pass = 0; pass < MAX_DRAIN_PASSES; pass++) {
      const { sent, failed } = await dispatchOutbox();
      outboxSent += sent;
      outboxFailed += failed;
      // Failed rows back off to a future nextAttemptAt, so keep draining
      // only while something actually went out.
      if (sent === 0) break;
    }
  } catch (error) {
    outboxThrew = true;
    console.error("[cron] outbox dispatch failed:", error);
  }

  const ok =
    !tickFailed && !outboxThrew && failedMatches === 0 && outboxFailed === 0;
  return Response.json(
    {
      ok,
      tick: tickFailed ? "failed" : "ok",
      outbox: outboxThrew || outboxFailed > 0 ? "failed" : "ok",
      failedMatches,
      outboxSent,
      outboxFailed,
    },
    { status: ok ? 200 : 500 },
  );
}
