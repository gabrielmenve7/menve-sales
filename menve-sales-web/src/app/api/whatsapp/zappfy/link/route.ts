import { apiServer } from "@/lib/api-server";
import { nestExceptionJsonToMessage } from "@/lib/nest-api-error";
import { assertCanConfigureTenantApiRoute } from "@/lib/session";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Vincula instância Zappfy existente (token do painel) — sem QR nem admintoken. */
export async function POST(req: Request) {
  try {
    await assertCanConfigureTenantApiRoute();
    const body = (await req.json()) as {
      instanceToken?: string;
      name?: string;
    };
    const instanceToken = body.instanceToken?.trim();
    if (!instanceToken) {
      return jsonError("Informe o token da instância Zappfy.", 400);
    }
    const r = await apiServer<{
      ok: true;
      connectionId: string;
      connected: boolean;
      detail?: string;
    }>("/whatsapp-connections/zappfy/link", {
      method: "POST",
      json: {
        instanceToken,
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      },
    });
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    if (msg === "Não autenticado" || msg.includes("Sem permissão")) {
      return jsonError(msg, 403);
    }
    const m = /^API (\d+):\s*([\s\S]*)$/.exec(msg);
    if (m) {
      const code = Number(m[1]);
      const friendly = nestExceptionJsonToMessage(m[2]?.trim() || msg);
      return jsonError(friendly, code >= 400 && code < 600 ? code : 502);
    }
    return jsonError(msg, 500);
  }
}
