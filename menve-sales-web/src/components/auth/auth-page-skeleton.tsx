import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Espelha o layout de `AuthSplitLayout` (hero + coluna do formulário) para Suspense,
 * `loading.tsx` e enquanto a sessão (NextAuth) ainda está `loading`.
 */
export function AuthPageSkeleton({
  className,
  denseForm,
}: {
  className?: string;
  /** Menos linhas no bloco do form (ex.: só login). */
  denseForm?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col bg-background md:flex-row",
        className,
      )}
    >
      <div className="absolute right-4 top-4 z-10 md:right-6 md:top-6">
        <Skeleton className="size-9 rounded-lg" aria-hidden />
      </div>

      <div
        className={cn(
          "relative flex min-h-[42vh] flex-col justify-end px-6 pb-10 pt-16 md:min-h-screen md:w-[42%] md:justify-center md:px-10 md:pb-12 md:pt-20",
          "bg-zinc-950 text-zinc-50 dark:bg-zinc-950",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(circle at 80% 60%, rgba(16,185,129,0.2), transparent 40%)",
          }}
          aria-hidden
        />
        <div className="relative z-[1] max-w-md space-y-3">
          <Skeleton className="h-3 w-28 bg-zinc-700/90" />
          <Skeleton className="h-9 w-full max-w-[300px] bg-zinc-700/85 md:h-10" />
          <Skeleton className="h-4 w-full max-w-[340px] bg-zinc-600/70" />
          <Skeleton className="h-4 w-full max-w-[280px] bg-zinc-600/60" />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-12 md:py-16">
        <div className="w-full max-w-[400px] space-y-5">
          <Skeleton className="h-[52px] w-full rounded-lg" />
          <div className="space-y-4">
            {(denseForm ? [1, 2] : [1, 2, 3, 4]).map((k) => (
              <div key={k} className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="flex justify-center pt-1">
            <Skeleton className="h-3 w-44" />
          </div>
          <div className="flex justify-center">
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Faixa de convite enquanto `fetchInvitePreview` ainda não retornou. */
export function AuthInviteBannerSkeleton() {
  return (
    <div
      className="mb-6 space-y-2.5 rounded-xl border border-border/50 bg-muted/25 px-4 py-4 dark:bg-muted/15"
      role="status"
      aria-label="Carregando dados do convite"
    >
      <Skeleton className="h-4 w-[min(280px,85%)]" />
      <Skeleton className="h-3.5 w-full max-w-[320px]" />
    </div>
  );
}
