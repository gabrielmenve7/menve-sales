import { apiServer } from "@/lib/api-server";
import { nestExceptionJsonToMessage } from "@/lib/nest-api-error";
import { assertCanConfigureTenantApiRoute } from "@/lib/session";

export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** HTTP em vez de Server Action: evita `revalidatePath` + digest em produção. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await assertCanConfigureTenantApiRoute();
    const { id } = await ctx.params;
    if (!id?.trim()) {
      return jsonError("connectionId inválido", 400);
    }
    const r = await apiServer<{ ok: true }>(
      `/whatsapp-connections/${encodeURIComponent(id)}/reapply-webhook`,
      { method: "POST" },
    );
    return Response.json(r ?? { ok: true as const });
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
