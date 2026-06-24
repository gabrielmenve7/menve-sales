import { apiServer } from "@/lib/api-server";
import {
  prospectingGetStats,
  type ProspectSearchHistory,
} from "@/actions/pesquisa";
import { getTenantFromRequest } from "@/lib/tenant";
import { PesquisaClient } from "./pesquisa-client";
import type { Pipeline, Stage } from "@prisma/client";
import { redirect } from "next/navigation";

type ContactRow = {
  phone: string | null;
};

export default async function PesquisaPage() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  if ((tenant as { researchEnabled?: boolean }).researchEnabled === false) {
    redirect("/dashboard");
  }

  const [stats, searches, pipelines, contacts] = await Promise.all([
    prospectingGetStats().catch(() => ({
      searches: 0,
      companies: 0,
      qualified: 0,
    })),
    apiServer<ProspectSearchHistory[]>("/prospecting/searches"),
    apiServer<(Pipeline & { stages: Stage[] })[]>("/pipelines"),
    apiServer<ContactRow[]>("/contacts"),
  ]);

  const existingPhones = new Set(
    contacts.map((c) => c.phone).filter((p): p is string => !!p),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <PesquisaClient
        initialStats={stats}
        initialSearches={searches}
        pipelines={pipelines}
        existingPhones={existingPhones}
      />
    </div>
  );
}
