"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Kanban,
  MessageCircle,
  ListTodo,
  BarChart3,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const items = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/inbox", label: "WhatsApp", icon: MessageCircle },
  { href: "/activities", label: "Atividades", icon: ListTodo },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar({
  isSuperAdmin,
  userName,
}: {
  isSuperAdmin: boolean;
  userName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[13.5rem] shrink-0 flex-col border-r border-border/50 bg-sidebar">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <span className="text-[13px] font-medium tracking-tight text-foreground">
          Menve
        </span>
        <ThemeToggle />
      </div>
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
      <div className="border-t border-border/50 p-3">
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
    </aside>
  );
}
