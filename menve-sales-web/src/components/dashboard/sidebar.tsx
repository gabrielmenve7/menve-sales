"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "@/components/dashboard/user-account-menu";
import {
  FOOTER_NAV_ITEMS,
  NAV_SECTIONS,
  filterFooterItems,
  filterNavSections,
  readExpandedSections,
  writeExpandedSections,
  type NavContext,
} from "@/lib/nav-config";

export function Sidebar({
  isSuperAdmin,
  canManageWorkspace = false,
  canConfigureTenant = false,
  userName,
  userEmail,
  userImage,
  researchEnabled = true,
  collapsed = false,
  onRequestExpand,
}: {
  isSuperAdmin: boolean;
  canManageWorkspace?: boolean;
  canConfigureTenant?: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  researchEnabled?: boolean;
  collapsed?: boolean;
  onRequestExpand?: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const ctx: NavContext = {
    researchEnabled,
    isSuperAdmin,
    canManageWorkspace,
    canConfigureTenant,
  };

  const sections = filterNavSections(NAV_SECTIONS, ctx);
  const footerItems = filterFooterItems(FOOTER_NAV_ITEMS, ctx);

  useEffect(() => {
    const stored = readExpandedSections();
    const defaults: Record<string, boolean> = {};
    for (const s of sections) {
      defaults[s.id] = stored[s.id] ?? true;
    }
    setExpanded(defaults);
  }, [sections.length, researchEnabled]);

  const toggleSection = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeExpandedSections(next);
      return next;
    });
  }, []);

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center rounded-lg text-[15px] font-medium leading-snug transition-colors",
      collapsed ? "justify-center px-4 py-2.5" : "gap-2.5 px-5 py-2",
      active
        ? "border-l-2 border-amber-400 bg-neutral-200/90 font-semibold text-foreground dark:bg-white/[0.14] dark:text-amber-300"
        : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.08] dark:hover:text-white",
    );

  const isItemActive = (href: string, activeMatch?: (p: string) => boolean) =>
    activeMatch ? activeMatch(pathname) : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-0 bg-transparent text-foreground ring-0">
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2",
          collapsed ? "items-center px-2" : "px-3",
        )}
      >
        {collapsed ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mb-1 size-11 shrink-0 rounded-lg border-border/60 bg-card/60 shadow-sm dark:border-border/50"
              aria-label="Expandir barra lateral"
              title="Expandir barra lateral"
              onClick={() => onRequestExpand?.()}
            >
              <ChevronsRight className="size-[19px] opacity-80" strokeWidth={2} />
            </Button>
            <div
              className="mb-1.5 h-px w-10 shrink-0 bg-border/50 dark:bg-border/40"
              aria-hidden
            />
          </>
        ) : null}

        {sections.map((section) => {
          const isOpen = expanded[section.id] !== false;
          return (
            <div key={section.id} className="mb-1">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="mb-0.5 flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 transition-transform",
                      !isOpen && "-rotate-90",
                    )}
                    aria-hidden
                  />
                  {section.label}
                </button>
              ) : null}

              {(collapsed || isOpen) &&
                section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.href, item.activeMatch);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      prefetch={true}
                      title={collapsed ? item.label : undefined}
                      className={linkClass(active)}
                    >
                      <Icon
                        className={cn(
                          "size-[18px] shrink-0 opacity-95",
                          active && "text-amber-500 dark:text-amber-400",
                        )}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        item.label
                      )}
                    </Link>
                  );
                })}
            </div>
          );
        })}

        {footerItems.length > 0 ? (
          <div
            className={cn(
              "mt-auto border-t border-border/40 pt-2 dark:border-border/30",
              collapsed && "w-full",
            )}
          >
            {!collapsed ? (
              <p className="mb-0.5 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Mais
              </p>
            ) : null}
            {footerItems.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item.href, item.activeMatch);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={true}
                  title={collapsed ? item.label : undefined}
                  className={linkClass(active)}
                >
                  <Icon className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} aria-hidden />
                  {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </nav>
      <div className="shrink-0 border-t border-border/40 dark:border-border/30">
        <div className="px-3 py-2">
          <UserAccountMenu
            collapsed={collapsed}
            userName={userName}
            userEmail={userEmail}
            userImage={userImage}
          />
        </div>
      </div>
    </aside>
  );
}
