"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/auth/session";
import { db } from "@/db";
import { activityTypes } from "@/db/schema";
import { runMatch } from "@/lib/matching/run";
import { getOfficeContext, loadHolidayMap } from "@/lib/queries";
import { composeLocalTime } from "@/lib/time";

export async function rerunMatch(formData: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      officeId: z.uuid(),
      activityTypeId: z.uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .parse({
      officeId: formData.get("officeId"),
      activityTypeId: formData.get("activityTypeId"),
      date: formData.get("date"),
    });

  // Pass materialization inputs so a re-run can also recover from a failed
  // scheduler catch-up (whose materialized rows rolled back). On a healthy
  // re-run this is a no-op: existing rows win via the unique key, and the
  // close-time cutoff keeps after-close rule edits out.
  const [octx, [activity]] = await Promise.all([
    getOfficeContext(input.officeId),
    db
      .select()
      .from(activityTypes)
      .where(eq(activityTypes.id, input.activityTypeId)),
  ]);
  if (!octx || !activity) throw new Error("unknown office or activity");
  const closeAt = composeLocalTime(
    input.date,
    activity.signupCloseTime,
    octx.timezone,
  );
  const holidays = await loadHolidayMap(input.date, input.date);

  const result = await runMatch({
    ...input,
    trigger: "manual",
    triggeredByUserId: admin.id,
    catchUpMaterialize: { holidays, updatedBefore: closeAt },
  });

  revalidatePath("/admin/runs");
  if (result.outcome === "completed") {
    redirect(`/admin/runs/${result.runId}`);
  }
}
