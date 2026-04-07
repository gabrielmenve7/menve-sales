"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Users,
  Kanban,
  MessageSquare,
  Settings,
  Shield,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

function userInitial(
  name: string | null | undefined,
  email: string | null | undefined,
) {
  const n = (name ?? "").trim();
  if (n) return n.slice(0, 1).toUpperCase();
  const e = (email ?? "").trim();
  if (e) return e.slice(0, 1).toUpperCase();
  return "?";
}

const allNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/pesquisa", label: "Pesquisa", icon: Search },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar({
  isSuperAdmin,
  userName,
  userEmail,
  userImage,
  researchEnabled = true,
  collapsed = false,
  onRequestExpand,
}: {
  isSuperAdmin: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  researchEnabled?: boolean;
  collapsed?: boolean;
  onRequestExpand?: () => void;
}) {
  const pathname = usePathname();
  const nameTrim = (userName ?? "").trim();
  const emailTrim = (userEmail ?? "").trim();
  const displayName = nameTrim || emailTrim || "Usuário";
  const subEmail = nameTrim && emailTrim ? emailTrim : null;

  const items = researchEnabled
    ? allNavItems
    : allNavItems.filter((i) => i.href !== "/pesquisa");

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center rounded-lg text-[13px] font-medium transition-colors",
      collapsed
        ? "justify-center px-2 py-2"
        : "gap-2.5 px-2.5 py-2",
      active
        ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.08]"
        : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
    );

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-0 bg-sidebar ring-0">
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2",
          collapsed ? "items-center px-1" : "px-2",
        )}
      >
        {collapsed ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mb-1 size-9 shrink-0 rounded-lg border-border/60 bg-card/60 shadow-sm dark:border-border/50"
              aria-label="Expandir barra lateral"
              title="Expandir barra lateral"
              onClick={() => onRequestExpand?.()}
            >
              <ChevronsRight className="size-4 opacity-80" strokeWidth={2} />
            </Button>
            <div
              className="mb-1.5 h-px w-8 shrink-0 bg-border/50 dark:bg-border/40"
              aria-hidden
            />
          </>
        ) : null}
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={linkClass(
              pathname === href || pathname.startsWith(href + "/"),
            )}
          >
            <Icon className="size-[15px] shrink-0 opacity-80" strokeWidth={1.75} />
            {collapsed ? (
              <span className="sr-only">{label}</span>
            ) : (
              label
            )}
          </Link>
        ))}
        {isSuperAdmin ? (
          <Link
            href="/admin"
            title={collapsed ? "Admin" : undefined}
            className={linkClass(pathname.startsWith("/admin"))}
          >
            <Shield className="size-[15px] shrink-0 opacity-80" strokeWidth={1.75} />
            {collapsed ? <span className="sr-only">Admin</span> : "Admin"}
          </Link>
        ) : null}
      </nav>
      <div className="shrink-0 border-t border-border/40 dark:border-border/30">
        <div
          className={cn(
            "space-y-3",
            collapsed ? "flex flex-col items-center px-1.5 py-2" : "p-3",
          )}
        >
          <div
            className={cn(
              "flex gap-2.5",
              collapsed && "flex-col items-center gap-2",
            )}
          >
            <div
              className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/50 text-[14px] font-semibold text-foreground dark:border-border/50",
                collapsed ? "size-9 text-[12px]" : "size-10",
              )}
              aria-hidden={!!userImage}
              title={collapsed ? displayName : undefined}
            >
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userImage}
                  alt={displayName}
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span aria-hidden>
                  {userInitial(userName, userEmail)}
                </span>
              )}
            </div>
            {!collapsed ? (
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate text-[13px] font-medium leading-tight text-foreground">
                  {displayName}
                </p>
                {subEmail ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {subEmail}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={cn("space-y-1.5", collapsed && "w-full")}>
            {!collapsed ? (
              <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Aparência
              </p>
            ) : null}
            <div
              className={cn(
                "flex justify-center",
                collapsed && "w-full",
              )}
            >
              <ThemeToggle variant={collapsed ? "compact" : "default"} />
            </div>
          </div>

          <Button
            variant="ghost"
            className={cn(
              "text-muted-foreground hover:text-foreground",
              collapsed
                ? "size-9 shrink-0 p-0"
                : "h-8 w-full text-[13px]",
            )}
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sair"
            aria-label="Sair"
          >
            {collapsed ? (
              <LogOut className="size-[15px] opacity-80" strokeWidth={1.75} />
            ) : (
              "Sair"
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
