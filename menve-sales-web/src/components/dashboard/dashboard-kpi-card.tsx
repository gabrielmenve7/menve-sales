import type { LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border border-border/60 shadow-sm dark:border-border/50",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-[13px] font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className="rounded-md bg-muted/70 p-1.5 text-muted-foreground dark:bg-muted/50">
          <Icon className="size-4" strokeWidth={1.75} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        {sub ? (
          <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
