"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/auth/session";
import { runMatch } from "@/lib/matching/run";

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

  const result = await runMatch({
    ...input,
    trigger: "manual",
    triggeredByUserId: admin.id,
  });

  revalidatePath("/admin/runs");
  if (result.outcome === "completed") {
    redirect(`/admin/runs/${result.runId}`);
  }
}
