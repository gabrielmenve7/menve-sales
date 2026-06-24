import { nestExceptionJsonToMessage } from "@/lib/nest-api-error";

export async function parseInboxApiError(res: Response): Promise<string> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return `Falha (HTTP ${res.status}).`;
  }
  const o = data as { error?: string };
  if (o.error?.trim()) return o.error.trim();
  return `Falha (HTTP ${res.status}).`;
}

export async function inboxApiPost<T>(
  path: string,
  json: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  if (!res.ok) {
    throw new Error(await parseInboxApiError(res));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function inboxApiDelete(path: string): Promise<void> {
  const res = await fetch(path, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error(await parseInboxApiError(res));
  }
}

/** Converte erro bruto de server action legada em mensagem legível. */
export function formatInboxSendError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Não foi possível enviar.";
  const m = /^API (\d+):\s*([\s\S]*)$/.exec(raw);
  if (m) {
    return nestExceptionJsonToMessage(m[2]?.trim() || raw);
  }
  if (raw.includes("digest") || raw.includes("Server Components")) {
    return "Erro ao enviar — tente novamente. Se persistir, recarregue a página.";
  }
  return raw;
}
