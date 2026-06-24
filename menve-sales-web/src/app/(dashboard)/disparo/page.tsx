import {
  getOutreachDefaultTemplate,
  listOutreachCampaigns,
  type OutreachCampaignSummary,
} from "@/actions/outreach";
import { getPrimaryProspectList } from "@/actions/prospect-lists";
import { apiServer } from "@/lib/api-server";
import { getTenantFromRequest } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { DisparoClient } from "./disparo-client";
import type { WhatsAppConnection } from "@prisma/client";
import { DEFAULT_OUTREACH_TEMPLATE } from "@/lib/outreach-template";

export default async function DisparoPage() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  if ((tenant as { researchEnabled?: boolean }).researchEnabled === false) {
    redirect("/dashboard");
  }

  const [campaigns, primaryList, settings, template] = await Promise.all([
    listOutreachCampaigns().catch(() => [] as OutreachCampaignSummary[]),
    getPrimaryProspectList().catch(() => null),
    apiServer<{ whatsAppConnections: WhatsAppConnection[] }>("/settings").catch(
      () => ({ whatsAppConnections: [] as WhatsAppConnection[] }),
    ),
    getOutreachDefaultTemplate().catch(() => ({
      templateBody: DEFAULT_OUTREACH_TEMPLATE,
    })),
  ]);

  const connections = (settings.whatsAppConnections ?? []).filter(
    (c) => c.isActive,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <DisparoClient
        initialCampaigns={campaigns}
        primaryList={primaryList}
        connections={connections}
        initialTemplate={template.templateBody}
      />
    </div>
  );
}
