"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsRight,
  MessageCircle,
  Trello,
  LayoutGrid,
  Package,
  Settings2,
  Shield,
  Users,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "@/components/dashboard/user-account-menu";

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

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center rounded-lg text-[15px] font-medium leading-snug transition-colors",
      collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-2.5 py-2",
      active
        ? "bg-neutral-200/90 font-semibold text-foreground dark:bg-white/[0.14] dark:text-white"
        : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.08] dark:hover:text-white",
    );

  const isInboxRoute = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-0 bg-transparent text-foreground ring-0">
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2",
          collapsed ? "items-center px-1" : "px-1.5",
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

        <Link
          href="/inbox"
          prefetch={true}
          title={collapsed ? "WhatsApp" : undefined}
          className={linkClass(isInboxRoute)}
        >
          <MessageCircle
            className="size-[18px] shrink-0 text-current opacity-95"
            strokeWidth={1.35}
            aria-hidden
          />
          {collapsed ? <span className="sr-only">WhatsApp</span> : "WhatsApp"}
        </Link>

        <Link
          href="/pipeline"
          prefetch={true}
          title={collapsed ? "Funil de vendas" : undefined}
          className={linkClass(pathname === "/pipeline" || pathname.startsWith("/pipeline/"))}
        >
          <Trello className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
          {collapsed ? <span className="sr-only">Funil de vendas</span> : "Funil de vendas"}
        </Link>

        <Link
          href="/produtos"
          prefetch={true}
          title={collapsed ? "Produtos" : undefined}
          className={linkClass(pathname === "/produtos" || pathname.startsWith("/produtos/"))}
        >
          <Package className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
          {collapsed ? <span className="sr-only">Produtos</span> : "Produtos"}
        </Link>

        <Link
          href="/contacts"
          prefetch={true}
          title={collapsed ? "Contatos" : undefined}
          className={linkClass(pathname === "/contacts" || pathname.startsWith("/contacts/"))}
        >
          <Users className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
          {collapsed ? <span className="sr-only">Contatos</span> : "Contatos"}
        </Link>

        <Link
          href="/dashboard"
          prefetch={true}
          title={collapsed ? "Dashboard" : undefined}
          className={linkClass(pathname === "/dashboard" || pathname.startsWith("/dashboard/"))}
        >
          <LayoutGrid className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
          {collapsed ? <span className="sr-only">Dashboard</span> : "Dashboard"}
        </Link>

        <Link
          href="/settings"
          prefetch={true}
          title={collapsed ? "Configurações" : undefined}
          className={linkClass(pathname === "/settings" || pathname.startsWith("/settings/"))}
        >
          <Settings2 className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
          {collapsed ? <span className="sr-only">Configurações</span> : "Configurações"}
        </Link>

        {researchEnabled ? (
          <Link
            href="/pesquisa"
            prefetch={true}
            title={collapsed ? "Pesquisa" : undefined}
            className={linkClass(pathname === "/pesquisa" || pathname.startsWith("/pesquisa/"))}
          >
            <Search className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
            {collapsed ? <span className="sr-only">Pesquisa</span> : "Pesquisa"}
          </Link>
        ) : null}

        {isSuperAdmin ? (
          <Link
            href="/admin"
            prefetch={true}
            title={collapsed ? "Admin" : undefined}
            className={linkClass(pathname.startsWith("/admin"))}
          >
            <Shield className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
            {collapsed ? <span className="sr-only">Admin</span> : "Admin"}
          </Link>
        ) : null}
      </nav>
      <div className="shrink-0 border-t border-border/40 dark:border-border/30">
        <div className="px-1.5 py-2">
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
