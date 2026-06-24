import { fetchRevenueStats } from "@/actions/financeiro";
import { assertCanConfigureTenant } from "@/lib/session";
import { subDays } from "date-fns";
import { FinanceiroClient } from "./financeiro-client";

export default async function FinanceiroPage() {
  await assertCanConfigureTenant();

  const to = new Date();
  const from = subDays(to, 30);

  const stats = await fetchRevenueStats({
    from: from.toISOString(),
    to: to.toISOString(),
  }).catch(() => null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <FinanceiroClient initialStats={stats} />
    </div>
  );
}
