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
}: {
  isSuperAdmin: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  researchEnabled?: boolean;
}) {
  const pathname = usePathname();
  const nameTrim = (userName ?? "").trim();
  const emailTrim = (userEmail ?? "").trim();
  const displayName = nameTrim || emailTrim || "Usuário";
  const subEmail = nameTrim && emailTrim ? emailTrim : null;

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
      <div className="shrink-0 border-t border-border/40 dark:border-border/30">
        <div className="space-y-3 p-3">
          <div className="flex gap-2.5">
            <div
              className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/50 text-[14px] font-semibold text-foreground dark:border-border/50"
              aria-hidden={!!userImage}
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
          </div>

          <div className="space-y-1.5">
            <p className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Aparência
            </p>
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
          </div>

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
