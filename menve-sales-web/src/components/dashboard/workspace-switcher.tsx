"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { switchWorkspace } from "@/actions/workspace";
import { ChevronsUpDown, Settings2, Users } from "lucide-react";
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

/** Duas letras (ex.: João Pedro → JP), como na referência visual do seletor de workspace. */
function workspaceInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[1]?.[0];
    if (a && b) return (a + b).toUpperCase();
  }
  const w = parts[0] ?? "";
  if (w.length >= 2) return w.slice(0, 2).toUpperCase();
  const one = w.slice(0, 1).toUpperCase();
  return one || "M";
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
              ? "h-auto w-full flex-col justify-center gap-0 rounded-xl border-0 bg-transparent px-1.5 py-2.5 shadow-none hover:bg-muted/60 dark:hover:bg-white/[0.06]"
              : "h-auto w-full justify-start gap-2.5 rounded-xl border-0 bg-transparent px-2 py-2 text-left shadow-none hover:bg-muted/60 dark:hover:bg-white/[0.06]",
            className,
          )}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={compactIconOnly ? `Workspace: ${tenant.name}` : undefined}
          title={compactIconOnly ? tenant.name : undefined}
        >
          <span
            className={cn(
              "relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#15263f] font-semibold text-white dark:bg-[#1e3a5f]",
              compactIconOnly
                ? "size-[35px] text-[10px] tracking-tight"
                : "size-[29px] text-[10px] tracking-tight",
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
              workspaceInitials(tenant.name)
            )}
          </span>
          {!compactIconOnly ? (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight text-foreground">
                  {tenant.name}
                </span>
              </span>
              <ChevronsUpDown
                className={cn(
                  "size-[17px] shrink-0 text-muted-foreground opacity-80 transition-transform",
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
              className="relative flex size-[38px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#15263f] text-[12px] font-semibold text-white dark:bg-[#1e3a5f]"
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
                workspaceInitials(tenant.name)
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
