"use server";

import { ActivityType } from "@/types/domain";
import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const activityTypeZ = z.enum([
  ActivityType.CALL,
  ActivityType.EMAIL,
  ActivityType.MEETING,
  ActivityType.TASK,
  ActivityType.NOTE,
  ActivityType.WHATSAPP,
]);

const activitySchema = z.object({
  title: z.string().min(1),
  type: activityTypeZ,
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  dueAt: z.string().optional(),
  description: z.string().optional(),
});

export async function createActivity(input: z.infer<typeof activitySchema>) {
  const data = activitySchema.parse(input);
  await apiServer("/activities", {
    method: "POST",
    json: data,
  });
  revalidatePath("/dashboard");
  if (data.contactId) {
    revalidatePath(`/contacts/${data.contactId}`);
  }
}

export async function completeActivity(id: string) {
  await apiServer(`/activities/${id}/complete`, { method: "PATCH" });
  revalidatePath("/dashboard");
  revalidatePath("/contacts", "layout");
}
