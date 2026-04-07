"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "compact";
}) {
  const isClient = useIsClient();
  const { theme, setTheme } = useTheme();

  if (!isClient) {
    return (
      <div
        className={cn(
          variant === "compact"
            ? "flex h-[5.5rem] w-8 rounded-md border border-border/50 bg-muted/20"
            : "flex h-8 w-[5.5rem] rounded-md border border-border/50 bg-muted/20",
          className,
        )}
        aria-hidden
      />
    );
  }

  const isCompact = variant === "compact";

  return (
    <div
      className={cn(
        isCompact
          ? "inline-flex w-8 flex-col items-stretch rounded-md border border-border/60 bg-muted/30 p-0.5"
          : "inline-flex h-8 items-center rounded-md border border-border/60 bg-muted/30 p-0.5",
        className,
      )}
      role="group"
      aria-label="Tema da interface"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          isCompact ? "h-7 w-full rounded-sm" : "h-7 w-7 rounded-sm",
          theme === "light" && "bg-background shadow-sm",
        )}
        onClick={() => setTheme("light")}
        aria-label="Modo claro"
      >
        <Sun className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          isCompact ? "h-7 w-full rounded-sm" : "h-7 w-7 rounded-sm",
          theme === "system" && "bg-background shadow-sm",
        )}
        onClick={() => setTheme("system")}
        aria-label="Seguir o sistema"
      >
        <Monitor className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          isCompact ? "h-7 w-full rounded-sm" : "h-7 w-7 rounded-sm",
          theme === "dark" && "bg-background shadow-sm",
        )}
        onClick={() => setTheme("dark")}
        aria-label="Modo escuro"
      >
        <Moon className="size-3.5" />
      </Button>
    </div>
  );
}
