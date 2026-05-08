"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import {
  WorkspaceSwitcher,
  type WorkspaceSwitcherTenant,
} from "@/components/dashboard/workspace-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeftClose } from "lucide-react";

const LS_WIDTH = "menve.sidebar.width";
const LS_COLLAPSED = "menve.sidebar.collapsed";

/** Largura padrão alinhada à referência visual (~260px). */
const WIDTH_DEFAULT = 268;
const WIDTH_MIN = 240;
const WIDTH_MAX = 456;
const WIDTH_COLLAPSED = 96;
const RESIZE_HANDLE_W = 10;

function readStoredWidth(): number {
  if (typeof window === "undefined") return WIDTH_DEFAULT;
  const raw = localStorage.getItem(LS_WIDTH);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return WIDTH_DEFAULT;
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, n));
}

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LS_COLLAPSED) === "1";
}

export function DashboardShell({
  children,
  tenant,
  workspaces = [],
  isSuperAdmin,
  researchEnabled,
  userName,
  userEmail,
  userImage,
}: {
  children: React.ReactNode;
  tenant: WorkspaceSwitcherTenant;
  workspaces?: WorkspaceSwitcherTenant[];
  isSuperAdmin: boolean;
  researchEnabled: boolean;
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(WIDTH_DEFAULT);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(WIDTH_DEFAULT);

  useEffect(() => {
    setMounted(true);
    setSidebarWidth(readStoredWidth());
    setCollapsed(readStoredCollapsed());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(LS_COLLAPSED, collapsed ? "1" : "0");
  }, [collapsed, mounted]);

  useEffect(() => {
    if (!mounted || collapsed) return;
    localStorage.setItem(LS_WIDTH, String(Math.round(sidebarWidth)));
  }, [sidebarWidth, collapsed, mounted]);

  const setCollapsedSafe = useCallback((next: boolean) => {
    setCollapsed(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (
        !isMod ||
        (e.key !== "\\" && e.code !== "Backslash" && e.code !== "IntlBackslash")
      ) {
        return;
      }
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed) return;
      e.preventDefault();
      resizing.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [collapsed, sidebarWidth],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!resizing.current) return;
      const dx = e.clientX - startX.current;
      const next = Math.min(
        WIDTH_MAX,
        Math.max(WIDTH_MIN, startWidth.current + dx),
      );
      setSidebarWidth(next);
    };
    const up = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, []);

  const onResizeDoubleClick = useCallback(() => {
    if (collapsed) return;
    setSidebarWidth(WIDTH_DEFAULT);
    localStorage.setItem(LS_WIDTH, String(WIDTH_DEFAULT));
  }, [collapsed]);

  const outerWidth = collapsed ? WIDTH_COLLAPSED : sidebarWidth;

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden bg-background">
      <div
        className={cn(
          "relative flex h-full shrink-0 flex-col bg-transparent",
          "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
        )}
        style={{ width: outerWidth }}
      >
        <div
          className={cn(
            "shrink-0 border-b border-border/40 dark:border-border/30",
            collapsed ? "px-1.5 pb-2 pt-6 md:pt-7" : "px-3 pb-3 pt-6 md:pt-7",
          )}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <WorkspaceSwitcher
                tenant={tenant}
                workspaces={workspaces}
                compactIconOnly
                className="w-full shrink-0"
              />
            </div>
          ) : (
            <div className="flex min-w-0 items-start gap-1.5">
              <WorkspaceSwitcher
                tenant={tenant}
                workspaces={workspaces}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="mt-0.5 size-9 shrink-0 rounded-md border-border/50 bg-transparent shadow-none hover:bg-muted/70 dark:border-border/40"
                aria-label="Recolher barra lateral"
                title="Recolher barra lateral"
                onClick={() => setCollapsedSafe(true)}
              >
                <PanelLeftClose className="size-[18px] opacity-85" strokeWidth={2} />
              </Button>
            </div>
          )}
        </div>

        <Sidebar
          isSuperAdmin={isSuperAdmin}
          userName={userName}
          userEmail={userEmail}
          userImage={userImage}
          researchEnabled={researchEnabled}
          collapsed={collapsed}
          onRequestExpand={() => setCollapsedSafe(false)}
        />

        {!collapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar barra lateral"
            title="Fechar: Ctrl+\u00A0· Redimensionar: arrastar · Largura padrão: clique duplo"
            className={cn(
              "absolute right-0 top-0 z-20 flex h-full cursor-col-resize items-stretch justify-center",
              "touch-none select-none",
            )}
            style={{
              width: RESIZE_HANDLE_W,
              marginRight: -(RESIZE_HANDLE_W / 2),
            }}
            onPointerDown={onResizePointerDown}
            onDoubleClick={onResizeDoubleClick}
          >
            <span
              className="my-auto h-[min(40%,120px)] w-px rounded-full bg-border/70 dark:bg-border/50"
              aria-hidden
            />
          </div>
        ) : null}
      </div>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-4 md:p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/45 bg-card shadow-sm dark:border-border/50">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
