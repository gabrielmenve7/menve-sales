"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
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
  researchEnabled = true,
}: {
  isSuperAdmin: boolean;
  userName?: string | null;
  researchEnabled?: boolean;
}) {
  const pathname = usePathname();
  const items = researchEnabled
    ? allNavItems
    : allNavItems.filter((i) => i.href !== "/pesquisa");

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col border-0 bg-sidebar ring-0">
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.08]"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
            )}
          >
            <Icon className="size-[15px] shrink-0 opacity-80" strokeWidth={1.75} />
            {label}
          </Link>
        ))}
        {isSuperAdmin ? (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-foreground/[0.06] text-foreground dark:bg-white/[0.08]"
                : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
            )}
          >
            <Shield className="size-[15px] shrink-0 opacity-80" strokeWidth={1.75} />
            Admin
          </Link>
        ) : null}
      </nav>
      <div className="shrink-0">
        <div
          className="mx-3 h-px shrink-0 bg-foreground/[0.08] dark:bg-white/[0.12]"
          aria-hidden
        />
        <div className="p-3">
          <p className="mb-2.5 truncate px-0.5 text-[11px] text-muted-foreground">
            {userName ?? "Usuário"}
          </p>
          <Button
            variant="ghost"
            className="h-8 w-full text-[13px] text-muted-foreground hover:text-foreground"
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sair
          </Button>
        </div>
      </div>
    </aside>
  );
}
