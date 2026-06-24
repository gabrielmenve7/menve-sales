import {
  listOutreachCampaigns,
  type OutreachCampaignSummary,
} from "@/actions/outreach";
import { listProspectLists } from "@/actions/prospect-lists";
import { apiServer } from "@/lib/api-server";
import { getTenantFromRequest } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { DisparoClient } from "./disparo-client";
import type { WhatsAppConnection } from "@prisma/client";

export default async function DisparoPage() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  if ((tenant as { researchEnabled?: boolean }).researchEnabled === false) {
    redirect("/dashboard");
  }

  const [campaigns, lists, settings] = await Promise.all([
    listOutreachCampaigns().catch(() => [] as OutreachCampaignSummary[]),
    listProspectLists().catch(() => []),
    apiServer<{ whatsAppConnections: WhatsAppConnection[] }>("/settings").catch(
      () => ({ whatsAppConnections: [] as WhatsAppConnection[] }),
    ),
  ]);

  const connections = (settings.whatsAppConnections ?? []).filter(
    (c) => c.isActive,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <DisparoClient
        initialCampaigns={campaigns}
        prospectLists={lists}
        connections={connections}
      />
    </div>
  );
}
