import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Novo QR via HTTP (evita Server Action + Flight com data URL grande). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await assertCanConfigureTenant();
    const { id } = await ctx.params;
    if (!id?.trim()) {
      return jsonError("connectionId inválido", 400);
    }
    const r = await apiServer<{ ok: true; qrDataUrl: string }>(
      `/whatsapp-connections/${encodeURIComponent(id)}/refresh-qr`,
      { method: "POST" },
    );
    return Response.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    if (msg === "Não autenticado" || msg.includes("Sem permissão")) {
      return jsonError(msg, 403);
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
