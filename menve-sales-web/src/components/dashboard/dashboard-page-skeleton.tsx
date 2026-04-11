import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type DashboardPageSkeletonVariant = "default" | "table" | "compact";

export function DashboardPageSkeleton({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: DashboardPageSkeletonVariant;
}) {
  if (variant === "compact") {
    return (
      <div className={cn("space-y-4 p-5 md:p-6", className)}>
        <Skeleton className="h-7 w-[min(200px,55%)]" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col gap-4 p-5 md:p-6", className)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-[min(220px,50%)]" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <div className="space-y-2 rounded-xl border border-border/40 bg-muted/20 p-3 dark:bg-muted/10">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 p-5 md:p-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-8 w-[min(240px,70%)]" />
        <Skeleton className="h-4 w-[min(400px,92%)] max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl sm:col-span-2 lg:col-span-1" />
      </div>
      <Skeleton className="min-h-[220px] w-full rounded-xl" />
    </div>
  );
}
