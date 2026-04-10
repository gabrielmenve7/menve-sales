import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function AuthSplitLayout({
  children,
  heroTitle = "CRM que acompanha sua equipe",
  heroSubtitle = "Pipeline, inbox e automações em um só lugar — com o contexto certo para cada workspace.",
}: {
  children: ReactNode;
  heroTitle?: string;
  heroSubtitle?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background md:flex-row">
      <div className="absolute right-4 top-4 z-10 md:right-6 md:top-6">
        <ThemeToggle />
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
        <div className="relative z-[1] max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Menve Sales
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
            {heroTitle}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400 md:text-[15px]">
            {heroSubtitle}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-12 md:py-16">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
