import { apiServer } from "@/lib/api-server";
import { nestExceptionJsonToMessage } from "@/lib/nest-api-error";
import { requireSession } from "@/lib/session";

export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function mapApiError(e: unknown) {
  const msg = e instanceof Error ? e.message : "Erro desconhecido";
  if (msg === "Não autenticado") return jsonError(msg, 403);
  if (msg.startsWith("MENVE_TENANT:")) {
    return jsonError(msg.slice("MENVE_TENANT:".length).trim(), 422);
  }
  const m = /^API (\d+):\s*([\s\S]*)$/.exec(msg);
  if (m) {
    const code = Number(m[1]);
    const friendly = nestExceptionJsonToMessage(m[2]?.trim() || msg);
    return jsonError(friendly, code >= 400 && code < 600 ? code : 502);
  }
  return jsonError(msg, 500);
}

/** HTTP em vez de Server Action: evita `revalidatePath` + digest em produção. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await ctx.params;
    if (!id?.trim()) {
      return jsonError("conversationId inválido", 400);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido", 400);
    }
    await apiServer(`/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      json: body,
    });
    return Response.json({ ok: true as const });
  } catch (e) {
    return mapApiError(e);
  }
}
