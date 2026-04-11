import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";

/** Pareamento pode levar ~10s+ (retries Evolution); padrão 10s da Vercel corta o QR. */
export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Pareamento Evolution com QR em JSON — usa HTTP normal (não Server Action),
 * para payloads grandes (data URL) não passarem pelo Flight/RSC (digest em produção).
 */
export async function POST(req: Request) {
  try {
    await assertCanConfigureTenant();
    let name: string | undefined;
    try {
      const b = (await req.json()) as { name?: string };
      name = typeof b?.name === "string" ? b.name : undefined;
    } catch {
      /* corpo vazio */
    }
    const r = await apiServer<{
      ok: true;
      connectionId: string;
      qrDataUrl: string;
    }>("/whatsapp-connections/pair", {
      method: "POST",
      json: name?.trim() ? { name: name.trim() } : {},
    });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    if (msg === "Não autenticado" || msg.includes("Sem permissão")) {
      return jsonError(msg, 403);
    }
    if (msg.startsWith("MENVE_TENANT:")) {
      return jsonError(msg.slice("MENVE_TENANT:".length).trim(), 422);
    }
    const m = /^API (\d+):\s*([\s\S]*)$/.exec(msg);
    if (m) {
      const code = Number(m[1]);
      const body = m[2]?.trim() || msg;
      return jsonError(body, code >= 400 && code < 600 ? code : 502);
    }
    return jsonError(msg, 500);
  }
}
