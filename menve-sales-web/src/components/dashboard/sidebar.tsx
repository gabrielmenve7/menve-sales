"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, type ComponentType } from "react";
import {
  Bot,
  ChevronsRight,
  Inbox,
  Kanban,
  LayoutGrid,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Send,
  Shield,
  Star,
  Users,
  Search,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAccountMenu } from "@/components/dashboard/user-account-menu";

type InboxSubItem = {
  href: string;
  label: string;
  canal: string | null;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClassName: string;
};

const inboxSubItems: InboxSubItem[] = [
  {
    href: "/inbox",
    label: "Geral",
    canal: null,
    Icon: Mail,
    iconClassName: "text-muted-foreground",
  },
  {
    href: "/inbox?canal=instagram",
    label: "Instagram",
    canal: "instagram",
    Icon: Send,
    iconClassName: "text-[#E4405F]",
  },
  {
    href: "/inbox?canal=api-oficial",
    label: "API Oficial",
    canal: "api-oficial",
    Icon: Phone,
    iconClassName: "text-[#2563eb]",
  },
  {
    href: "/inbox?canal=grupos",
    label: "Grupos",
    canal: "grupos",
    Icon: MessageCircle,
    iconClassName: "text-[#16a34a]",
  },
  {
    href: "/inbox?canal=pessoal",
    label: "Pessoal",
    canal: "pessoal",
    Icon: Star,
    iconClassName: "text-[#d97706]",
  },
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
  const searchParams = useSearchParams();
  const [inboxOpen, setInboxOpen] = useState(true);

  const inboxCanal = searchParams.get("canal");

  const isInboxRoute = pathname === "/inbox" || pathname.startsWith("/inbox/");

  const subActive = useCallback(
    (canal: string | null) => {
      if (!isInboxRoute) return false;
      if (canal === null) return !inboxCanal || inboxCanal === "geral";
      return inboxCanal === canal;
    },
    [inboxCanal, isInboxRoute],
  );

  const linkClass = (
    active: boolean,
    opts?: { nested?: boolean; muted?: boolean },
  ) =>
    cn(
      "flex items-center rounded-lg text-[15px] font-medium leading-snug transition-colors",
      collapsed && !opts?.nested
        ? "justify-center px-2 py-2.5"
        : opts?.nested
          ? "gap-2.5 py-2 pr-2"
          : "gap-3 px-3 py-2",
      opts?.nested ? "pl-2" : null,
      active
        ? "bg-neutral-200/90 font-semibold text-foreground dark:bg-white/[0.14] dark:text-white"
        : cn(
            opts?.muted
              ? "text-muted-foreground/90 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]"
              : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.08] dark:hover:text-white",
          ),
    );

  const renderMainNav = () => (
    <>
      {!collapsed ? (
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[15px] font-medium transition-colors",
              isInboxRoute
                ? "text-foreground"
                : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.08]",
            )}
            onClick={() => setInboxOpen((o) => !o)}
            aria-expanded={inboxOpen}
          >
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                !inboxOpen && "-rotate-90",
              )}
              strokeWidth={2}
            />
            <Inbox className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span>Inbox</span>
          </button>
          {inboxOpen ? (
            <div className="relative ml-4 border-l border-border/70 pl-3 dark:border-border/50">
              <div className="flex flex-col gap-0.5">
                {inboxSubItems.map(({ href, label, canal, Icon, iconClassName }) => (
                  <Link
                    key={href}
                    href={href}
                    prefetch={true}
                    className={linkClass(subActive(canal), { nested: true })}
                  >
                    <Icon
                      className={cn("size-[17px] shrink-0", iconClassName)}
                      strokeWidth={1.75}
                    />
                    {label}
                  </Link>
                ))}
                <Link
                  href="/settings?tab=channels"
                  prefetch={true}
                  className={linkClass(false, { nested: true, muted: true })}
                >
                  <Plus
                    className="size-[17px] shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  Nova inbox
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <Link
          href="/inbox"
          prefetch={true}
          title="Inbox"
          className={linkClass(isInboxRoute)}
        >
          <Inbox className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
          <span className="sr-only">Inbox</span>
        </Link>
      )}

      <Link
        href="/pipeline"
        prefetch={true}
        title={collapsed ? "Pipelines" : undefined}
        className={linkClass(pathname === "/pipeline" || pathname.startsWith("/pipeline/"))}
      >
        <Kanban className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
        {collapsed ? <span className="sr-only">Pipelines</span> : "Pipelines"}
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
        href="/agentes"
        prefetch={true}
        title={collapsed ? "Agentes IA" : undefined}
        className={linkClass(pathname === "/agentes" || pathname.startsWith("/agentes/"))}
      >
        <Bot className="size-[18px] shrink-0 opacity-95" strokeWidth={1.75} />
        {collapsed ? <span className="sr-only">Agentes IA</span> : "Agentes IA"}
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
    </>
  );

  return (
    <aside className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border-0 bg-sidebar text-foreground ring-0">
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2",
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
        {renderMainNav()}
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
