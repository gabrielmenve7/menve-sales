import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceOnboardingSkeleton() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 pt-8">
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-[min(280px,85%)]" />
        <Skeleton className="mt-2 h-4 w-full max-w-[400px]" />
        <Skeleton className="mt-1 h-4 w-full max-w-[360px]" />
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <Skeleton className="h-3 w-full max-w-[320px]" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
