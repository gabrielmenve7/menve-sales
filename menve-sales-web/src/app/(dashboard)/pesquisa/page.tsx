import { apiServer } from "@/lib/api-server";
import { getPrimaryProspectList } from "@/actions/prospect-lists";
import {
  prospectingGetStats,
  type ProspectSearchHistory,
} from "@/actions/pesquisa";
import { getTenantFromRequest } from "@/lib/tenant";
import { PesquisaClient } from "./pesquisa-client";
import { redirect } from "next/navigation";

export default async function PesquisaPage() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  if ((tenant as { researchEnabled?: boolean }).researchEnabled === false) {
    redirect("/dashboard");
  }

  const [stats, searches, primaryList] = await Promise.all([
    prospectingGetStats().catch(() => ({
      searches: 0,
      companies: 0,
      qualified: 0,
    })),
    apiServer<ProspectSearchHistory[]>("/prospecting/searches"),
    getPrimaryProspectList().catch(() => null),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <PesquisaClient
        initialStats={stats}
        initialSearches={searches}
        initialPrimaryList={primaryList}
      />
    </div>
  );
}
