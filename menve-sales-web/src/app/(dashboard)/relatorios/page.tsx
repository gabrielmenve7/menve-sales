import { fetchProspectingFunnel } from "@/actions/reports";
import { subDays } from "date-fns";
import { RelatoriosClient } from "./relatorios-client";

export default async function RelatoriosPage() {
  const to = new Date();
  const from = subDays(to, 30);

  const report = await fetchProspectingFunnel({
    from: from.toISOString(),
    to: to.toISOString(),
  }).catch(() => null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <RelatoriosClient initialReport={report} />
    </div>
  );
}
