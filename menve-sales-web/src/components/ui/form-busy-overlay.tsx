import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Overlay com skeleton durante submit (mantém layout estável, reduz sensação de travamento). */
export function FormBusyOverlay({
  show,
  className,
  label = "Processando…",
}: {
  show: boolean;
  className?: string;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/75 backdrop-blur-[2px]",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex w-full max-w-[200px] flex-col gap-2">
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-2.5 w-4/5 rounded-full opacity-80" />
      </div>
      <Skeleton className="h-9 w-36 rounded-md" />
    </div>
  );
}
