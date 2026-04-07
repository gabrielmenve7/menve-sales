"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsRight,
  LayoutDashboard,
  Users,
  Kanban,
  MessageSquare,
  Settings,
  Shield,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "@/components/dashboard/user-account-menu";

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

  const items = researchEnabled
    ? allNavItems
    : allNavItems.filter((i) => i.href !== "/pesquisa");

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center rounded-lg text-[15.6px] font-medium leading-snug transition-colors",
      collapsed
        ? "justify-center px-2 py-2.5"
        : "gap-3 px-3 py-2.5",
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
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={linkClass(
              pathname === href || pathname.startsWith(href + "/"),
            )}
          >
            <Icon className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
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
            <Shield className="size-[18px] shrink-0 opacity-80" strokeWidth={1.75} />
            {collapsed ? <span className="sr-only">Admin</span> : "Admin"}
          </Link>
        ) : null}
      </nav>
      <div className="shrink-0 border-t border-border/40 dark:border-border/30">
        <div className={cn(collapsed ? "px-1.5 py-2" : "p-2")}>
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
