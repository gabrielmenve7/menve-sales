"use server";

function apiBase() {
  const u = process.env.INTERNAL_API_URL?.trim();
  return u ? u.replace(/\/$/, "") : "";
}

/** Evita cadastro indo para o próprio Next (404 "Cannot POST /auth/register"). */
function internalApiLooksLikeFrontendSite(base: string): boolean {
  const appUrl =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : "");
  if (!appUrl) return false;
  try {
    return new URL(base).host === new URL(appUrl).host;
  } catch {
    return false;
  }
}

function friendlyRegisterFailure(status: number, raw: string | undefined) {
  const t = raw ?? "";
  if (
    status === 404 ||
    t.includes("Cannot POST") ||
    t.includes("Cannot GET")
  ) {
    return (
      "Cadastro indisponível nesse endereço (404). Ou INTERNAL_API_URL na Vercel não é a API Nest " +
      "(sem barra no final, não use a URL do site Next), ou o deploy da API no Railway está **antigo** " +
      "e ainda não inclui POST /auth/register — abra Railway → Deployments e faça deploy do último commit do repositório."
    );
  }
  return t || "Não foi possível cadastrar.";
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
  if (internalApiLooksLikeFrontendSite(base)) {
    return {
      ok: false,
      message:
        "INTERNAL_API_URL aponta para o mesmo domínio do site (Next). Cadastro precisa da URL pública da API Nest (Railway etc.), não da Vercel.",
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
  let data: {
    accessToken?: string;
    error?: string;
    message?: string | string[];
  } = {};
  const text = await r.text();
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    data = {};
  }
  if (!r.ok) {
    const rawMsg =
      typeof data.message === "string"
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(", ")
          : typeof data.error === "string"
            ? data.error
            : text.trim().slice(0, 200) || undefined;
    return {
      ok: false,
      message: friendlyRegisterFailure(r.status, rawMsg),
    };
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
