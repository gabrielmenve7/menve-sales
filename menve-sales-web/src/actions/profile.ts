"use server";

import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

export type ProfileUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export async function updateMyProfile(input: {
  name?: string;
  image?: string | null;
}): Promise<{ ok: true; user: ProfileUser } | { ok: false; error: string }> {
  try {
    const user = await apiServer<ProfileUser>("/auth/profile", {
      method: "PATCH",
      json: input,
    });
    revalidatePath("/", "layout");
    revalidatePath("/settings");
    return { ok: true, user };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar perfil";
    return { ok: false, error: msg };
  }
}
