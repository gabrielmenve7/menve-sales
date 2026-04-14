"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  LogOut,
  Moon,
  Sun,
  UserRoundPen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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

export function UserAccountMenu({
  collapsed,
  userName,
  userEmail,
  userImage,
}: {
  collapsed: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nameTrim = (userName ?? "").trim();
  const emailTrim = (userEmail ?? "").trim();
  const displayName = nameTrim || emailTrim || "Usuário";
  const subEmail = nameTrim && emailTrim ? emailTrim : null;

  const resolvedTheme = mounted ? theme : "light";

  const avatar = (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-muted/50 font-semibold text-foreground dark:border-border/50",
        collapsed ? "size-11 text-[14.5px]" : "size-12 text-[17px]",
      )}
    >
      {userImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={userImage}
          alt=""
          className="size-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span aria-hidden>{userInitial(userName, userEmail)}</span>
      )}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-auto w-full gap-0 rounded-xl border border-transparent px-2 py-1.5 text-left hover:bg-foreground/[0.05] dark:hover:bg-white/[0.06]",
            collapsed
              ? "flex flex-col items-center justify-center p-1"
              : "flex items-center gap-2.5",
          )}
          aria-label="Menu da conta"
        >
          {avatar}
          {!collapsed ? (
            <>
              <div className="min-w-0 flex-1 pt-0.5 text-left">
                <p className="truncate text-[15.6px] font-medium leading-tight text-foreground">
                  {displayName}
                </p>
                {subEmail ? (
                  <p className="mt-0.5 truncate text-left text-[13.2px] text-muted-foreground">
                    {subEmail}
                  </p>
                ) : null}
              </div>
              <ChevronDown className="size-[18px] shrink-0 text-muted-foreground opacity-70" />
            </>
          ) : (
            <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-70" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72 max-h-[min(85vh,560px)] overflow-y-auto"
        side={collapsed ? "right" : "top"}
        align="start"
        sideOffset={8}
      >
        <DropdownMenuItem asChild>
          <Link href="/perfil" className="flex cursor-pointer items-center gap-2">
            <UserRoundPen className="size-4 opacity-80" />
            Editar perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Aparência
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={resolvedTheme === "light" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setTheme("light")}
            >
              <Sun className="size-3.5" />
              Claro
            </Button>
            <Button
              type="button"
              variant={resolvedTheme === "dark" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setTheme("dark")}
            >
              <Moon className="size-3.5" />
              Escuro
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-destructive focus:text-destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
