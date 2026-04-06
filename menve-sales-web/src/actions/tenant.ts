"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanManageWorkspaceFeatures } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function updateTenantName(name: string) {
  await assertCanManageWorkspaceFeatures();
  await apiServer("/settings/tenant", {
    method: "PATCH",
    json: { name },
  });
  revalidatePath("/settings");
}

export async function updateTenantResearchEnabled(researchEnabled: boolean) {
  await assertCanManageWorkspaceFeatures();
  await apiServer("/settings/tenant", {
    method: "PATCH",
    json: { researchEnabled },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/pesquisa");
}
