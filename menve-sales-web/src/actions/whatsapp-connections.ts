"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";
import { revalidatePath } from "next/cache";

/** Cria conexão no Menve, instância na Evolution com webhook e devolve QR. */
export async function startEvolutionPairing(input?: { name?: string }) {
  await assertCanConfigureTenant();
  const r = await apiServer<{
    ok: true;
    connectionId: string;
    qrDataUrl: string;
  }>("/whatsapp-connections/pair", {
    method: "POST",
    json: input?.name ? { name: input.name } : {},
  });
  revalidatePath("/inbox");
  // Não revalidar /settings aqui: invalidar essa rota força refetch do Server Component
  // enquanto o modal do QR está aberto e em produção costuma gerar digest + "Sem QR".
  // A lista em Configurações atualiza ao fechar o modal (router.refresh) ou em outras ações.
  return r;
}

export async function refreshEvolutionQr(connectionId: string) {
  await assertCanConfigureTenant();
  return apiServer<{ ok: true; qrDataUrl: string }>(
    `/whatsapp-connections/${connectionId}/refresh-qr`,
    { method: "POST" },
  );
}

export async function pollEvolutionStatus(connectionId: string) {
  await assertCanConfigureTenant();
  return apiServer<
    | { ok: false; error: "not_found" | "invalid_config" }
    | { ok: true; connected: boolean; detail?: unknown }
  >(`/whatsapp-connections/${connectionId}/status`);
}

/** Reaplica webhook na Evolution (URL única, sem sufixo /messages-upsert). */
export async function reapplyEvolutionWebhook(connectionId: string) {
  await assertCanConfigureTenant();
  await apiServer(`/whatsapp-connections/${connectionId}/reapply-webhook`, {
    method: "POST",
  });
  revalidatePath("/inbox");
  return { ok: true as const };
}

export async function deleteWhatsAppConnection(connectionId: string) {
  await assertCanConfigureTenant();
  await apiServer(`/whatsapp-connections/${connectionId}`, {
    method: "DELETE",
  });
  revalidatePath("/inbox");
  revalidatePath("/settings");
}
