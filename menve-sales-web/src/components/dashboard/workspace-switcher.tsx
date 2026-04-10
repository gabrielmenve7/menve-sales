"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { switchWorkspace } from "@/actions/workspace";
import { ChevronDown, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type WorkspaceSwitcherTenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  image?: string | null;
};

export type WorkspaceOption = WorkspaceSwitcherTenant;

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
  workspaces = [],
  className,
  compactIconOnly = false,
}: {
  tenant: WorkspaceSwitcherTenant;
  /** Lista para troca de contexto (vários memberships). */
  workspaces?: WorkspaceOption[];
  className?: string;
  compactIconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { update } = useSession();
  const router = useRouter();
  const label = planLabel(tenant.plan);

  const list =
    workspaces.length > 0 ? workspaces : [{ ...tenant }];

  function onSwitch(tenantId: string) {
    if (tenantId === tenant.id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        const data = await switchWorkspace(tenantId);
        await update({
          accessToken: data.accessToken,
          tenantId: data.user.tenantId,
          workspaces: data.workspaces,
          needsOnboarding: data.needsOnboarding,
        });
        setOpen(false);
        router.refresh();
      } catch {
        /* toast opcional */
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            compactIconOnly
              ? "h-auto w-full flex-col justify-center gap-0 rounded-xl border border-border/60 bg-card/80 px-1.5 py-2.5 shadow-sm hover:bg-card dark:border-border/50 dark:bg-card/40 dark:hover:bg-card/60"
              : "h-auto w-full justify-start gap-2.5 rounded-xl border border-border/60 bg-card/80 px-3 py-2.5 text-left shadow-sm hover:bg-card dark:border-border/50 dark:bg-card/40 dark:hover:bg-card/60",
            className,
          )}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={compactIconOnly ? `Workspace: ${tenant.name}` : undefined}
          title={compactIconOnly ? tenant.name : undefined}
        >
          <span
            className={cn(
              "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground font-semibold text-background dark:bg-foreground dark:text-background",
              compactIconOnly ? "size-11 text-[16.8px]" : "size-10 text-[15.6px]",
            )}
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
          {!compactIconOnly ? (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[15.6px] font-semibold leading-tight tracking-tight">
                  {tenant.name}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-[19px] shrink-0 text-muted-foreground opacity-70 transition-transform",
                  open && "rotate-180",
                )}
                strokeWidth={2}
              />
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),440px)] rounded-xl border border-border/80 bg-popover p-0 shadow-xl dark:border-border/60 dark:shadow-black/50"
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
                  className="text-primary-solid hover:underline"
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

        {list.length > 1 ? (
          <div className="border-b border-border/60 px-3 py-2 dark:border-border/50">
            <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workspaces
            </p>
            <ul className="max-h-44 space-y-0.5 overflow-y-auto">
              {list.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={pending || w.id === tenant.id}
                    className={cn(
                      "w-full rounded-lg px-2 py-2 text-left text-[13px] transition-colors hover:bg-muted/80",
                      w.id === tenant.id && "bg-muted font-medium",
                    )}
                    onClick={() => onSwitch(w.id)}
                  >
                    {w.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 p-3">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent bg-muted/70 px-2 py-3 text-center text-xs font-medium leading-snug transition-colors",
              "hover:bg-muted hover:text-foreground dark:bg-muted/40 dark:hover:bg-muted/60",
            )}
          >
            <Settings2 className="size-[18px] shrink-0 opacity-90" strokeWidth={1.75} />
            <span className="break-words">Configurações</span>
          </Link>
          <Link
            href="/settings?tab=members"
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-transparent bg-muted/70 px-2 py-3 text-center text-xs font-medium leading-snug transition-colors",
              "hover:bg-muted hover:text-foreground dark:bg-muted/40 dark:hover:bg-muted/60",
            )}
          >
            <Users className="size-[18px] shrink-0 opacity-90" strokeWidth={1.75} />
            <span className="break-words">Pessoas</span>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
