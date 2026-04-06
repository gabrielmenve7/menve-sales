import { apiServer } from "@/lib/api-server";
import { getTenantFromRequest } from "@/lib/tenant";
import { PesquisaClient } from "./pesquisa-client";
import type { Pipeline, Stage } from "@prisma/client";
import { redirect } from "next/navigation";

type SearchHistory = {
  id: string;
  query: string;
  totalCount: number;
  createdAt: string;
  user: { name: string | null; email: string | null };
};

type ContactRow = {
  phone: string | null;
};

export default async function PesquisaPage() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  if ((tenant as { researchEnabled?: boolean }).researchEnabled === false) {
    redirect("/dashboard");
  }

  const [searches, pipelines, contacts] = await Promise.all([
    apiServer<SearchHistory[]>("/prospecting/searches"),
    apiServer<(Pipeline & { stages: Stage[] })[]>("/pipelines"),
    apiServer<ContactRow[]>("/contacts"),
  ]);

  const existingPhones = new Set(
    contacts.map((c) => c.phone).filter((p): p is string => !!p),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <PesquisaClient
        initialSearches={searches}
        pipelines={pipelines}
        existingPhones={existingPhones}
      />
    </div>
  );
}
