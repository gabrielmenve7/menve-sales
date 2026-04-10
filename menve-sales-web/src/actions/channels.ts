"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function createMetaChannel(input: {
  name?: string;
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
}) {
  await assertCanConfigureTenant();
  const r = await apiServer<{ ok: true; connectionId: string }>(
    "/whatsapp-connections/create-meta",
    { method: "POST", json: input },
  );
  revalidatePath("/settings");
  revalidatePath("/inbox");
  return r;
}

export async function createInstagramChannel(input: {
  name?: string;
  pageId: string;
  accessToken: string;
  igUserId: string;
}) {
  await assertCanConfigureTenant();
  const r = await apiServer<{ ok: true; connectionId: string }>(
    "/whatsapp-connections/create-instagram",
    { method: "POST", json: input },
  );
  revalidatePath("/settings");
  revalidatePath("/inbox");
  return r;
}
