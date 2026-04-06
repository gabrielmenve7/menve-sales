"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Settings, Users } from "lucide-react";
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
        className="w-[min(calc(100vw-2rem),288px)] rounded-xl border border-border/80 bg-popover p-2 shadow-xl dark:border-border/60 dark:shadow-black/50"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex gap-2">
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-[13px] font-medium transition-colors",
              "hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
              "dark:border-border/80 dark:bg-background/40 dark:hover:bg-background/70",
            )}
          >
            <Settings className="size-4 shrink-0 opacity-90" strokeWidth={2} />
            <span className="truncate">Configurações</span>
          </Link>
          <Link
            href="/settings?tab=members"
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-[13px] font-medium transition-colors",
              "hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
              "dark:border-border/80 dark:bg-background/40 dark:hover:bg-background/70",
            )}
          >
            <Users className="size-4 shrink-0 opacity-90" strokeWidth={2} />
            <span className="truncate">Pessoas</span>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
