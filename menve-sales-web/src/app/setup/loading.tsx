import { Skeleton } from "@/components/ui/skeleton";

export default function SetupLoading() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <Skeleton className="h-7 w-3/5 max-w-[280px]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="mt-4 h-9 w-32 rounded-md" />
      </div>
    </div>
  );
}
