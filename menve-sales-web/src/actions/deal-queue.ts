"use server";

import { apiServer } from "@/lib/api-server";

export type DealStageQueuePayload = {
  next: { dealId: string; contactId: string } | null;
  queueMeta: { position: number; total: number };
};

function normalizeDealStageQueuePayload(raw: unknown): DealStageQueuePayload {
  if (raw == null || typeof raw !== "object") {
    return { next: null, queueMeta: { position: 0, total: 0 } };
  }
  const o = raw as Record<string, unknown>;

  const parseNext = (v: unknown) => {
    if (!v || typeof v !== "object") return null;
    const n = v as { dealId?: unknown; contactId?: unknown };
    if (typeof n.dealId !== "string" || typeof n.contactId !== "string") {
      return null;
    }
    return { dealId: n.dealId, contactId: n.contactId };
  };

  if (o.queueMeta && typeof o.queueMeta === "object") {
    const qm = o.queueMeta as { position?: unknown; total?: unknown };
    return {
      next: parseNext(o.next),
      queueMeta: {
        position: typeof qm.position === "number" ? qm.position : 0,
        total: typeof qm.total === "number" ? qm.total : 0,
      },
    };
  }

  /** Deploy antigo: corpo plano ou só `next` sem `queueMeta`. */
  const legacyNext = parseNext(o.next) ?? parseNext(o);
  if (legacyNext) {
    return {
      next: legacyNext,
      queueMeta: { position: 1, total: 2 },
    };
  }

  return { next: null, queueMeta: { position: 0, total: 0 } };
}

/** Próximo deal na mesma etapa, ordem do quadro; `queueMeta` para tooltip (posição 1-based). */
export async function getNextOpenDealInSameStage(
  dealId: string,
): Promise<DealStageQueuePayload> {
  const raw = await apiServer<unknown>(
    `/deals/${encodeURIComponent(dealId)}/next-in-stage`,
  );
  return normalizeDealStageQueuePayload(raw);
}
