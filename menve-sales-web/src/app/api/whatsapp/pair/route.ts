import { apiServer } from "@/lib/api-server";
import { nestExceptionJsonToMessage } from "@/lib/nest-api-error";
import { assertCanConfigureTenantApiRoute } from "@/lib/session";

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
    await assertCanConfigureTenantApiRoute();
    let name: string | undefined;
    let provider: "EVOLUTION" | "ZAPPFY" | undefined;
    try {
      const b = (await req.json()) as { name?: string; provider?: string };
      name = typeof b?.name === "string" ? b.name : undefined;
      provider =
        b?.provider === "EVOLUTION" || b?.provider === "ZAPPFY"
          ? b.provider
          : undefined;
    } catch {
      /* corpo vazio */
    }
    const r = await apiServer<{
      ok: true;
      connectionId: string;
      qrDataUrl: string;
    }>("/whatsapp-connections/pair", {
      method: "POST",
      json: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(provider ? { provider } : {}),
      },
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
      const bodyRaw = m[2]?.trim() || msg;
      const friendly = nestExceptionJsonToMessage(bodyRaw);
      return jsonError(friendly, code >= 400 && code < 600 ? code : 502);
    }
    return jsonError(msg, 500);
  }
}
