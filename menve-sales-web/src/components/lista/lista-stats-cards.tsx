import type { ReactNode } from "react";
import { Building2, Globe, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type ListaStats = {
  searches: number;
  companies: number;
  qualified: number;
};

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={
              accent
                ? "text-2xl font-semibold text-emerald-600 dark:text-emerald-400"
                : "text-2xl font-semibold"
            }
          >
            {value.toLocaleString("pt-BR")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ListaStatsCards({ stats }: { stats: ListaStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        icon={<History className="size-5" />}
        label="Pesquisas"
        value={stats.searches}
      />
      <StatCard
        icon={<Building2 className="size-5" />}
        label="Empresas pesquisadas"
        value={stats.companies}
      />
      <StatCard
        icon={<Globe className="size-5" />}
        label="Qualificadas (com site)"
        value={stats.qualified}
        accent
      />
    </div>
  );
}
