"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Settings2, UserCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type WorkspaceSwitcherTenant = {
  name: string;
  slug: string;
  plan: string;
  image?: string | null;
};

function planLabel(plan: string) {
  const p = plan.trim().toLowerCase();
  if (p === "free") return "Grátis";
  if (p === "pro") return "Pro";
  if (p === "enterprise") return "Enterprise";
  return plan || "—";
}

function workspaceInitial(name: string) {
  const t = name.trim();
  if (!t) return "M";
  return t.slice(0, 1).toUpperCase();
}

export function WorkspaceSwitcher({
  tenant,
  className,
}: {
  tenant: WorkspaceSwitcherTenant;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = planLabel(tenant.plan);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-auto w-full justify-start gap-2 rounded-xl border border-border/60 bg-card/80 px-2.5 py-2 text-left shadow-sm hover:bg-card dark:border-border/50 dark:bg-card/40 dark:hover:bg-card/60",
            className,
          )}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <span
            className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground text-[13px] font-semibold text-background dark:bg-foreground dark:text-background"
            aria-hidden={!!tenant.image}
          >
            {tenant.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.image}
                alt=""
                className="size-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              workspaceInitial(tenant.name)
            )}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13px] font-semibold leading-tight tracking-tight">
              {tenant.name}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground opacity-70 transition-transform",
              open && "rotate-180",
            )}
            strokeWidth={2}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),288px)] rounded-xl border border-border/80 bg-popover p-0 shadow-xl dark:border-border/60 dark:shadow-black/50"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/60 px-4 pb-4 pt-4 dark:border-border/50">
          <div className="flex gap-3">
            <span
              className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-lg font-semibold text-background dark:bg-foreground dark:text-background"
              aria-hidden={!!tenant.image}
            >
              {tenant.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.image}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                workspaceInitial(tenant.name)
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[15px] font-semibold leading-snug">
                {tenant.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {label}
                <span className="text-border"> · </span>
                <Link
                  href="/settings"
                  className="text-primary hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Gerenciar workspace
                </Link>
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
                {tenant.slug}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-transparent bg-muted/70 py-3 text-center text-xs font-medium transition-colors",
              "hover:bg-muted hover:text-foreground dark:bg-muted/40 dark:hover:bg-muted/60",
            )}
          >
            <Settings2 className="size-[18px] opacity-90" strokeWidth={1.75} />
            Configurações
          </Link>
          <Link
            href="/settings?tab=perfil"
            onClick={() => setOpen(false)}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-transparent bg-muted/70 py-3 text-center text-xs font-medium transition-colors",
              "hover:bg-muted hover:text-foreground dark:bg-muted/40 dark:hover:bg-muted/60",
            )}
          >
            <UserCircle className="size-[18px] opacity-90" strokeWidth={1.75} />
            Perfil
          </Link>
          <Link
            href="/settings?tab=members"
            onClick={() => setOpen(false)}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border border-transparent bg-muted/70 py-3 text-center text-xs font-medium transition-colors",
              "hover:bg-muted hover:text-foreground dark:bg-muted/40 dark:hover:bg-muted/60",
            )}
          >
            <Users className="size-[18px] opacity-90" strokeWidth={1.75} />
            Pessoas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
