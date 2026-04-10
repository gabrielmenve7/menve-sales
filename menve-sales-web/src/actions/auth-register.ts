"use server";

function apiBase() {
  const u = process.env.INTERNAL_API_URL?.trim();
  return u ? u.replace(/\/$/, "") : "";
}

export type RegisterAccountResult =
  | { ok: true; accessToken: string }
  | { ok: false; message: string };

export async function registerAccount(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<RegisterAccountResult> {
  const base = apiBase();
  if (!base) {
    return {
      ok: false,
      message:
        "INTERNAL_API_URL não está definida no servidor (ex.: variáveis de ambiente na Vercel).",
    };
  }
  const r = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    }),
    cache: "no-store",
  });
  const data = (await r.json()) as {
    accessToken?: string;
    error?: string;
    message?: string | string[];
  };
  if (!r.ok) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(", ")
          : (data.error ?? "Não foi possível cadastrar.");
    return { ok: false, message: msg };
  }
  if (!data.accessToken) {
    return { ok: false, message: "Resposta inválida da API." };
  }
  return { ok: true, accessToken: data.accessToken };
}

export type InvitePreviewResult =
  | { ok: true; workspaceName: string; email?: string }
  | { ok: false };

export async function fetchInvitePreview(
  token: string,
): Promise<InvitePreviewResult> {
  const t = token.trim();
  if (!t) return { ok: false };
  const base = apiBase();
  if (!base) return { ok: false };
  try {
    const r = await fetch(
      `${base}/auth/invite-preview?token=${encodeURIComponent(t)}`,
      { cache: "no-store" },
    );
    const data = (await r.json()) as {
      valid?: boolean;
      workspaceName?: string;
      email?: string;
    };
    if (!data.valid) return { ok: false };
    return {
      ok: true,
      workspaceName: data.workspaceName ?? "Workspace",
      email: data.email,
    };
  } catch {
    return { ok: false };
  }
}
