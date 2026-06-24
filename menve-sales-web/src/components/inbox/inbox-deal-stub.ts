import type { DealRow } from "@/app/(dashboard)/pipeline/pipeline-types";
import type { InboxContact, InboxOpenDeal } from "./inbox-types";

/** Stub mínimo para abrir o painel do deal antes de `getDealDetail` hidratar. */
export function inboxOpenDealToDealRow(
  contact: InboxContact,
  open: InboxOpenDeal,
): DealRow {
  const { deals: _deals, ...contactRest } = contact;
  const epoch = new Date(0);
  return {
    id: open.id,
    tenantId: contact.tenantId,
    contactId: contact.id,
    pipelineId: open.pipeline.id,
    stageId: open.stage.id,
    title: open.title,
    value: open.value as DealRow["value"],
    probability: null,
    expectedClose: null,
    status: "OPEN",
    lostReason: null,
    assignedToId: null,
    customData: null,
    pipelineVisible: true,
    pipelineEnteredAt: epoch,
    createdAt: epoch,
    updatedAt: epoch,
    contact: {
      ...contactRest,
      campaignSource: null,
      contactTags: [],
    },
    stage: {
      id: open.stage.id,
      pipelineId: open.pipeline.id,
      name: open.stage.name,
      sortOrder: 0,
      probability: null,
      color: open.stage.color,
      /** Inbox não envia lifecycle; deals abertos assumem etapa ativa. */
      lifecycle: "ACTIVE",
    },
    dealTags: [],
    assignedTo: null,
  };
}
