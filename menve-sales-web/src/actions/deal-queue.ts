"use server";

import { apiServer } from "@/lib/api-server";

/** Próximo deal OPEN na mesma etapa do funil (ordem do board: `updatedAt` desc). */
export async function getNextOpenDealInSameStage(dealId: string) {
  const res = await apiServer<{
    next: { dealId: string; contactId: string } | null;
  }>(`/deals/${encodeURIComponent(dealId)}/next-in-stage`);
  return res.next;
}
